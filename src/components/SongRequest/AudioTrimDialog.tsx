import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Flag, Minus, Pause, Pencil, Play, Redo2, RotateCcw, Scissors, Trash2, Volume2, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  createSamplePeakReader, formatDuration, getAudioContext, measureSamplePeak, sampleHeadroomDb, type ReadSamplePeak,
} from './audioClipping';
import {
  adjustGainRange, clampGainDb, dbToGain, DEFAULT_RECORDING_GAIN, MAX_GAIN_DB, MAX_GAIN_RANGES, MIN_GAIN_DB,
  resolveGainSegments, sameRecordingGain, scheduleAudioGain, type RecordingGain,
} from './audioGain';
import { AUDIO_MARKER_COLORS, DEFAULT_AUDIO_MARKER_COLOR, normalizeAudioMarkers, type AudioMarker } from './audioMarkers';
import { keptDuration, normalizeAudioCuts, resolveKeptSegments, type AudioCut } from './songRecordings';

interface AudioTrimDialogProps {
  recordingTitle: string;
  buffer: AudioBuffer;
  initialStart: number;
  initialEnd: number;
  initialCuts?: AudioCut[];
  initialGain?: RecordingGain;
  initialMarkers: AudioMarker[];
  noteStorageKey: string;
  minimized: boolean;
  onMinimize: () => void;
  saving?: boolean;
  onCancel: () => void;
  onSave: (clip: { start: number; end: number; cuts: AudioCut[]; gain?: RecordingGain; markers?: AudioMarker[] }) => boolean;
}

type EditMode = 'range' | 'cut' | 'gain';
type Boundary = keyof AudioCut;
type CutDraft = Partial<AudioCut> & { original?: AudioCut };

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
    <label className="mt-1 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2 py-0.5">
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

const markerTimeLabel = (time: number) => {
  const milliseconds = Math.round(time * 1000);
  return `${formatDuration(Math.floor(milliseconds / 1000))}.${String(milliseconds % 1000).padStart(3, '0')}`;
};

const boundaryLimits = (field: Boundary, range: Partial<AudioCut>, min: number, max: number) => (
  field === 'start'
    ? { min, max: Math.max(min, (range.end ?? max) - MIN_CLIP_SECONDS) }
    : { min: Math.min(max, (range.start ?? min) + MIN_CLIP_SECONDS), max }
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
  initialMarkers, noteStorageKey, minimized, onMinimize, saving = false, onCancel, onSave,
}: AudioTrimDialogProps) => {
  const duration = buffer.duration;
  const readPeak = useMemo(() => createSamplePeakReader(buffer), [buffer]);

  const [start, setStart] = useState(() => clamp(initialStart, 0, Math.max(0, duration - MIN_CLIP_SECONDS)));
  const [end, setEnd] = useState(() => clamp(initialEnd, start + MIN_CLIP_SECONDS, duration));
  const [{ cutHistory, cutHistoryIndex }, setCutState] = useState(() => ({
    cutHistory: [normalizeAudioCuts(initialCuts, start, end)],
    cutHistoryIndex: 0,
  }));
  const cuts = cutHistory[cutHistoryIndex];
  const [mode, setMode] = useState<EditMode>('cut');
  const [gain, setGain] = useState(initialGain);
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
  const editingMarker = markers.find(marker => marker.time === editingMarkerTime);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState({ start, end, cuts, gain, markers, confirmed: false });

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

  const updateMarker = (time: number, patch: Partial<Pick<AudioMarker, 'topic' | 'note' | 'color'>>) => {
    setMarkers(current => current.map(marker => marker.time === time ? { ...marker, ...patch } : marker));
  };

  const jumpToMarker = (time: number) => {
    stopPlayback();
    setPlayhead(time);
    const offset = timeline.toDisplay(time);
    if (offset < viewStart || offset > viewEnd) panViewTo(offset - viewSpan / 2);
  };

  const markersChanged = saved.markers.length !== markers.length
    || markers.some((marker, index) => {
      const previous = saved.markers[index];
      return marker.time !== previous.time || marker.topic !== previous.topic
        || marker.note !== previous.note || marker.color !== previous.color;
    });

  const save = () => {
    stopPlayback();
    if (!onSave({
      start, end, cuts: visibleCuts,
      gain: sameRecordingGain(gain, saved.gain) ? undefined : gain,
      markers: markersChanged ? markers : undefined,
    })) {
      setSaveError('裁剪无法保存到本机，请重试。');
      return;
    }
    setCutState(current => ({
      ...current,
      cutHistory: current.cutHistory.map((snapshot, index) => index === current.cutHistoryIndex ? visibleCuts : snapshot),
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
    stopPlayback();
    setGain({ ...gain, ranges });
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
    onCancel();
  }, [dirty, markersChanged, onCancel]);

  const updateCut = useCallback((replacement?: AudioCut) => {
    stopPlayback();
    setCutState((current) => {
      const currentCuts = current.cutHistory[current.cutHistoryIndex];
      const remaining = originalCut
        ? currentCuts.filter((cut) => cut.end <= originalCut.start || cut.start >= originalCut.end)
        : currentCuts;
      const nextCuts = replacement ? normalizeAudioCuts([...remaining, replacement], start, end) : remaining;
      if (nextCuts.length === currentCuts.length && nextCuts.every((cut, index) => (
        cut.start === currentCuts[index].start && cut.end === currentCuts[index].end
      ))) return current;
      const cutHistoryIndex = current.cutHistoryIndex + 1;
      return { cutHistory: [...current.cutHistory.slice(0, cutHistoryIndex), nextCuts], cutHistoryIndex };
    });
    setCutDraft(null);
    setBoundaryInput(null);
  }, [originalCut, start, end, stopPlayback]);

  const stepCutHistory = useCallback((step: -1 | 1) => {
    const nextIndex = cutHistoryIndex + step;
    if (nextIndex < 0 || nextIndex >= cutHistory.length) return;
    stopPlayback();
    setCutState(current => ({
      ...current,
      cutHistoryIndex: clamp(current.cutHistoryIndex + step, 0, current.cutHistory.length - 1),
    }));
    setCutDraft(null);
    setBoundaryInput(null);
  }, [cutHistory.length, cutHistoryIndex, stopPlayback]);

  const addCut = useCallback(() => {
    if (canApplyCut && selection) updateCut(selection);
  }, [canApplyCut, selection, updateCut]);

  // 键盘控制播放指针：←/→ 微调，Shift ±1s、Alt ±0.01s；空格播放/暂停；Home/End 到首尾。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current?.open) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!event.defaultPrevented && !event.isComposing && event.ctrlKey && !event.altKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z' || (key === 'y' && !event.shiftKey)) {
          event.preventDefault();
          if (!event.repeat) stepCutHistory(key === 'z' && !event.shiftKey ? -1 : 1);
          return;
        }
      }
      if (!event.defaultPrevented && !event.isComposing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        addMarker();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
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
      if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'cut' && canApplyCut) {
        event.preventDefault();
        addCut();
        return;
      }
      if (event.key === 'Home') { event.preventDefault(); setPlayhead(start); return; }
      if (event.key === 'End') { event.preventDefault(); setPlayhead(end); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movePlayhead, playing, stopPlayback, play, start, end, mode, canApplyCut, addCut, addMarker, stepCutHistory]);

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
  const canSave = kept >= MIN_CLIP_SECONDS;
  const viewMarkers = markers.filter(marker => timeline.contains(marker.time));
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
            <RecordingNote key={noteStorageKey} storageKey={noteStorageKey} />
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums">
              <span className="whitespace-nowrap text-white/45">范围 <b className="font-black text-orange-200">{formatDuration(start, true)}</b> → <b className="font-black text-orange-200">{formatDuration(end, true)}</b></span>
              <span className="whitespace-nowrap text-white/45">指针{timeline.length < duration && '（原音频）'} <b className="font-black text-emerald-300">{formatDuration(playhead, true)}</b></span>
              <span className="whitespace-nowrap text-white/45">保留 <b className="font-black text-emerald-300">{formatDuration(kept, true)}</b></span>
              {visibleCuts.length > 0 && <span className="whitespace-nowrap text-red-200/80">已删 {visibleCuts.length} 段（{formatDuration(Math.max(0, (end - start) - kept), true)}）</span>}
            </div>
            <div data-gain-controls className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-sky-300/5 px-2 py-1">
              <Volume2 aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-sky-200 sm:block" />
              <GainControl compact label="整段增益" db={gain.overallDb} onChange={overallDb => setGain(current => ({ ...current, overallDb }))} />
              <button type="button" onClick={() => setGain(current => ({ ...current, overallDb: 0 }))}
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
              {viewMarkers.map(({ time, color }) => (
                <span key={time} aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px opacity-75" style={{ left: `${timeline.toDisplay(time) / timeline.length * 100}%`, backgroundColor: color }} />
              ))}
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
            {viewSpan > 0 && viewMarkers.map(({ time, color, topic, note }) => {
              const position = timeline.toDisplay(time);
              if (position < viewStart || position > viewEnd) return null;
              const label = markerTimeLabel(time);
              return (
                <div key={time} className="pointer-events-none absolute inset-y-0 border-l border-dashed border-current" style={{ left: `${xAtTime(time, 100)}%`, color }}>
                  <button
                    type="button"
                    aria-label={`编辑标记 ${label}`}
                    aria-expanded={editingMarkerTime === time}
                    aria-controls="audio-marker-editor"
                    title={[topic?.trim(), note.trim()].filter(Boolean).join('\n') || `编辑标记 ${label}`}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => setEditingMarkerTime(time)}
                    className="pointer-events-auto absolute top-0 z-10 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-md hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
                  >
                    <Flag aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
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
            </div>
          ) : (
            <div data-gain-controls className="mt-2 rounded-xl border border-sky-200/20 bg-sky-300/5 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <GainControl label="本次调整" db={selectionDb} onChange={db => { setSelectionDb(db); setGainError(''); }} />
                <button type="button" disabled={!canApplyGain || selectionDb === 0} onClick={() => applySelectionGain(selectionDb)}
                  className="rounded-lg bg-sky-200 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-30">叠加到选区</button>
                <button type="button" disabled={!canApplyGain || !selectedGainSummary?.hasGain} onClick={() => applySelectionGain('reset')}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 disabled:opacity-30">还原选区</button>
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
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Ctrl+Z</kbd>撤回片段操作</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Ctrl+Y / Ctrl+Shift+Z</kbd>重做片段操作</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Home / End</kbd>首尾</span>
          </div>

          {markers.length > 0 && (
            <ul aria-label="音频标记" className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
              {markers.map(({ time, topic, note, color }) => {
                const label = markerTimeLabel(time);
                const preview = topic?.trim() || note.trim();
                return (
                  <li key={time} className="inline-flex max-w-full items-center rounded-full border border-white/15 bg-white/[.06] text-white/85">
                    <button type="button" aria-label={`跳到标记 ${label}`} onClick={() => jumpToMarker(time)} style={{ color }} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-l-full pl-2 pr-1 font-mono text-[11px] hover:bg-white/10">
                      <Flag aria-hidden="true" className="h-3 w-3" />{label}
                    </button>
                    <button
                      type="button"
                      aria-label={`编辑标记 ${label}的主题、备注和颜色`}
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
                  <Flag aria-hidden="true" className="h-4 w-4" />
                  <span className="font-mono tabular-nums">{markerTimeLabel(editingMarker.time)}</span>
                </div>
                <button type="button" onClick={() => setEditingMarkerTime(null)} className="min-h-8 rounded-lg px-3 text-xs font-bold text-white/65 hover:bg-white/10 hover:text-white">完成</button>
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
            <button type="button" onClick={requestClose} className="h-11 rounded-full border border-white/12 px-5 text-sm font-bold text-white/65 transition hover:border-white/25 hover:text-white">取消</button>
            <button
              type="button"
              disabled={saving || !canSave}
              onClick={save}
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
