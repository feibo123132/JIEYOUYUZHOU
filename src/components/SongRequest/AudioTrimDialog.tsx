import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight, Check, Flag, MessageSquarePlus, Minus, Pause, Pencil, Play, Redo2, RotateCcw, Scissors, Trash2,
  Undo2, Volume2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  createSamplePeakReader, formatDuration, getAudioContext, measureSamplePeak, sampleHeadroomDb, type ReadSamplePeak,
} from './audioClipping';
import {
  adjustGainRange, clampGainDb, dbToGain, DEFAULT_RECORDING_GAIN, MAX_GAIN_DB, MAX_GAIN_RANGES, MIN_GAIN_DB,
  resolveGainSegments, sameRecordingGain, scheduleAudioGain, type RecordingGain,
} from './audioGain';
import {
  AUDIO_MARKER_COLORS, audioMarkerEnd, DEFAULT_AUDIO_MARKER_COLOR, isAudioMarkerSpan, MIN_AUDIO_MARKER_SPAN,
  normalizeAudioMarkers, type AudioMarker,
} from './audioMarkers';
import {
  isRecordingScore, parseRecordingScoreInput, RECORDING_SCORE_MAX, RECORDING_SCORE_MIN,
  keptDuration, normalizeAudioCuts, resolveKeptSegments, type AudioCut,
} from './songRecordings';
import { getMatchQuality } from './songRecords';

interface AudioTrimDialogProps {
  recordingTitle: string;
  buffer: AudioBuffer;
  initialStart: number;
  initialEnd: number;
  initialCuts?: AudioCut[];
  initialGain?: RecordingGain;
  initialMarkers: AudioMarker[];
  noteStorageKey: string;
  /** 这段录音已评过的录音指数（70–100），没评过就不传。 */
  initialScore?: number;
  /** 录音指数落库：null 表示清空评分。会在失焦、回车、关闭或保存时提交。 */
  onScoreChange?: (score: number | null) => void;
  /** 点「录音榜」：先落库评分，再交给父级跳到录音榜（会卸载详情页，未保存的裁剪需要提醒）。 */
  onOpenRecordingBoard?: () => void;
  minimized: boolean;
  onMinimize: () => void;
  saving?: boolean;
  onCancel: () => void;
  onSave: (clip: { start: number; end: number; cuts: AudioCut[]; gain?: RecordingGain; markers?: AudioMarker[] }) => boolean;
}

type EditMode = 'range' | 'cut' | 'gain';
type Boundary = keyof AudioCut;
type CutDraft = Partial<AudioCut> & { original?: AudioCut };
/** 一步可撤回的编辑：删段和两个增益放在同一摞历史里，撤回才知道该退哪一步。 */
type EditSnapshot = { cuts: AudioCut[]; gain: RecordingGain };
/** 同一手势内的连续改动合并成一步，免得拖一次滑块塞满几十条历史。 */
const GESTURE_MERGE_MS = 900;
const HISTORY_LIMIT = 80;

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', '']);
/**
 * 焦点是否停在原生表单控件上（滑块、数字框、勾选框、下拉）。
 * 这些控件的方向键 / Home / End / Backspace 有自己的含义，不能被弹窗快捷键抢走；
 * 但 Ctrl+Z、Ctrl+S、M 仍然归弹窗。
 */
const isFormControlTarget = (target: HTMLElement | null) => Boolean(
  target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'),
);

/**
 * 这个焦点是不是「会打字的控件」：是的话 Ctrl+Z / Ctrl+Y 交给浏览器原生撤回。
 * 滑块（range）、数字框（number）、按钮都不算，撤销仍然作用于裁剪与两个增益。
 */
const isTextEntryTarget = (target: HTMLElement | null) => {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA') return true;
  if (target.tagName !== 'INPUT') return false;
  return TEXT_INPUT_TYPES.has((target as HTMLInputElement).type.toLowerCase());
};

const HANDLE_HIT_PX = 14;
const MIN_CLIP_SECONDS = 0.05;
const MIN_VIEW_SECONDS = 0.4;
const CUT_PAN_EDGE_PX = 24;
const CUT_PAN_SPANS_PER_SECOND = 0.6;
const METER_FLOOR_DB = -60;
const METER_TICKS = [-60, -48, -36, -24, -18, -12, -6, 0];
const METER_GRADIENT = 'linear-gradient(90deg, #34d399 70%, #facc15 70%, #facc15 90%, #f87171 90%)';
const CLIP_COLOR = '#fb5252';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const levelPercent = (db: number) => (clamp(db, METER_FLOOR_DB, 0) - METER_FLOOR_DB) / -METER_FLOOR_DB * 100;
const emptyLevels = (count: number) => Array.from({ length: count }, () => ({ db: -Infinity, peak: -Infinity }));
const formatGain = (db: number) => `${db > 0 ? '+' : ''}${db} dB`;

const PeakHeadroom = ({ peak }: { peak: number | null }) => {
  if (peak === null) return <span className="text-xs text-white/55">无保留音频</span>;
  if (peak === 0) return <span className="text-xs text-white/55">静音 · 无峰值限制</span>;
  const extraDb = sampleHeadroomDb(peak);
  const remaining = extraDb < 0 ? `至少降低 ${-extraDb} dB` : extraDb === 0 ? '余量不足 0.1 dB' : `还能加 ${formatGain(extraDb)}`;
  return (
    <span className={`text-xs tabular-nums ${peak >= 1 ? 'text-red-300' : 'text-sky-100/85'}`}
      title="按已应用增益和所有声道的采样峰值计算，以 0.1 dB 为步进，保持低于 0 dBFS">
      峰值 {(20 * Math.log10(peak)).toFixed(1)} dBFS · {remaining}
    </span>
  );
};

const GainControl = ({ label, db, onChange, compact = false }: {
  label: string; db: number; onChange: (value: number) => void; compact?: boolean;
}) => {
  const [input, setInput] = useState<string | null>(null);
  const update = (value: number) => onChange(Math.round(clampGainDb(value) * 10) / 10);
  // 数值框里可能留着上次键入的草稿；一旦增益被外部改动（撤回 / 重做 / 拖滑块），
  // 草稿就过期了——继续显示它会让「撤回后一失焦又把它写回去」。
  useEffect(() => { setInput(null); }, [db]);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs font-medium text-white/75">{label}</span>
      <input type="range" min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={0.1} value={db}
        aria-label={label} aria-valuetext={formatGain(db)}
        onChange={event => update(event.currentTarget.valueAsNumber)}
        className={`min-w-[3rem] accent-sky-300 ${compact ? 'w-20 sm:w-24' : 'w-24 sm:w-36'}`} />
      <input type="number" min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={0.1} value={input ?? db}
        aria-label={`${label} dB 数值`}
        onChange={event => {
          const field = event.currentTarget;
          setInput(field.value);
          if (field.valueAsNumber >= MIN_GAIN_DB && field.valueAsNumber <= MAX_GAIN_DB) update(field.valueAsNumber);
        }}
        onBlur={event => {
          if (Number.isFinite(event.currentTarget.valueAsNumber)) update(event.currentTarget.valueAsNumber);
          setInput(null);
        }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        className={`h-8 rounded-lg border border-white/15 bg-black/40 px-2 text-right font-mono text-xs text-white ${compact ? 'w-14' : 'w-[4.5rem]'}`} />
      <span className="text-[11px] text-white/50">dB</span>
    </div>
  );
};

const RecordingNote = ({ storageKey }: { storageKey: string }) => {
  const [note, setNote] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  const [saveFailed, setSaveFailed] = useState(false);

  return (
    <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2 py-0.5">
      <span className="shrink-0 pt-1.5 text-xs font-medium text-white/65">留言</span>
      <textarea rows={1} value={note} placeholder="简单记一下想法…"
        className="min-h-7 w-full min-w-0 resize-y rounded-md bg-transparent px-2 py-1.5 text-xs leading-4 text-white/85 outline-none placeholder:text-white/35 focus-visible:ring-1 focus-visible:ring-sky-200/50"
        onChange={event => {
          const value = event.currentTarget.value;
          setNote(value);
          try {
            if (value) window.localStorage.setItem(storageKey, value);
            else window.localStorage.removeItem(storageKey);
            setSaveFailed(false);
          } catch {
            setSaveFailed(true);
          }
        }}
      />
      {saveFailed && <span role="status" className="max-w-24 pt-1.5 text-xs text-red-200">留言未能保存到本机</span>}
    </label>
  );
};

/** 录音指数：70–100 打分 + 自动档次，和练习页四大指数同一套刻度，放在留言框左侧。 */
const RecordingScoreField = ({
  draft, quality, onChange, onCommit,
}: {
  draft: string;
  quality: ReturnType<typeof getMatchQuality>;
  onChange: (value: string) => void;
  onCommit: () => void;
}) => (
  <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-2 py-0.5 focus-within:border-orange-200/30">
    <span className="shrink-0 text-xs font-medium text-white/65">录音指数</span>
    <input
      type="number" inputMode="numeric" min={RECORDING_SCORE_MIN} max={RECORDING_SCORE_MAX} step={1}
      value={draft} placeholder="未评" aria-label={`录音指数（${RECORDING_SCORE_MIN}–${RECORDING_SCORE_MAX}）`}
      title={`录音指数 ${RECORDING_SCORE_MIN}–${RECORDING_SCORE_MAX} 的整数，留空表示这段还没评`}
      onChange={event => onChange(event.currentTarget.value)}
      onBlur={onCommit}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
      className="h-7 w-14 shrink-0 rounded-md border border-white/12 bg-black/40 px-1.5 text-right font-mono text-xs tabular-nums text-white outline-none placeholder:text-white/30 focus-visible:border-orange-200/45 focus-visible:ring-1 focus-visible:ring-orange-200/35"
    />
    <em title={quality ? `按录音指数换算：${quality.label}` : '还没评录音指数'} className={`practice-quality shrink-0 opacity-90 ${quality?.tone ?? 'white'}`}>
      {quality?.label ?? '—'}
    </em>
  </div>
);

const markerTimeLabel = (time: number) => {
  const milliseconds = Math.round(time * 1000);
  return `${formatDuration(Math.floor(milliseconds / 1000))}.${String(milliseconds % 1000).padStart(3, '0')}`;
};

const boundaryLimits = (field: Boundary, range: Partial<AudioCut>, min: number, max: number) => (
  field === 'start'
    ? { min, max: Math.max(min, (range.end ?? max) - MIN_CLIP_SECONDS) }
    : { min: Math.min(max, (range.start ?? min) + MIN_CLIP_SECONDS), max }
);

const sameEditSnapshot = (left: EditSnapshot, right: EditSnapshot) => (
  left.cuts.length === right.cuts.length
  && left.cuts.every((cut, index) => cut.start === right.cuts[index].start && cut.end === right.cuts[index].end)
  && sameRecordingGain(left.gain, right.gain)
);

const prepareWaveform = (canvas: HTMLCanvasElement) => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return null;
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
};

const drawWaveformBars = (
  context: CanvasRenderingContext2D, left: number, width: number, height: number, readPeak: ReadSamplePeak,
  span: AudioCut, colorAt: (x: number) => string, multiplier: number, keptRange: AudioCut,
) => {
  const columnStep = 2;
  const secondsPerPixel = (span.end - span.start) / width;
  for (let x = 0; x < width; x += columnStep) {
    const from = span.start + x * secondsPerPixel;
    const to = x + columnStep >= width ? span.end : span.start + (x + columnStep) * secondsPerPixel;
    const amplitude = readPeak(from, to) * multiplier;
    const barHeight = Math.max(1, Math.min(1, amplitude) * height * 0.86);
    const barWidth = Math.min(columnStep - 1, width - x);
    const top = (height - barHeight) / 2;
    context.fillStyle = colorAt(left + x);
    context.fillRect(left + x, top, barWidth, barHeight);
    if (amplitude < 1) continue;
    const keptFrom = Math.max(from, keptRange.start);
    const keptTo = Math.min(to, keptRange.end);
    const keptPeak = keptFrom === from && keptTo === to ? amplitude : readPeak(keptFrom, keptTo) * multiplier;
    if (keptPeak < 1) continue;
    const capHeight = Math.min(5, height * 0.15);
    context.fillStyle = CLIP_COLOR;
    context.fillRect(left + x, top, barWidth, capHeight);
    context.fillRect(left + x, top + barHeight - capHeight, barWidth, capHeight);
  }
};

// Keep edits and markers in source seconds. The waveform uses seconds after the applied cuts.
const buildWaveformTimeline = (cuts: AudioCut[], duration: number) => {
  const segments: Array<AudioCut & { offset: number }> = [];
  let sourceStart = 0;
  let length = 0;
  for (const cut of [...normalizeAudioCuts(cuts, 0, duration), { start: duration, end: duration }]) {
    if (cut.start > sourceStart) {
      segments.push({ start: sourceStart, end: cut.start, offset: length });
      length += cut.start - sourceStart;
    }
    sourceStart = cut.end;
  }
  const toDisplay = (time: number) => {
    const segment = segments.find(part => time <= part.end);
    return segment ? segment.offset + Math.max(0, time - segment.start) : length;
  };
  const toSource = (time: number, preferLeft = false) => {
    const target = clamp(time, 0, length);
    for (const part of segments) {
      const end = part.offset + (part.end - part.start);
      if (target < end || (preferLeft && target === end)) {
        return clamp(part.start + (target - part.offset), part.start, part.end);
      }
    }
    return segments[segments.length - 1]?.end ?? 0;
  };
  return { length, segments, toDisplay, toSource, contains: (time: number) => segments.some(part => time >= part.start && time <= part.end) };
};

const drawJoinedWaveform = (
  context: CanvasRenderingContext2D, width: number, height: number, readPeak: ReadSamplePeak,
  timeline: ReturnType<typeof buildWaveformTimeline>, viewStart: number, viewEnd: number,
  colorAt: (x: number) => string, gain: RecordingGain, keptRange: AudioCut,
) => {
  if (viewEnd <= viewStart) return;
  const pixelsPerSecond = width / (viewEnd - viewStart);
  for (const part of timeline.segments) {
    const from = Math.max(viewStart, part.offset);
    const to = Math.min(viewEnd, part.offset + (part.end - part.start));
    if (to <= from) continue;
    const sourceFrom = part.start + (from - part.offset);
    const sourceTo = part.start + (to - part.offset);
    for (const span of resolveGainSegments({ start: sourceFrom, end: sourceTo }, gain.ranges)) {
      const left = (from - viewStart + (span.start - sourceFrom)) * pixelsPerSecond;
      drawWaveformBars(context, left, (span.end - span.start) * pixelsPerSecond, height, readPeak, span,
        colorAt, dbToGain(gain.overallDb + span.db), keptRange);
    }
  }
};

const AudioTrimDialog = ({
  recordingTitle, buffer, initialStart, initialEnd, initialCuts = [], initialGain = DEFAULT_RECORDING_GAIN,
  initialMarkers, noteStorageKey, initialScore, onScoreChange, onOpenRecordingBoard, minimized, onMinimize,
  saving = false, onCancel, onSave,
}: AudioTrimDialogProps) => {
  const duration = buffer.duration;
  const readPeak = useMemo(() => createSamplePeakReader(buffer), [buffer]);

  const [start, setStart] = useState(() => clamp(initialStart, 0, Math.max(0, duration - MIN_CLIP_SECONDS)));
  const [end, setEnd] = useState(() => clamp(initialEnd, start + MIN_CLIP_SECONDS, duration));
  // 删段与两个增益共用一摞历史：撤回时才知道该退的是哪一次操作。
  const [history, setHistory] = useState(() => ({
    entries: [{ cuts: normalizeAudioCuts(initialCuts, start, end), gain: initialGain }] as EditSnapshot[],
    index: 0,
    gesture: { key: '', at: 0 },
  }));
  const { cuts, gain } = history.entries[history.index];
  const canUndo = history.index > 0;
  const canRedo = history.index < history.entries.length - 1;
  const [mode, setMode] = useState<EditMode>('cut');
  const overallDbRef = useRef(gain.overallDb);
  overallDbRef.current = gain.overallDb;
  const [selectionDb, setSelectionDb] = useState(0);
  const [gainError, setGainError] = useState('');
  const [cutDraft, setCutDraft] = useState<CutDraft | null>(null);
  const [gainDraft, setGainDraft] = useState<CutDraft | null>(null);
  const intervalDraft = mode === 'gain' ? gainDraft : cutDraft;
  const setIntervalDraft = mode === 'gain' ? setGainDraft : setCutDraft;
  const [boundaryInput, setBoundaryInput] = useState<{ field: Boundary; text: string } | null>(null);
  const [view, setView] = useState<{ sourceStart: number; span: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const meterChannels = Math.min(2, buffer.numberOfChannels);
  const [levels, setLevels] = useState(() => emptyLevels(meterChannels));
  // 播放指针：可点击/拖拽/键盘定位，试听从这里开始。
  const [playhead, setPlayhead] = useState<number>(() => clamp(initialStart, 0, duration));
  const [markers, setMarkers] = useState(() => normalizeAudioMarkers(initialMarkers, duration));
  const [editingMarkerTime, setEditingMarkerTime] = useState<number | null>(null);
  // 拖动标记旗标：草稿只活在本地，松手才写回 markers（时间就是身份，拖一次就换 key 会导致指针捕获丢失）。
  // 区间评论有两头，edge 记住这次拖的是起点还是终点。
  const [markerDrag, setMarkerDrag] = useState<{
    time: number; draft: number; moved: boolean; edge: 'start' | 'end';
  } | null>(null);
  const markerDragOriginX = useRef(0);
  const editingMarker = markers.find(marker => marker.time === editingMarkerTime);
  // 编辑器里显示的区间：拖动中跟着草稿走，否则用落库的值。
  const editingDrag = markerDrag && editingMarker && markerDrag.time === editingMarker.time ? markerDrag : null;
  const editingIsSpan = Boolean(editingMarker && isAudioMarkerSpan(editingMarker));
  const editingStart = editingDrag?.edge === 'start' ? editingDrag.draft : editingMarker?.time ?? 0;
  const editingEnd = editingIsSpan
    ? (editingDrag?.edge === 'end' ? editingDrag.draft : editingMarker!.end!)
    : editingStart;
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState({ start, end, cuts, gain, markers, confirmed: false });
  // 录音指数：输入框里留着原始文本（方便删空重打），失焦 / 回车 / 关闭 / 保存时再落库。
  const [scoreDraft, setScoreDraft] = useState(() => (isRecordingScore(initialScore) ? String(initialScore) : ''));
  // 记住上一次真正提交的值：父组件的 trimming 是快照，不能拿 initialScore 判断「改回去没」。
  const scoreCommittedRef = useRef<number | null>(isRecordingScore(initialScore) ? initialScore : null);
  const scoreQuality = getMatchQuality(parseRecordingScoreInput(scoreDraft) ?? NaN);
  const commitScore = useCallback(() => {
    const next = parseRecordingScoreInput(scoreDraft);
    // 越界或非整数直接回弹成合法值，避免把 101 这类输入存进去。
    setScoreDraft(next === null ? '' : String(next));
    if (next === scoreCommittedRef.current) return;
    scoreCommittedRef.current = next;
    onScoreChange?.(next);
  }, [onScoreChange, scoreDraft]);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const markerEditorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    markerEditorRef.current?.focus();
  }, [editingMarkerTime]);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewGrabOffset = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const previewGainRef = useRef<{ local: GainNode; overall: GainNode } | null>(null);
  const previewVersionRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const playbackRef = useRef<{
    startedAt: number;
    total: number;
    timeline: Array<{ at: number; from: number; duration: number }>;
  } | null>(null);
  const dragRef = useRef<{
    mode: 'start' | 'end' | 'move' | 'create' | 'playhead';
    originX: number;
    originStart: number;
    originEnd: number;
    anchorTime: number;
  } | null>(null);
  const tapRef = useRef<{ time: number; moved: boolean; canRelocate: boolean } | null>(null);
  const cutPanRef = useRef<{ direction: -1 | 1; frame: number } | null>(null);

  const timeline = useMemo(() => buildWaveformTimeline(cuts, duration), [cuts, duration]);
  const viewSpan = Math.min(view?.span ?? timeline.length, timeline.length);
  const maxViewStart = timeline.length - viewSpan;
  const viewStart = view ? clamp(timeline.toDisplay(view.sourceStart), 0, maxViewStart) : 0;
  const viewEnd = viewStart + viewSpan;
  const timeAtX = (x: number, width: number) => timeline.toSource(viewStart + (x / Math.max(1, width)) * viewSpan);
  const xAtTime = useCallback((time: number, width: number) => viewSpan > 0
    ? ((timeline.toDisplay(time) - viewStart) / viewSpan) * width : 0, [timeline, viewStart, viewSpan]);

  const visibleCuts = useMemo(() => normalizeAudioCuts(cuts, start, end), [cuts, start, end]);
  const retainedSegments = useMemo(() => resolveKeptSegments(start, end, cuts), [start, end, cuts]);
  const overallPeak = useMemo(() => retainedSegments.length ? measureSamplePeak(readPeak, retainedSegments, gain) : null,
    [readPeak, retainedSegments, gain]);
  const kept = useMemo(() => keptDuration(start, end, cuts), [start, end, cuts]);
  const selection = useMemo(() => {
    if (intervalDraft?.start === undefined || intervalDraft.end === undefined) return null;
    if (mode !== 'gain') return { start: intervalDraft.start, end: intervalDraft.end };
    const from = Math.max(start, intervalDraft.start);
    const to = Math.min(end, intervalDraft.end);
    return to > from ? { start: from, end: to } : null;
  }, [intervalDraft, mode, start, end]);
  const selectedSegments = useMemo(() => {
    if (mode !== 'gain' || !selection) return [];
    return retainedSegments.flatMap(part => {
      const from = Math.max(part.start, selection.start);
      const to = Math.min(part.end, selection.end);
      return to > from ? [{ start: from, end: to }] : [];
    });
  }, [mode, selection, retainedSegments]);
  const selectedPeak = useMemo(() => selectedSegments.length ? measureSamplePeak(readPeak, selectedSegments, gain) : null,
    [readPeak, selectedSegments, gain]);
  const selectedGainSummary = useMemo(() => {
    if (!selectedSegments.length) return null;
    const values = selectedSegments.flatMap(part => resolveGainSegments(part, gain.ranges).map(({ db }) => db));
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      label: min === max ? formatGain(min) : `${formatGain(min)} 至 ${formatGain(max)}`,
      hasGain: min !== 0 || max !== 0,
    };
  }, [selectedSegments, gain.ranges]);
  const originalCut = cutDraft?.original;
  const selectedCutIndex = originalCut
    ? visibleCuts.findIndex((cut) => cut.start === originalCut.start && cut.end === originalCut.end)
    : -1;
  const canApplyCut = Boolean(selection && selection.end - selection.start > 0.01
    && (!originalCut || selection.start !== originalCut.start || selection.end !== originalCut.end));
  const canApplyGain = selectedSegments.some(part => part.end - part.start > 0.01);
  // 片段评论要求选区有一定长度，否则画不出虚线框、也没法再拖。
  const canCommentSelection = Boolean(selection && selection.end - selection.start >= MIN_AUDIO_MARKER_SPAN);
  const canSave = kept >= MIN_CLIP_SECONDS;

  const stopPlayback = useCallback(() => {
    previewVersionRef.current += 1;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playbackRef.current = null;
    for (const source of sourcesRef.current) {
      try { source.onended = null; source.stop(); } catch { /* 已停止 */ }
      source.disconnect();
    }
    sourcesRef.current = [];
    splitterRef.current?.disconnect();
    splitterRef.current = null;
    previewGainRef.current?.local.disconnect();
    previewGainRef.current?.overall.disconnect();
    previewGainRef.current = null;
    setPlaying(false);
    // 指针保留在当前位置，方便暂停后继续定位。
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  /**
   * 写入一步历史。mutate 拿到当前这版（cuts + gain）返回要改的字段，返回 null 表示「这次没产生实际变化」。
   * key 相同且间隔很短时合并进同一步：拖增益滑块、连点微调都只留一步可撤回。
   */
  const commitEdit = useCallback((
    key: string,
    mutate: (base: EditSnapshot) => Partial<EditSnapshot> | null,
  ) => {
    // 改了删段或增益，正在跑的声音就对不上了，先停下。
    stopPlayback();
    setHistory((current) => {
      const base = current.entries[current.index];
      const patch = mutate(base);
      if (!patch) return current;
      const next: EditSnapshot = { cuts: patch.cuts ?? base.cuts, gain: patch.gain ?? base.gain };
      if (sameEditSnapshot(next, base)) return current;
      const now = performance.now();
      // 只有增益是连续手势（拖滑块），删段每次操作都该独立成一步。
      const merge = key.startsWith('gain') && current.gesture.key === key && current.index > 0
        && now - current.gesture.at < GESTURE_MERGE_MS;
      if (merge) {
        return {
          entries: current.entries.map((entry, index) => (index === current.index ? next : entry)),
          index: current.index,
          gesture: { key, at: now },
        };
      }
      const pushed = [...current.entries.slice(0, current.index + 1), next];
      const overflow = Math.max(0, pushed.length - HISTORY_LIMIT);
      return {
        entries: overflow ? pushed.slice(overflow) : pushed,
        index: pushed.length - 1 - overflow,
        gesture: { key, at: now },
      };
    });
  }, [stopPlayback]);

  const stepHistory = useCallback((step: -1 | 1) => {
    stopPlayback();
    setHistory((current) => {
      const index = clamp(current.index + step, 0, current.entries.length - 1);
      if (index === current.index) return current;
      // 撤回后新的改动要另起一步，不能合并进已经被退掉的那一步。
      return { ...current, index, gesture: { key: '', at: 0 } };
    });
    setCutDraft(null);
    setBoundaryInput(null);
    setGainError('');
  }, [stopPlayback]);

  useEffect(() => {
    const overall = previewGainRef.current?.overall;
    if (overall) overall.gain.setTargetAtTime(dbToGain(gain.overallDb), overall.context.currentTime, 0.01);
  }, [gain.overallDb]);

  const stopCutPan = useCallback(() => {
    if (cutPanRef.current) cancelAnimationFrame(cutPanRef.current.frame);
    cutPanRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || minimized) return;
    const page = document.documentElement;
    const previousOverflow = page.style.overflow;
    dialog.showModal();
    page.style.overflow = 'hidden';
    return () => {
      stopCutPan();
      dialog.close();
      page.style.overflow = previousOverflow;
    };
  }, [minimized, stopCutPan]);

  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const surface = prepareWaveform(canvas);
      if (!surface) return;
      const { context, width, height } = surface;
      drawJoinedWaveform(context, width, height, readPeak, timeline, 0, timeline.length, () => '#a8b9ca', gain, { start, end });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [readPeak, timeline, gain, start, end]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const surface = prepareWaveform(canvas);
    if (!surface) return;
    const { context, width, height } = surface;

    const middle = height / 2;
    const rangeStartX = clamp(xAtTime(start, width), 0, width);
    const rangeEndX = clamp(xAtTime(end, width), 0, width);

    context.fillStyle = 'rgba(255,255,255,0.02)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(251,146,60,0.07)';
    context.fillRect(rangeStartX, 0, Math.max(0, rangeEndX - rangeStartX), height);

    for (const range of gain.ranges) {
      const from = clamp(xAtTime(range.start, width), 0, width);
      const to = clamp(xAtTime(range.end, width), 0, width);
      context.fillStyle = 'rgba(125,211,252,0.12)';
      context.fillRect(from, 0, Math.max(0, to - from), height);
    }

    if (mode !== 'range' && selection) {
      const from = clamp(xAtTime(selection.start, width), 0, width);
      const to = clamp(xAtTime(selection.end, width), 0, width);
      if (to > from) {
        context.fillStyle = 'rgba(250,204,21,0.12)';
        context.fillRect(from, 0, to - from, height);
        context.strokeStyle = mode === 'gain' ? 'rgba(186,230,253,0.9)' : 'rgba(250,204,21,0.8)';
        context.lineWidth = 1;
        context.setLineDash([5, 4]);
        context.strokeRect(Math.round(from) + 0.5, 1, Math.max(1, to - from - 1), height - 2);
        context.setLineDash([]);
      }
    }

    // 波形
    drawJoinedWaveform(context, width, height, readPeak, timeline, viewStart, viewEnd,
      x => x >= rangeStartX && x <= rangeEndX ? 'rgba(253,186,116,0.9)' : 'rgba(255,255,255,0.18)', gain, { start, end });

    // 范围边界手柄（仅首尾模式可拖）
    if (mode === 'range' && viewSpan > 0) {
      const drawEdge = (x: number) => {
        context.fillStyle = 'rgb(251,146,60)';
        context.fillRect(Math.round(x) - 1, 0, 2, height);
        context.fillStyle = 'rgba(251,146,60,0.95)';
        context.beginPath();
        context.roundRect(Math.round(x) - 4, middle - 22, 8, 44, 4);
        context.fill();
      };
      drawEdge(rangeStartX);
      drawEdge(rangeEndX);
    }
  }, [end, gain, mode, readPeak, selection, start, timeline, viewEnd, viewSpan, viewStart, xAtTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWaveform();
    const observer = new ResizeObserver(drawWaveform);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawWaveform]);

  const zoomBy = useCallback((factor: number, anchorRatio?: number) => {
    setView((view) => {
      const span = Math.min(view?.span ?? timeline.length, timeline.length);
      const nextSpan = clamp(span / factor, Math.min(MIN_VIEW_SECONDS, timeline.length), timeline.length);
      if (nextSpan >= timeline.length) return null;
      const left = view ? clamp(timeline.toDisplay(view.sourceStart), 0, timeline.length - span) : 0;
      const ratio = anchorRatio ?? clamp((timeline.toDisplay((start + end) / 2) - left) / span, 0, 1);
      const nextStart = clamp(left + ratio * (span - nextSpan), 0, timeline.length - nextSpan);
      return { sourceStart: timeline.toSource(nextStart), span: nextSpan };
    });
  }, [timeline, start, end]);

  useEffect(() => {
    const waveform = wrapRef.current;
    if (!waveform) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!event.deltaY) return;
      const rect = waveform.getBoundingClientRect();
      const anchor = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      zoomBy(event.deltaY < 0 ? 1.35 : 1 / 1.35, anchor);
    };
    // React 的 onWheel 使用被动监听，无法取消浏览器的默认滚动。
    waveform.addEventListener('wheel', handleWheel, { passive: false });
    return () => waveform.removeEventListener('wheel', handleWheel);
  }, [zoomBy]);

  const panViewTo = (time: number) => {
    if (maxViewStart > 0) setView({ sourceStart: timeline.toSource(clamp(time, 0, maxViewStart)), span: viewSpan });
  };

  const overviewTime = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return ((event.clientX - rect.left) / Math.max(1, rect.width)) * timeline.length;
  };

  const handleOverviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (maxViewStart <= 0 || !event.isPrimary || event.button !== 0) return;
    const time = overviewTime(event);
    const inside = time >= viewStart && time <= viewEnd;
    overviewGrabOffset.current = inside ? time - viewStart : viewSpan / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!inside) panViewTo(time - viewSpan / 2);
  };

  const handleOverviewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (maxViewStart <= 0) return;
    const step = viewSpan / 10;
    let nextStart: number;
    switch (event.key) {
      case 'ArrowLeft': nextStart = viewStart - step; break;
      case 'ArrowRight': nextStart = viewStart + step; break;
      case 'Home': nextStart = 0; break;
      case 'End': nextStart = maxViewStart; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    panViewTo(nextStart);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewSpan <= 0 || !event.isPrimary || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = clamp(timeAtX(x, rect.width), 0, duration);
    event.currentTarget.setPointerCapture(event.pointerId);
    // 任何波形交互都先停下播放，避免指针被播放进度覆盖。
    if (playing) stopPlayback();

    const startX = xAtTime(start, rect.width);
    const endX = xAtTime(end, rect.width);
    const nearRangeHandle = mode === 'range'
      && (Math.abs(x - startX) <= HANDLE_HIT_PX || Math.abs(x - endX) <= HANDLE_HIT_PX);

    // 指针附近（±7px）可直接拖动播放指针，但让位给首尾手柄，避免抢边界。
    if (mode !== 'gain' && !nearRangeHandle && Math.abs(x - xAtTime(playhead, rect.width)) <= 7) {
      setPlayhead(clamp(time, start, end));
      dragRef.current = { mode: 'playhead', originX: x, originStart: start, originEnd: end, anchorTime: time };
      return;
    }

    if (mode !== 'range') {
      // 先记录锚点，拖动生成选区；在增益模式下，单击可重选已有区域。
      if (mode === 'cut') setCutDraft(null);
      setGainError('');
      dragRef.current = { mode: 'create', originX: x, originStart: time, originEnd: time, anchorTime: time };
      tapRef.current = { time, moved: false, canRelocate: true };
      return;
    }

    let dragMode: 'start' | 'end' | 'move' | 'create' = 'create';
    if (Math.abs(x - startX) <= HANDLE_HIT_PX) dragMode = 'start';
    else if (Math.abs(x - endX) <= HANDLE_HIT_PX) dragMode = 'end';
    else if (x > startX && x < endX) dragMode = 'move';

    dragRef.current = { mode: dragMode, originX: x, originStart: start, originEnd: end, anchorTime: time };
    if (dragMode === 'create' || dragMode === 'move') tapRef.current = { time, moved: false, canRelocate: true };
  };

  const updateIntervalDraft = (anchor: number, time: number) => {
    setIntervalDraft(time >= anchor
      ? { start: anchor, end: Math.min(duration, Math.max(anchor + MIN_CLIP_SECONDS, time)) }
      : { start: Math.max(0, time), end: Math.max(anchor, time + MIN_CLIP_SECONDS) });
  };

  const extendCutAtEdge = (anchor: number, x: number, width: number) => {
    const edge = Math.min(CUT_PAN_EDGE_PX, width / 4);
    const direction = x <= edge ? -1 : x >= width - edge ? 1 : 0;
    if (direction && cutPanRef.current?.direction === direction) return;
    stopCutPan();

    if (!direction || (direction < 0 ? viewStart <= 0 : viewStart >= maxViewStart)) {
      updateIntervalDraft(anchor, timeAtX(clamp(x, 0, width), width));
      return;
    }

    const edgeOffset = direction > 0 ? viewSpan : 0;
    let left = viewStart;
    let previousFrame = performance.now();
    const step = (now: number) => {
      const seconds = Math.min(now - previousFrame, 50) / 1000;
      previousFrame = now;
      left = clamp(left + direction * viewSpan * CUT_PAN_SPANS_PER_SECOND * seconds, 0, maxViewStart);
      panViewTo(left);
      updateIntervalDraft(anchor, timeline.toSource(left + edgeOffset));
      cutPanRef.current = left > 0 && left < maxViewStart
        ? { direction, frame: requestAnimationFrame(step) }
        : null;
    };
    cutPanRef.current = { direction, frame: requestAnimationFrame(step) };
    updateIntervalDraft(anchor, timeline.toSource(left + edgeOffset));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const tap = tapRef.current;
    if (tap && Math.abs(x - drag.originX) > 3) tap.moved = true;

    if (drag.mode === 'playhead') {
      setPlayhead(clamp(timeAtX(x, rect.width), start, end));
      return;
    }

    if (drag.mode === 'create') {
      if (!tap?.moved) return;
      const anchor = drag.anchorTime;
      if (mode !== 'range') {
        extendCutAtEdge(anchor, x, rect.width);
        return;
      }
      const time = clamp(timeAtX(x, rect.width), 0, duration);
      // 首尾模式：从锚点拖出新范围
      const from = Math.max(0, Math.min(anchor, time));
      const to = Math.min(duration, Math.max(anchor, time));
      setStart(clamp(from, 0, duration - MIN_CLIP_SECONDS));
      setEnd(clamp(Math.max(to, from + MIN_CLIP_SECONDS), from + MIN_CLIP_SECONDS, duration));
      return;
    }
    const delta = timeAtX(x, rect.width) - drag.anchorTime;
    if (drag.mode === 'start') {
      setStart(clamp(drag.originStart + delta, 0, end - MIN_CLIP_SECONDS));
    } else if (drag.mode === 'end') {
      setEnd(clamp(drag.originEnd + delta, start + MIN_CLIP_SECONDS, duration));
    } else {
      const length = drag.originEnd - drag.originStart;
      const nextStart = clamp(drag.originStart + delta, 0, duration - length);
      setStart(nextStart);
      setEnd(nextStart + length);
    }
  };

  const selectGainRange = (range: AudioCut) => {
    setGainDraft({ start: Math.max(start, range.start), end: Math.min(end, range.end) });
    setBoundaryInput(null);
    setGainError('');
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    stopCutPan();
    const drag = dragRef.current;
    const tap = tapRef.current;
    dragRef.current = null;
    tapRef.current = null;
    if (!drag) return;

    if (drag.mode === 'create' || drag.mode === 'move') {
      if (tap && !tap.moved && tap.canRelocate) {
        // 单击：把播放指针移到点击处，不改动裁剪范围。
        setPlayhead(clamp(tap.time, start, end));
        if (mode === 'cut') setCutDraft(null);
        if (mode === 'gain' && (!selection || tap.time < selection.start || tap.time >= selection.end)) {
          const range = gain.ranges.find(part => tap.time >= part.start && tap.time < part.end);
          if (range && tap.time >= start && tap.time < end) selectGainRange(range);
        }
        return;
      }
      if (mode !== 'range' && drag.mode === 'create') {
        setIntervalDraft((current) => {
          if (current?.start === undefined || current.end === undefined) return null;
          const from = Math.max(start, current.start);
          const to = Math.min(end, current.end);
          if (to - from < 0.1) return null;
          return { start: Math.max(start, Number(from.toFixed(2))), end: Math.min(end, Number(to.toFixed(2))) };
        });
      }
    }
  };

  const play = async () => {
    stopPlayback();
    const previewVersion = previewVersionRef.current;
    const allParts = resolveKeptSegments(start, end, cuts);
    // 从播放指针开始：若指针落在删除段内，自动从下一个保留段接着播。
    const origin = clamp(playhead, start, end);
    const parts = allParts
      .filter((part) => part.end > origin + 0.005)
      .map((part) => ({ start: Math.max(part.start, origin), end: part.end }));
    if (!parts.length) {
      setPlayhead(start);
      return;
    }
    const context = getAudioContext();
    await context.resume();
    if (previewVersion !== previewVersionRef.current) return;
    const local = context.createGain();
    const overall = context.createGain();
    overall.gain.value = dbToGain(overallDbRef.current);
    local.connect(overall);
    overall.connect(context.destination);
    previewGainRef.current = { local, overall };
    // 在增益之后取样，电平表显示试听实际峰值。
    const splitter = context.createChannelSplitter(meterChannels);
    splitterRef.current = splitter;
    overall.connect(splitter);
    const meters = Array.from({ length: meterChannels }, (_, channel) => {
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      splitter.connect(analyser, channel);
      return { analyser, samples: new Float32Array(analyser.fftSize) };
    });
    // 分段精确调度：删除段被直接跳过，段与段之间无缝衔接。
    const startedAt = context.currentTime + 0.03;
    scheduleAudioGain(local.gain, parts, { overallDb: 0, ranges: gain.ranges }, startedAt);
    let cursor = startedAt;
    const timeline: Array<{ at: number; from: number; duration: number }> = [];
    for (const part of parts) {
      const partDuration = part.end - part.start;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(local);
      source.start(cursor, part.start, partDuration);
      sourcesRef.current.push(source);
      timeline.push({ at: cursor, from: part.start, duration: partDuration });
      cursor += partDuration;
    }
    playbackRef.current = { startedAt, total: cursor - startedAt, timeline };
    setLevels(emptyLevels(meterChannels));
    setPlaying(true);
    const tick = () => {
      const playback = playbackRef.current;
      if (!playback) return;
      const elapsed = context.currentTime - playback.startedAt;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const readings = meters.map(({ analyser, samples }) => {
        analyser.getFloatTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        return 20 * Math.log10(peak);
      });
      setLevels(previous => readings.map((db, channel) => ({ db, peak: Math.max(previous[channel].peak, db) })));
      if (elapsed >= playback.total) { stopPlayback(); return; }
      let current = playback.timeline[0];
      for (const item of playback.timeline) {
        if (elapsed >= item.at - playback.startedAt) current = item;
      }
      setPlayhead(current.from + Math.min(current.duration, elapsed - (current.at - playback.startedAt)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const movePlayhead = useCallback((delta: number) => {
    setPlayhead(current => {
      const time = timeline.toSource(timeline.toDisplay(current) + delta, delta < 0);
      return clamp(Number(time.toFixed(3)), start, end);
    });
  }, [timeline, start, end]);

  const addMarker = () => {
    if (!timeline.length) return;
    const sourceTime = timeline.contains(playhead) ? playhead : timeline.toSource(timeline.toDisplay(playhead));
    const time = clamp(Number(sourceTime.toFixed(3)), 0, duration);
    setMarkers(current => current.some(marker => marker.time === time)
      ? current
      : [...current, { time, topic: '', note: '', color: DEFAULT_AUDIO_MARKER_COLOR }].sort((left, right) => left.time - right.time));
  };

  /** 时间就是标记的身份：撞上别的标记就往后让 1 毫秒，免得两条同点、重载后被合并掉。 */
  const uniqueMarkerTime = (from: number, target: number) => {
    const taken = new Set(markers.filter(marker => marker.time !== from).map(marker => marker.time));
    let next = target;
    while (taken.has(next) && next < duration) next = Math.round((next + 0.001) * 1000) / 1000;
    return next;
  };

  /** 给当前选区写一条「片段评论」：和 M 标记同一份数据（带 end 的区间标记），可直接续写主题/备注。 */
  const commentSelection = () => {
    if (!selection || selection.end - selection.start < MIN_AUDIO_MARKER_SPAN) return;
    const from = Number(selection.start.toFixed(3));
    const to = Number(selection.end.toFixed(3));
    const same = markers.find(marker => Math.abs(marker.time - from) < 0.002
      && Math.abs(audioMarkerEnd(marker) - to) < 0.002);
    if (same) {
      setEditingMarkerTime(same.time);
      return;
    }
    const time = uniqueMarkerTime(-1, from);
    setMarkers(current => [...current, {
      time, end: Math.max(time + MIN_AUDIO_MARKER_SPAN, to), topic: '', note: '', color: DEFAULT_AUDIO_MARKER_COLOR,
    }].sort((left, right) => left.time - right.time));
    setEditingMarkerTime(time);
  };

  /** 「用当前选区」把已有区间评论挪到新范围：起点是身份，换起点等于换 key，所以同时改 time 与 end。 */
  const retargetMarker = (from: number) => {
    if (!selection) return;
    const time = uniqueMarkerTime(from, Number(selection.start.toFixed(3)));
    const spanEnd = Math.min(duration, Math.max(time + MIN_AUDIO_MARKER_SPAN, Number(selection.end.toFixed(3))));
    setMarkers(current => current
      .map(marker => (marker.time === from ? { ...marker, time, end: spanEnd } : marker))
      .sort((left, right) => left.time - right.time));
    setEditingMarkerTime(time);
  };

  const updateMarker = (time: number, patch: Partial<Pick<AudioMarker, 'topic' | 'note' | 'color'>>) => {
    setMarkers(current => current.map(marker => marker.time === time ? { ...marker, ...patch } : marker));
  };

  const jumpToMarker = (time: number) => {
    stopPlayback();
    setPlayhead(time);
    const offset = timeline.toDisplay(time);
    if (offset < viewStart || offset > viewEnd) panViewTo(offset - viewSpan / 2);
  };

  /** 拖动时只能停在「当前视图 ∩ 保留片段」里：拖出视图旗标会消失，拖进被裁掉的片段会被隐藏。 */
  const markerDragBounds = (edge: 'start' | 'end', time: number) => {
    const low = Math.max(0, start, viewStart);
    const high = Math.min(duration, end, viewEnd);
    const base = low <= high ? { low, high } : { low: start, high: end };
    if (edge === 'end') {
      // 终点不能压到起点上，至少要留出最短区间。
      return { low: Math.min(base.low, time + MIN_AUDIO_MARKER_SPAN), high: base.high };
    }
    const marker = markers.find(item => item.time === time);
    const limit = marker?.end === undefined ? base.high : Math.min(base.high, marker.end - MIN_AUDIO_MARKER_SPAN);
    return { low: base.low, high: Math.max(base.low, limit) };
  };

  const startMarkerDrag = (time: number, edge: 'start' | 'end', initial: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    // 必须挡住波形自己的 pointerdown，否则会同时开始拉选区。
    event.stopPropagation();
    if (!event.isPrimary || event.button !== 0) return;
    if (playing) stopPlayback();
    event.currentTarget.setPointerCapture(event.pointerId);
    markerDragOriginX.current = event.clientX;
    setMarkerDrag({ time, draft: initial, moved: false, edge });
  };

  const moveMarkerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = markerDrag;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    // 时间必须按波形条算，不能按旗标本身算。
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const { low, high } = markerDragBounds(drag.edge, drag.time);
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const draft = clamp(Number(timeAtX(x, rect.width).toFixed(3)), low, high);
    const moved = drag.moved || Math.abs(event.clientX - markerDragOriginX.current) > 2;
    if (draft === drag.draft && moved === drag.moved) return;
    setMarkerDrag({ time: drag.time, draft, moved, edge: drag.edge });
  };

  const finishMarkerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = markerDrag;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setMarkerDrag(null);
    if (!drag.moved) {
      // 没挪动就是一次点击：打开这条标记的编辑器。
      setEditingMarkerTime(drag.time);
      return;
    }
    if (drag.edge === 'end') {
      setMarkers(current => current.map(marker => (
        marker.time === drag.time ? { ...marker, end: Math.max(drag.draft, marker.time + MIN_AUDIO_MARKER_SPAN) } : marker
      )));
      return;
    }
    const next = uniqueMarkerTime(drag.time, drag.draft);
    setMarkers(current => current
      .map(marker => (marker.time === drag.time ? { ...marker, time: next } : marker))
      .sort((left, right) => left.time - right.time));
    if (editingMarkerTime === drag.time) setEditingMarkerTime(next);
  };

  const markersChanged = saved.markers.length !== markers.length
    || markers.some((marker, index) => {
      const previous = saved.markers[index];
      return marker.time !== previous.time || (marker.end ?? -1) !== (previous.end ?? -1)
        || marker.topic !== previous.topic || marker.note !== previous.note || marker.color !== previous.color;
    });

  const save = () => {
    // Ctrl+S 与按钮共用：正在保存或没有可保留的片段时都不该再触发一次。
    if (saving || !canSave) return;
    stopPlayback();
    // 录音指数跟裁剪一起落库：先提交评分，再交回裁剪结果。
    commitScore();
    if (!onSave({
      start, end, cuts: visibleCuts,
      gain: sameRecordingGain(gain, saved.gain) ? undefined : gain,
      markers: markersChanged ? markers : undefined,
    })) {
      setSaveError('裁剪无法保存到本机，请重试。');
      return;
    }
    // 保存后把当前这一步的历史也对齐到裁到范围后的删段，避免撤回时拿到越界的旧值。
    setHistory((current) => ({
      ...current,
      entries: current.entries.map((entry, index) => (index === current.index ? { ...entry, cuts: visibleCuts } : entry)),
    }));
    setSaved({ start, end, cuts: visibleCuts, gain, markers, confirmed: true });
    setSaveError('');
  };

  // 有未保存改动时先确认，避免手快点了「取消」白剪一场。
  const dirty = useMemo(() => {
    if (!sameRecordingGain(gain, saved.gain)) return true;
    if (start.toFixed(3) !== saved.start.toFixed(3) || end.toFixed(3) !== saved.end.toFixed(3)) return true;
    if (saved.cuts.length !== cuts.length) return true;
    return cuts.some((cut, index) => (
      cut.start !== saved.cuts[index].start || cut.end !== saved.cuts[index].end
    ));
  }, [cuts, end, gain, saved, start]);

  const applySelectionGain = (adjustment: number | 'reset') => {
    if (!selection || !canApplyGain) return;
    const ranges = adjustGainRange(gain.ranges, selection, adjustment);
    if (!ranges) {
      setGainError(`局部累计增益须在 ${MIN_GAIN_DB} 至 +${MAX_GAIN_DB} dB 之间。请减小本次调整幅度。`);
      return;
    }
    if (ranges.length > MAX_GAIN_RANGES) {
      setGainError(`最多可保留 ${MAX_GAIN_RANGES} 个增益区间，请先还原部分区间。`);
      return;
    }
    // 局部增益也进历史：Ctrl+Z 能一步步退回叠加前的样子（含「还原选区」）。
    commitEdit(adjustment === 'reset' ? 'gain-range-reset' : 'gain-range',
      base => ({ gain: { ...base.gain, ranges } }));
    setGainError('');
    setPlayhead(selection.start);
  };

  const changeMode = (next: EditMode) => {
    if (next === mode) return;
    setMode(next);
    setCutDraft(null);
    setBoundaryInput(null);
    setGainError('');
  };

  const requestClose = useCallback(() => {
    if ((dirty || markersChanged) && !window.confirm('这次编辑还没保存，确定放弃吗？')) return;
    commitScore();
    onCancel();
  }, [dirty, markersChanged, onCancel, commitScore]);

  // 直达录音榜：评分先落库，再交给父级跳转。跳转会卸载详情页，未保存的裁剪只能丢，所以先问一声。
  const openRecordingBoard = useCallback(() => {
    commitScore();
    if ((dirty || markersChanged) && !window.confirm('去录音榜会关掉这次裁剪，未保存的裁剪改动会丢失（录音指数已经存下）。继续吗？')) return;
    onOpenRecordingBoard?.();
  }, [commitScore, dirty, markersChanged, onOpenRecordingBoard]);

  const updateCut = useCallback((replacement?: AudioCut) => {
    commitEdit('cut', (base) => {
      const remaining = originalCut
        ? base.cuts.filter((cut) => cut.end <= originalCut.start || cut.start >= originalCut.end)
        : base.cuts;
      const nextCuts = replacement ? normalizeAudioCuts([...remaining, replacement], start, end) : remaining;
      if (nextCuts.length === base.cuts.length && nextCuts.every((cut, index) => (
        cut.start === base.cuts[index].start && cut.end === base.cuts[index].end
      ))) return null;
      return { cuts: nextCuts };
    });
    setCutDraft(null);
    setBoundaryInput(null);
  }, [commitEdit, originalCut, start, end]);

  const addCut = useCallback(() => {
    if (canApplyCut && selection) updateCut(selection);
  }, [canApplyCut, selection, updateCut]);

  // Ctrl+S 存盘不挑焦点：正在留言框里打字也该能直接保存。
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = save;

  // 键盘控制播放指针：←/→ 微调，Shift ±1s、Alt ±0.01s；空格播放/暂停；Home/End 到首尾。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current?.open) return;
      const target = event.target as HTMLElement | null;
      // Ctrl+S 先处理：保存不该被输入框抢走。
      if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!event.repeat) saveRef.current();
        return;
      }
      // 只有「能打字」的控件才让给浏览器原生行为（留言 / 主题 / 备注里的文字撤回）。
      // 增益滑块、dB 数值框、录音指数这类数字控件原生 Ctrl+Z 本来就没有意义，
      // 而拖完滑块焦点正好停在它们身上，拦下来会让「撤销两个增益」在最常见的场景下失灵。
      if (isTextEntryTarget(target)) return;
      if (!event.defaultPrevented && !event.isComposing && event.ctrlKey && !event.altKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z' || (key === 'y' && !event.shiftKey)) {
          event.preventDefault();
          if (!event.repeat) stepHistory(key === 'z' && !event.shiftKey ? -1 : 1);
          return;
        }
      }
      if (!event.defaultPrevented && !event.isComposing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        addMarker();
        return;
      }
      // 方向键在滑块 / 数字框上要留给控件自己（拖完增益还能用键盘微调）。
      if (!isFormControlTarget(target) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        const step = event.shiftKey ? 1 : event.altKey ? 0.01 : 0.1;
        movePlayhead(event.key === 'ArrowLeft' ? -step : step);
        return;
      }
      if (event.key === ' ' && !target?.closest?.('[aria-controls="audio-marker-editor"], #audio-marker-editor button, [data-gain-controls]')) {
        event.preventDefault();
        if (playing) stopPlayback(); else void play();
        return;
      }
      // 选中后直接按 Delete 就删掉，不用再去点按钮。
      if (!isFormControlTarget(target) && (event.key === 'Delete' || event.key === 'Backspace') && mode === 'cut' && canApplyCut) {
        event.preventDefault();
        addCut();
        return;
      }
      if (!isFormControlTarget(target) && event.key === 'Home') { event.preventDefault(); setPlayhead(start); return; }
      if (!isFormControlTarget(target) && event.key === 'End') { event.preventDefault(); setPlayhead(end); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movePlayhead, playing, stopPlayback, play, start, end, mode, canApplyCut, addCut, addMarker, stepHistory]);

  const setBoundary = (field: Boundary, value: number | undefined) => {
    if (mode !== 'range') {
      setGainError('');
      setIntervalDraft((current) => {
        const { min, max } = boundaryLimits(field, current ?? {}, start, end);
        return { ...current, [field]: value === undefined ? undefined : clamp(value, min, max) };
      });
      return;
    }
    if (value === undefined) return;
    const { min, max } = boundaryLimits(field, { start, end }, 0, duration);
    const setValue = field === 'start' ? setStart : setEnd;
    setValue(clamp(value, min, max));
  };

  const activeRange = mode === 'range' ? { start, end } : selection ?? intervalDraft ?? {};
  const getBoundaryLimits = (field: Boundary) => boundaryLimits(
    field, activeRange, mode === 'range' ? 0 : start, mode === 'range' ? duration : end,
  );
  const nudge = (field: Boundary, delta: number) => {
    setBoundaryInput(null);
    setBoundary(field, Number(((activeRange[field] ?? playhead) + delta).toFixed(3)));
  };

  const resetView = () => setView(null);
  const viewMarkers = markers.filter((marker) => {
    if (timeline.contains(marker.time)) return true;
    // 区间评论的起点可能落在被删掉的片段里，只要还盖住保留音频就照样画出来。
    const spanEnd = audioMarkerEnd(marker);
    return marker.end !== undefined && timeline.segments.some(part => part.start < spanEnd && part.end > marker.time);
  });
  const displayedPlayhead = timeline.toDisplay(playhead);

  return (
    <dialog
      ref={dialogRef}
      aria-label="音频裁剪"
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden overscroll-none border-0 bg-[#0b0b10] p-0 text-white"
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-orange-200/70">
              <Scissors className="h-3.5 w-3.5" />AUDIO TRIM
            </div>
            <h2 className="mt-1 truncate font-serif text-xl font-black text-white sm:text-2xl">{recordingTitle}</h2>
            <div className="mt-1 flex min-w-0 items-start gap-2">
              <RecordingScoreField draft={scoreDraft} quality={scoreQuality} onChange={setScoreDraft} onCommit={commitScore} />
              {onOpenRecordingBoard && (
                <button
                  type="button" onClick={openRecordingBoard}
                  aria-label="打开录音榜" title="打开录音榜看排名（未保存的裁剪会先提醒）"
                  className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-orange-200/25 bg-orange-300/10 px-3 py-1.5 text-xs font-bold text-orange-100 transition hover:bg-orange-300/20"
                >
                  录音榜
                </button>
              )}
              <div className="min-w-0 flex-1">
                <RecordingNote key={noteStorageKey} storageKey={noteStorageKey} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onMinimize} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-bold text-orange-100 hover:bg-orange-300/10">
              <Minus aria-hidden="true" className="h-4 w-4" />退到后台
            </button>
            <button type="button" onClick={requestClose} aria-label="关闭裁剪" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4 [&>*]:shrink-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex shrink-0 rounded-xl border border-white/10 bg-black/30 p-1">
              <button type="button" onClick={() => changeMode('cut')} className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${mode === 'cut' ? 'bg-red-300 text-black' : 'text-white/55 hover:text-white'}`}>删除中间片段</button>
              <button type="button" onClick={() => changeMode('gain')} aria-pressed={mode === 'gain'} className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${mode === 'gain' ? 'bg-sky-200 text-black' : 'text-white/55 hover:text-white'}`}>局部增益</button>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <button
                type="button" onClick={() => stepHistory(-1)} disabled={!canUndo}
                aria-keyshortcuts="Control+Z" title={canUndo ? '撤回（Ctrl+Z）：删段与两个增益都算一步' : '没有可撤回的编辑'}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-white/65 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Undo2 aria-hidden="true" className="h-3.5 w-3.5" />撤回
              </button>
              <button
                type="button" onClick={() => stepHistory(1)} disabled={!canRedo}
                aria-keyshortcuts="Control+Y" title={canRedo ? '重做（Ctrl+Y / Ctrl+Shift+Z）' : '没有可重做的编辑'}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-white/65 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Redo2 aria-hidden="true" className="h-3.5 w-3.5" />重做
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums">
              <span className="whitespace-nowrap text-white/45">范围 <b className="font-black text-orange-200">{formatDuration(start, true)}</b> → <b className="font-black text-orange-200">{formatDuration(end, true)}</b></span>
              <span className="whitespace-nowrap text-white/45">指针{timeline.length < duration && '（原音频）'} <b className="font-black text-emerald-300">{formatDuration(playhead, true)}</b></span>
              <span className="whitespace-nowrap text-white/45">保留 <b className="font-black text-emerald-300">{formatDuration(kept, true)}</b></span>
              {visibleCuts.length > 0 && <span className="whitespace-nowrap text-red-200/80">已删 {visibleCuts.length} 段（{formatDuration(Math.max(0, (end - start) - kept), true)}）</span>}
            </div>
            <div data-gain-controls className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-sky-300/5 px-2 py-1">
              <Volume2 aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-sky-200 sm:block" />
              <GainControl
                compact label="整段增益" db={gain.overallDb}
                onChange={overallDb => commitEdit('gain-overall', base => ({ gain: { ...base.gain, overallDb } }))}
              />
              <button type="button" onClick={() => commitEdit('gain-overall-reset', base => ({ gain: { ...base.gain, overallDb: 0 } }))}
                aria-label="还原整段增益" className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/70 hover:text-white">归零</button>
              <span aria-label="整段采样峰值和增益余量" className="whitespace-nowrap"><PeakHeadroom peak={overallPeak} /></span>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] font-medium text-white/55">
              <span className="flex flex-wrap items-center gap-2">
                全曲概览
                {overallPeak !== null && overallPeak >= 1 && (
                  <span className="inline-flex items-center gap-1 text-red-300">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-sm bg-[#fb5252]" />
                    红色为满刻度（≥0 dBFS）
                  </span>
                )}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="mr-1 font-mono tabular-nums">{timeline.length < duration && '剪后 '}{formatDuration(timeline.length, true)}</span>
                <button type="button" onClick={() => zoomBy(1 / 1.6)} title="缩小" aria-label="缩小波形" className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white"><ZoomOut className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={resetView} title="显示全曲" aria-label="显示全曲" className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs font-bold text-white/60 transition hover:border-white/25 hover:text-white"><RotateCcw className="h-3.5 w-3.5" />全曲</button>
                <button type="button" onClick={() => zoomBy(1.6)} title="放大" aria-label="放大波形" className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white"><ZoomIn className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div
              role="slider"
              aria-label="主波形可见范围"
              aria-valuemin={0}
              aria-valuemax={maxViewStart}
              aria-valuenow={viewStart}
              aria-valuetext={`${formatDuration(viewStart, true)} 至 ${formatDuration(viewEnd, true)}`}
              aria-disabled={maxViewStart <= 0}
              tabIndex={maxViewStart > 0 ? 0 : -1}
              title={maxViewStart > 0 ? '拖动外框或点击概览，移动主波形视图' : undefined}
              className={`relative touch-none select-none overflow-hidden rounded-lg bg-[#141a22] ring-1 ring-inset ring-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200 ${maxViewStart > 0 ? 'cursor-pointer' : ''}`}
              onPointerDown={handleOverviewPointerDown}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId) && overviewGrabOffset.current !== null) {
                  panViewTo(overviewTime(event) - overviewGrabOffset.current);
                }
              }}
              onLostPointerCapture={() => { overviewGrabOffset.current = null; }}
              onKeyDown={handleOverviewKeyDown}
            >
              <canvas ref={overviewCanvasRef} aria-hidden="true" className="block h-10 w-full sm:h-12" />
              <div
                aria-hidden="true"
                className={`absolute inset-y-0 min-w-[3px] rounded-md border-2 border-sky-200/80 bg-sky-200/10 shadow-[0_0_0_100vmax_rgba(0,0,0,0.53)] ${maxViewStart > 0 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{ left: `${timeline.length ? viewStart / timeline.length * 100 : 0}%`, width: `${timeline.length ? viewSpan / timeline.length * 100 : 100}%` }}
              />
              {viewMarkers.map((marker) => {
                const from = timeline.toDisplay(marker.time) / Math.max(1, timeline.length) * 100;
                if (!isAudioMarkerSpan(marker)) {
                  return <span key={marker.time} aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px opacity-75" style={{ left: `${from}%`, backgroundColor: marker.color }} />;
                }
                const to = timeline.toDisplay(marker.end!) / Math.max(1, timeline.length) * 100;
                return (
                  <span
                    key={marker.time} aria-hidden="true" className="pointer-events-none absolute inset-y-0 opacity-45"
                    style={{ left: `${Math.min(from, to)}%`, width: `${Math.max(0.2, Math.abs(to - from))}%`, backgroundColor: marker.color }}
                  />
                );
              })}
              {timeline.length > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-emerald-300/90"
                  style={{ left: `${displayedPlayhead / timeline.length * 100}%` }}
                >
                  <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[3px] border-t-[5px] border-x-transparent border-t-emerald-300" />
                </div>
              )}
            </div>
          </div>

          <div
            ref={wrapRef}
            className="relative mt-3 min-h-[160px] grow touch-none select-none rounded-2xl border border-white/10 bg-black/40 sm:min-h-[200px]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onLostPointerCapture={handlePointerUp}
          >
            <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-crosshair rounded-[inherit]" />
            {viewSpan > 0 && viewMarkers.map((marker) => {
              const { time, color, topic, note } = marker;
              const span = isAudioMarkerSpan(marker);
              // 拖动期间用草稿时间画，松手才落到 markers 上：key 保持原时间不变，指针捕获才不会断。
              const dragging = markerDrag?.time === time;
              const startShown = dragging && markerDrag.edge === 'start' ? markerDrag.draft : time;
              const endShown = span
                ? (dragging && markerDrag.edge === 'end' ? markerDrag.draft : marker.end!)
                : startShown;
              const startPosition = timeline.toDisplay(startShown);
              const endPosition = timeline.toDisplay(endShown);
              const shown = span
                ? Math.max(startPosition, viewStart) <= Math.min(endPosition, viewEnd)
                : startPosition >= viewStart && startPosition <= viewEnd;
              if (!shown) return null;
              const label = markerTimeLabel(startShown);
              const endLabel = markerTimeLabel(endShown);
              const percent = xAtTime(startShown, 100);
              const endPercent = xAtTime(endShown, 100);
              const preview = topic?.trim() || note.trim();

              if (span) {
                const left = clamp(Math.min(percent, endPercent), 0, 100);
                const right = clamp(Math.max(percent, endPercent), 0, 100);
                return (
                  <div key={time} className="pointer-events-none absolute inset-y-0" style={{ left: `${left}%`, width: `${Math.max(0.2, right - left)}%`, color }}>
                    <div aria-hidden="true" className="absolute inset-0 border-x-2 border-dashed border-current bg-current/[0.07]" />
                    {percent >= 0 && percent <= 100 && (
                      <button
                        type="button"
                        aria-label={`移动或编辑片段评论 ${label}`}
                        aria-expanded={editingMarkerTime === time}
                        aria-controls="audio-marker-editor"
                        title={[`片段 ${label}–${endLabel}`, preview, '按住旗标拖起点，右端把手拖终点'].filter(Boolean).join('\n')}
                        onPointerDown={startMarkerDrag(time, 'start', time)}
                        onPointerMove={moveMarkerDrag}
                        onPointerUp={finishMarkerDrag}
                        onPointerCancel={finishMarkerDrag}
                        onClick={event => { if (event.detail === 0) setEditingMarkerTime(time); }}
                        className={`pointer-events-auto absolute left-0 top-0 z-10 grid h-7 w-6 touch-none -translate-x-1/2 place-items-center rounded-md hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current ${dragging && markerDrag?.edge === 'start' ? 'cursor-grabbing bg-black/55' : 'cursor-grab'}`}
                      >
                        <Flag aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
                      </button>
                    )}
                    {endPercent >= 0 && endPercent <= 100 && (
                      <button
                        type="button"
                        aria-label={`调整片段评论 ${label} 的终点`}
                        title={`拖动调整终点（现在是 ${endLabel}）`}
                        onPointerDown={startMarkerDrag(time, 'end', marker.end!)}
                        onPointerMove={moveMarkerDrag}
                        onPointerUp={finishMarkerDrag}
                        onPointerCancel={finishMarkerDrag}
                        className={`pointer-events-auto absolute top-0 z-10 grid h-7 w-5 touch-none translate-x-1/2 place-items-center rounded-md hover:bg-black/55 ${dragging && markerDrag?.edge === 'end' ? 'cursor-grabbing bg-black/55' : 'cursor-col-resize'}`}
                        style={{ left: '100%' }}
                      >
                        <span aria-hidden="true" className="h-4 w-1 rounded-full bg-current" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingMarkerTime(time)}
                      aria-expanded={editingMarkerTime === time}
                      aria-controls="audio-marker-editor"
                      title={preview || '点开写这段的评论'}
                      className="pointer-events-auto absolute left-3 top-0 z-10 max-w-[12rem] truncate whitespace-nowrap rounded-b-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold hover:bg-black/85"
                    >
                      {preview || '片段评论'}
                    </button>
                    {dragging && (
                      <span className={`pointer-events-none absolute top-7 z-10 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/85 ring-1 ring-white/15 ${
                        markerDrag?.edge === 'end' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
                      }`}>
                        {markerDrag?.edge === 'end' ? endLabel : label}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <div key={time} className="pointer-events-none absolute inset-y-0 border-l border-dashed border-current" style={{ left: `${percent}%`, color }}>
                  <button
                    type="button"
                    aria-label={`移动或编辑标记 ${label}`}
                    aria-expanded={editingMarkerTime === time}
                    aria-controls="audio-marker-editor"
                    title={[topic?.trim(), note.trim(), '按住左右拖动可微调位置'].filter(Boolean).join('\n')}
                    onPointerDown={startMarkerDrag(time, 'start', time)}
                    onPointerMove={moveMarkerDrag}
                    onPointerUp={finishMarkerDrag}
                    onPointerCancel={finishMarkerDrag}
                    onClick={event => { if (event.detail === 0) setEditingMarkerTime(time); }}
                    className={`pointer-events-auto absolute top-0 z-10 grid h-7 w-7 touch-none -translate-x-1/2 place-items-center rounded-md hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current ${dragging ? 'cursor-grabbing bg-black/55' : 'cursor-grab'}`}
                  >
                    <Flag aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
                    {dragging && (
                      <span className={`pointer-events-none absolute top-7 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/85 ring-1 ring-white/15 ${
                        percent < 8 ? 'left-0' : percent > 92 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                      }`}>
                        {label}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            {viewSpan > 0 && displayedPlayhead >= viewStart && displayedPlayhead <= viewEnd && <div
              className="pointer-events-none absolute top-0 h-full w-0.5 bg-emerald-300/90"
              style={{ left: `${xAtTime(playhead, 100)}%` }}
            >
              <span className="absolute -top-0.5 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-[6px] border-x-transparent border-t-emerald-300" />
            </div>}
            <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 flex justify-between font-mono text-[10px] text-white/30">
              <span>{formatDuration(viewStart, true)}</span>
              <span>{formatDuration(viewEnd, true)}</span>
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-white/10 bg-black/25 px-2.5 py-2 sm:px-3" aria-label="试听峰值电平">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/60">
              <span className="font-medium">试听峰值电平 <span className="font-mono">dBFS</span></span>
              {levels.some(level => level.peak >= 0) && (
                <span className="font-medium text-red-300" title="试听的数字采样峰值达到或超过 0 dBFS">达到满刻度</span>
              )}
            </div>
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.75rem] items-center gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums">
              {levels.map((level, channel) => {
                const label = meterChannels === 1 ? '单声道' : channel === 0 ? 'L' : 'R';
                const db = playing ? level.db : -Infinity;
                const text = !playing ? '—' : Number.isFinite(db) ? db.toFixed(1) : '−∞';
                return (
                  <div key={label} className="contents">
                    <span className={level.peak >= 0 ? 'font-bold text-red-300' : 'text-white/65'}>{label}</span>
                    <div
                      role="meter"
                      aria-label={`${label} 声道峰值电平`}
                      aria-valuemin={METER_FLOOR_DB}
                      aria-valuemax={0}
                      aria-valuenow={clamp(db, METER_FLOOR_DB, 0)}
                      aria-valuetext={!playing ? '未播放' : Number.isFinite(db) ? `${text} dBFS` : '静音'}
                      className="relative h-2.5 overflow-hidden rounded-sm bg-white/10"
                    >
                      <div className="absolute inset-0" style={{ background: METER_GRADIENT, clipPath: `inset(0 ${100 - levelPercent(db)}% 0 0)` }} />
                      {level.peak > METER_FLOOR_DB && (
                        <span className="absolute inset-y-0 w-px bg-white/90" style={{ left: `clamp(0px, ${levelPercent(level.peak)}%, calc(100% - 1px))` }} />
                      )}
                    </div>
                    <span className={`text-right ${db >= -6 ? 'text-red-300' : 'text-white/70'}`}>{text}</span>
                  </div>
                );
              })}
              <div className="relative col-start-2 mt-0.5 h-3 text-[10px] leading-3 text-white/45" aria-hidden="true">
                {METER_TICKS.map((db, index) => (
                  <span key={db} className={`absolute ${db === -48 || db === -24 || db === -12 ? 'hidden sm:block' : ''}`}
                    style={{ left: `${levelPercent(db)}%`, transform: `translateX(-${index === 0 ? 0 : db === 0 ? 100 : 50}%)` }}>{db}</span>
                ))}
              </div>
            </div>
          </div>

          {mode === 'range' ? (
            <p className="mt-2 text-[11px] leading-5 text-white/35">
              单击波形定位播放指针（也可直接拖动绿线）；拖橙色边界调首尾；拖范围内侧整体平移；拖空白处重新框选。
            </p>
          ) : mode === 'cut' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] leading-5 text-white/35">
                拖动波形框选，拖到两侧可继续延伸。也可输入待删起止秒数，或点击下方已删时段调整和恢复。
              </p>
              {selectedCutIndex >= 0 && <span className="text-xs text-amber-200/80">已选中第 {selectedCutIndex + 1} 个删除段</span>}
              <button
                type="button"
                disabled={!canApplyCut}
                onClick={addCut}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-red-400/90 px-3 text-xs font-black text-black transition hover:bg-red-300 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />{selectedCutIndex >= 0 ? '应用调整' : '删除这段'}
              </button>
              <button
                type="button"
                disabled={selectedCutIndex < 0}
                onClick={() => updateCut()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 text-xs font-black text-emerald-200 transition hover:bg-emerald-300/20 disabled:opacity-30"
              >
                <Redo2 className="h-3.5 w-3.5" />恢复这段
              </button>
              <button
                type="button"
                disabled={!canCommentSelection}
                onClick={commentSelection}
                title="给框选的这段写主题 / 备注（和 M 标记同一份档案，可拖两端微调）"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-200/40 bg-sky-300/10 px-3 text-xs font-black text-sky-100 transition hover:bg-sky-300/20 disabled:opacity-30"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />评论选区
              </button>
            </div>
          ) : (
            <div data-gain-controls className="mt-2 rounded-xl border border-sky-200/20 bg-sky-300/5 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <GainControl label="本次调整" db={selectionDb} onChange={db => { setSelectionDb(db); setGainError(''); }} />
                <button type="button" disabled={!canApplyGain || selectionDb === 0} onClick={() => applySelectionGain(selectionDb)}
                  className="rounded-lg bg-sky-200 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-30">叠加到选区</button>
                <button type="button" disabled={!canApplyGain || !selectedGainSummary?.hasGain} onClick={() => applySelectionGain('reset')}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 disabled:opacity-30">还原选区</button>
                <button
                  type="button" disabled={!canCommentSelection} onClick={commentSelection}
                  title="给框选的这段写主题 / 备注（和 M 标记同一份档案，可拖两端微调）"
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200/40 bg-sky-300/10 px-2.5 py-1.5 text-xs font-bold text-sky-100 transition hover:bg-sky-300/20 disabled:opacity-30"
                >
                  <MessageSquarePlus aria-hidden="true" className="h-3.5 w-3.5" />评论选区
                </button>
                <p className="text-xs text-white/60">
                  {selection
                    ? `${formatDuration(selection.start, true)}–${formatDuration(selection.end, true)}`
                    : '拖出选区，或点选已调整的区域。'}
                </p>
              </div>
              {selection && (
                <p aria-label="选区采样峰值和增益余量" className="mt-1 flex flex-wrap gap-x-3 text-xs text-sky-100/85">
                  <PeakHeadroom peak={selectedPeak} />
                  {selectedGainSummary && <span>局部累计 {selectedGainSummary.label}</span>}
                </p>
              )}
              {gainError && <p role="alert" className="mt-1 text-xs text-red-200">{gainError}</p>}
              {gain.ranges.length > 0 && (
                <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                  {gain.ranges.filter(range => range.end > start && range.start < end).map(range => (
                    <button key={range.start} type="button" onClick={() => selectGainRange(range)}
                      aria-pressed={selection?.start === Math.max(start, range.start) && selection?.end === Math.min(end, range.end)}
                      className="rounded-full border border-sky-200/25 px-2.5 py-1 font-mono text-[11px] text-sky-100 hover:bg-sky-300/15 aria-pressed:border-sky-200/60 aria-pressed:bg-sky-300/15">
                      {formatDuration(range.start, true)}–{formatDuration(range.end, true)} · {formatGain(range.db)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {visibleCuts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleCuts.map((cut, index) => {
                const active = index === selectedCutIndex;
                return (
                  <button
                    key={`${cut.start}-${index}`}
                    type="button"
                    onClick={() => { setMode('cut'); setCutDraft({ ...cut, original: cut }); }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${active ? 'border-amber-300/60 bg-amber-300/15 text-amber-100' : 'border-red-300/25 bg-red-300/8 text-red-200/75 hover:border-red-300/45'}`}
                  >
                    <Trash2 className="h-3 w-3" />{formatDuration(cut.start, true)}–{formatDuration(cut.end, true)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/30">
            <button type="button" aria-keyshortcuts="M" onClick={addMarker} className="inline-flex items-center gap-1 rounded text-sky-200/80 hover:text-sky-100">
              <kbd className="rounded border border-sky-200/25 bg-sky-300/10 px-1.5 py-0.5 font-mono">M</kbd>标记指针
            </button>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">空格</kbd>播放/暂停</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">← →</kbd>指针 ±0.1s</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Shift</kbd>±1s</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Alt</kbd>±0.01s</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Delete</kbd>删除选中段</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Ctrl+Z</kbd>撤回（删段 / 两个增益）</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Ctrl+Y / Ctrl+Shift+Z</kbd>重做</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Ctrl+S</kbd>保存裁剪</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Home / End</kbd>首尾</span>
            <span className="inline-flex items-center gap-1 text-sky-200/45">拖动蓝色旗标可左右微调标记位置；框选后点「评论选区」可给这段写备注</span>
          </div>

          {markers.length > 0 && (
            <ul aria-label="音频标记" className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
              {markers.map((marker) => {
                const { time, topic, note, color } = marker;
                const span = isAudioMarkerSpan(marker);
                // 区间标记在列表里带终点，一眼能分清「点标记」和「片段评论」。
                const label = span ? `${markerTimeLabel(time)}–${markerTimeLabel(marker.end!)}` : markerTimeLabel(time);
                const preview = topic?.trim() || note.trim();
                return (
                  <li key={time} className="inline-flex max-w-full items-center rounded-full border border-white/15 bg-white/[.06] text-white/85">
                    <button type="button" aria-label={`跳到${span ? '片段评论' : '标记'} ${label}`} onClick={() => jumpToMarker(time)} style={{ color }} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-l-full pl-2 pr-1 font-mono text-[11px] hover:bg-white/10">
                      {span ? <ArrowLeftRight aria-hidden="true" className="h-3 w-3" /> : <Flag aria-hidden="true" className="h-3 w-3" />}{label}
                    </button>
                    <button
                      type="button"
                      aria-label={`编辑${span ? '片段评论' : '标记'} ${label}的主题、备注和颜色`}
                      aria-expanded={editingMarkerTime === time}
                      aria-controls="audio-marker-editor"
                      title={[topic?.trim(), note.trim()].filter(Boolean).join('\n') || '编辑主题、备注和颜色'}
                      onClick={() => setEditingMarkerTime(time)}
                      className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 border-l border-white/10 px-1.5 text-[11px] text-white/75 hover:bg-white/10 aria-expanded:bg-white/10"
                    >
                      <Pencil aria-hidden="true" className="h-3 w-3 shrink-0" />
                      {preview && <span className="max-w-[7rem] truncate">{preview}</span>}
                    </button>
                    {(['start', 'end'] as const).map(field => {
                      const { min, max } = getBoundaryLimits(field);
                      const boundary = field === 'start' ? '起点' : '终点';
                      const target = `${mode === 'cut' ? '待删' : mode === 'gain' ? '选区' : '范围'}${boundary}`;
                      const allowed = time >= min - 1e-9 && time <= max + 1e-9;
                      return (
                        <button
                          key={field}
                          type="button"
                          aria-label={`将标记 ${label} 设为${target}`}
                          title={allowed ? `设为${target}` : `此标记超出${target}的可用范围`}
                          disabled={!allowed}
                          onClick={() => { stopPlayback(); setBoundaryInput(null); setBoundary(field, time); }}
                          className="min-h-8 min-w-8 shrink-0 whitespace-nowrap border-l border-white/10 px-1.5 text-[11px] enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-35"
                        >{field === 'start' ? '起' : '终'}</button>
                      );
                    })}
                    <button type="button" aria-label={`移除标记 ${label}`} onClick={() => {
                      setMarkers(current => current.filter(marker => marker.time !== time));
                      if (editingMarkerTime === time) setEditingMarkerTime(null);
                    }} className="grid min-h-8 w-7 shrink-0 place-items-center rounded-r-full text-white/55 hover:bg-white/10 hover:text-white">
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {editingMarker && (
            <div
              id="audio-marker-editor"
              ref={markerEditorRef}
              tabIndex={-1}
              className="mt-3 grid max-w-xl gap-3 rounded-xl border border-white/12 border-l-2 bg-[#15151d] p-3 outline-none sm:p-4"
              style={{ borderLeftColor: editingMarker.color }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: editingMarker.color }}>
                  {editingIsSpan ? <ArrowLeftRight aria-hidden="true" className="h-4 w-4" /> : <Flag aria-hidden="true" className="h-4 w-4" />}
                  <span className="font-mono tabular-nums">
                    {editingIsSpan
                      ? `${markerTimeLabel(editingStart)} – ${markerTimeLabel(editingEnd)}`
                      : markerTimeLabel(editingStart)}
                  </span>
                  <span className="text-[11px] font-normal opacity-75">{editingIsSpan ? '片段评论' : '标记'}</span>
                </div>
                <button type="button" onClick={() => setEditingMarkerTime(null)} className="min-h-8 rounded-lg px-3 text-xs font-bold text-white/65 hover:bg-white/10 hover:text-white">完成</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                <span>{editingIsSpan ? '可拖波形上的旗标改起点、右端把手改终点。' : '想给一段写评论？框选后点「评论选区」。'}</span>
                <button
                  type="button"
                  disabled={!canCommentSelection}
                  onClick={() => retargetMarker(editingMarker.time)}
                  title={canCommentSelection ? '把这条改成当前框选的范围' : '先在波形上框选一段'}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200/30 bg-sky-300/10 px-2.5 py-1 font-bold text-sky-100 transition hover:bg-sky-300/20 disabled:opacity-30"
                >
                  <MessageSquarePlus aria-hidden="true" className="h-3 w-3" />用当前选区
                </button>
              </div>
              <label className="grid gap-1.5 text-xs font-semibold text-white/75">
                主题
                <input
                  type="text"
                  value={editingMarker.topic ?? ''}
                  onChange={event => updateMarker(editingMarker.time, { topic: event.currentTarget.value })}
                  className="min-w-0 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-sky-300/55"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-white/75">
                备注
                <textarea
                  rows={3}
                  value={editingMarker.note}
                  onChange={event => updateMarker(editingMarker.time, { note: event.currentTarget.value })}
                  className="min-w-0 resize-y rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-sky-300/55"
                />
              </label>
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-xs font-semibold text-white/75">标记颜色</legend>
                <div className="flex flex-wrap gap-1.5">
                  {AUDIO_MARKER_COLORS.map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={label}
                      title={label}
                      aria-pressed={editingMarker.color === value}
                      onClick={() => updateMarker(editingMarker.time, { color: value })}
                      className="grid h-9 w-9 place-items-center rounded-full border border-transparent hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current aria-pressed:border-current"
                      style={{ color: value }}
                    >
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-current">
                        {editingMarker.color === value && <Check aria-hidden="true" className="h-3 w-3 text-[#14141c]" />}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(['start', 'end'] as const).map((field) => {
              const value = activeRange[field];
              const label = `${mode === 'cut' ? '待删' : mode === 'gain' ? '选区' : '范围'}${field === 'start' ? '起点' : '终点'}`;
              const { min, max } = getBoundaryLimits(field);
              return (
                <div key={field} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                  <div className="mb-1.5 text-[10px] font-bold tracking-widest text-white/35">{label}</div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => nudge(field, -1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">−1s</button>
                    <button type="button" onClick={() => nudge(field, -0.1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">−0.1</button>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={0.001}
                      placeholder={mode !== 'range' ? '秒数' : undefined}
                      value={boundaryInput?.field === field ? boundaryInput.text : value === undefined ? '' : Number(value.toFixed(3))}
                      onChange={(event) => {
                        const input = event.currentTarget;
                        setBoundaryInput({ field, text: input.value });
                        if (Number.isFinite(input.valueAsNumber)) setBoundary(field, Number(input.valueAsNumber.toFixed(3)));
                        else if (!input.validity.badInput) setBoundary(field, undefined);
                      }}
                      onBlur={() => setBoundaryInput(null)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        event.currentTarget.blur();
                      }}
                      className="h-8 w-full min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-center font-mono text-xs text-white outline-none focus:border-orange-300/45"
                      aria-label={`${label}秒数`}
                    />
                    <button type="button" onClick={() => nudge(field, 0.1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">+0.1</button>
                    <button type="button" onClick={() => nudge(field, 1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">+1s</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/8 px-4 py-3 sm:px-6 sm:py-4">
          <button type="button" onClick={() => (playing ? stopPlayback() : void play())} className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black transition ${playing ? 'bg-emerald-300 text-black' : 'bg-white/10 text-white hover:bg-white/16'}`}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? '停止试听' : '试听（从指针开始）'}
          </button>
          {saveError && <p role="alert" className="text-xs text-rose-200">{saveError}</p>}
          {!saveError && saved.confirmed && !dirty && !markersChanged && (
            <p role="status" className="text-xs text-emerald-300">裁剪已保存到本机</p>
          )}
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[10px] text-white/30 sm:flex">
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono">Ctrl+S</kbd>保存
            </span>
            <button type="button" onClick={requestClose} className="h-11 rounded-full border border-white/12 px-5 text-sm font-bold text-white/65 transition hover:border-white/25 hover:text-white">取消</button>
            <button
              type="button"
              disabled={saving || !canSave}
              onClick={save}
              aria-keyshortcuts="Control+S"
              title={canSave ? '保存裁剪（Ctrl+S）' : '保留的片段太短了'}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-6 text-sm font-black text-black transition hover:bg-orange-300 disabled:opacity-40"
            >
              <Scissors className="h-4 w-4" />{saving ? '保存中…' : '保存裁剪'}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
};

export default AudioTrimDialog;
