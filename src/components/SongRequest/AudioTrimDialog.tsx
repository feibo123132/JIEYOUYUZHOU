import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Flag, Pause, Pencil, Play, Redo2, RotateCcw, Scissors, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { computeWaveformPeaks, formatDuration, getAudioContext } from './audioClipping';
import { AUDIO_MARKER_COLORS, DEFAULT_AUDIO_MARKER_COLOR, parseAudioMarkers, type AudioMarker } from './audioMarkers';
import { keptDuration, normalizeAudioCuts, resolveKeptSegments, type AudioCut } from './songRecordings';

interface AudioTrimDialogProps {
  songTitle: string;
  recordingTitle: string;
  markerStorageKey: string;
  buffer: AudioBuffer;
  initialStart: number;
  initialEnd: number;
  initialCuts?: AudioCut[];
  saving?: boolean;
  onCancel: () => void;
  onSave: (clip: { start: number; end: number; cuts: AudioCut[] }) => boolean;
}

type EditMode = 'range' | 'cut';
type Boundary = keyof AudioCut;
type CutDraft = Partial<AudioCut> & { original?: AudioCut };

const HANDLE_HIT_PX = 14;
const MIN_CLIP_SECONDS = 0.05;
const MIN_VIEW_SECONDS = 0.4;
const PEAK_BUCKETS = 12_000;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const readMarkers = (key: string, duration: number): AudioMarker[] => {
  try {
    return parseAudioMarkers(localStorage.getItem(key) ?? '[]', duration);
  } catch { return []; }
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
  context: CanvasRenderingContext2D, left: number, width: number, height: number, peaks: Float32Array,
  firstIndex: number, lastIndex: number, colorAt: (x: number) => string,
) => {
  const visibleCount = Math.max(1, lastIndex - firstIndex);
  const columnStep = 2;
  for (let x = 0; x < width; x += columnStep) {
    const from = firstIndex + Math.floor((x / width) * visibleCount);
    const to = Math.min(lastIndex, firstIndex + Math.ceil(((x + columnStep) / width) * visibleCount));
    let amplitude = 0;
    for (let index = from; index < Math.min(peaks.length, Math.max(from + 1, to)); index += 1) {
      if (peaks[index] > amplitude) amplitude = peaks[index];
    }
    const barHeight = Math.max(1, amplitude * height * 0.86);
    context.fillStyle = colorAt(left + x);
    context.fillRect(left + x, (height - barHeight) / 2, Math.min(columnStep - 1, width - x), barHeight);
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
  context: CanvasRenderingContext2D, width: number, height: number, peaks: Float32Array, duration: number,
  timeline: ReturnType<typeof buildWaveformTimeline>, viewStart: number, viewEnd: number,
  colorAt: (x: number) => string,
) => {
  if (viewEnd <= viewStart) return;
  const pixelsPerSecond = width / (viewEnd - viewStart);
  for (const part of timeline.segments) {
    const from = Math.max(viewStart, part.offset);
    const to = Math.min(viewEnd, part.offset + (part.end - part.start));
    if (to <= from) continue;
    const sourceFrom = part.start + (from - part.offset);
    const sourceTo = part.start + (to - part.offset);
    drawWaveformBars(context, (from - viewStart) * pixelsPerSecond, (to - from) * pixelsPerSecond, height, peaks,
      Math.floor(sourceFrom / duration * peaks.length), Math.ceil(sourceTo / duration * peaks.length), colorAt);
  }
};

const AudioTrimDialog = ({
  songTitle, recordingTitle, markerStorageKey, buffer, initialStart, initialEnd, initialCuts = [], saving = false, onCancel, onSave,
}: AudioTrimDialogProps) => {
  const duration = buffer.duration;
  const peaks = useMemo(() => computeWaveformPeaks(buffer, PEAK_BUCKETS), [buffer]);

  const [start, setStart] = useState(() => clamp(initialStart, 0, Math.max(0, duration - MIN_CLIP_SECONDS)));
  const [end, setEnd] = useState(() => clamp(initialEnd, start + MIN_CLIP_SECONDS, duration));
  const [{ cutHistory, cutHistoryIndex }, setCutState] = useState(() => ({
    cutHistory: [normalizeAudioCuts(initialCuts, start, end)],
    cutHistoryIndex: 0,
  }));
  const cuts = cutHistory[cutHistoryIndex];
  const [mode, setMode] = useState<EditMode>('range');
  const [cutDraft, setCutDraft] = useState<CutDraft | null>(null);
  const [boundaryInput, setBoundaryInput] = useState<{ field: Boundary; text: string } | null>(null);
  const [view, setView] = useState<{ sourceStart: number; span: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  // 播放指针：可点击/拖拽/键盘定位，试听从这里开始。
  const [playhead, setPlayhead] = useState<number>(() => clamp(initialStart, 0, duration));
  const [markers, setMarkers] = useState(() => readMarkers(markerStorageKey, duration));
  const [editingMarkerTime, setEditingMarkerTime] = useState<number | null>(null);
  const editingMarker = markers.find(marker => marker.time === editingMarkerTime);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState({ start, end, cuts, markers, confirmed: false });

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

  const timeline = useMemo(() => buildWaveformTimeline(cuts, duration), [cuts, duration]);
  const viewSpan = Math.min(view?.span ?? timeline.length, timeline.length);
  const maxViewStart = timeline.length - viewSpan;
  const viewStart = view ? clamp(timeline.toDisplay(view.sourceStart), 0, maxViewStart) : 0;
  const viewEnd = viewStart + viewSpan;
  const timeAtX = (x: number, width: number) => timeline.toSource(viewStart + (x / Math.max(1, width)) * viewSpan);
  const xAtTime = useCallback((time: number, width: number) => viewSpan > 0
    ? ((timeline.toDisplay(time) - viewStart) / viewSpan) * width : 0, [timeline, viewStart, viewSpan]);

  const visibleCuts = useMemo(() => normalizeAudioCuts(cuts, start, end), [cuts, start, end]);
  const kept = useMemo(() => keptDuration(start, end, cuts), [start, end, cuts]);
  const selection = useMemo(() => {
    if (cutDraft?.start === undefined || cutDraft.end === undefined) return null;
    return { start: cutDraft.start, end: cutDraft.end };
  }, [cutDraft]);
  const originalCut = cutDraft?.original;
  const selectedCutIndex = originalCut
    ? visibleCuts.findIndex((cut) => cut.start === originalCut.start && cut.end === originalCut.end)
    : -1;
  const canApplyCut = Boolean(selection && selection.end - selection.start > 0.01
    && (!originalCut || selection.start !== originalCut.start || selection.end !== originalCut.end));

  const stopPlayback = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playbackRef.current = null;
    for (const source of sourcesRef.current) {
      try { source.onended = null; source.stop(); } catch { /* 已停止 */ }
    }
    sourcesRef.current = [];
    setPlaying(false);
    // 指针保留在当前位置，方便暂停后继续定位。
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const page = document.documentElement;
    const previousOverflow = page.style.overflow;
    dialog.showModal();
    page.style.overflow = 'hidden';
    return () => {
      dialog.close();
      page.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const surface = prepareWaveform(canvas);
      if (!surface) return;
      const { context, width, height } = surface;
      drawJoinedWaveform(context, width, height, peaks, duration, timeline, 0, timeline.length, () => '#a8b9ca');
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, duration, timeline]);

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

    // 当前选择（删除模式）
    if (mode === 'cut' && selection) {
      const from = clamp(xAtTime(selection.start, width), 0, width);
      const to = clamp(xAtTime(selection.end, width), 0, width);
      if (to > from) {
        context.fillStyle = 'rgba(250,204,21,0.12)';
        context.fillRect(from, 0, to - from, height);
        context.strokeStyle = 'rgba(250,204,21,0.8)';
        context.lineWidth = 1;
        context.setLineDash([5, 4]);
        context.strokeRect(Math.round(from) + 0.5, 1, Math.max(1, to - from - 1), height - 2);
        context.setLineDash([]);
      }
    }

    // 波形
    drawJoinedWaveform(context, width, height, peaks, duration, timeline, viewStart, viewEnd,
      x => x >= rangeStartX && x <= rangeEndX ? 'rgba(253,186,116,0.9)' : 'rgba(255,255,255,0.18)');

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
  }, [duration, end, mode, peaks, selection, start, timeline, viewEnd, viewSpan, viewStart, xAtTime]);

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
    if (viewSpan <= 0) return;
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
    if (!nearRangeHandle && Math.abs(x - xAtTime(playhead, rect.width)) <= 7) {
      setPlayhead(clamp(time, start, end));
      dragRef.current = { mode: 'playhead', originX: x, originStart: start, originEnd: end, anchorTime: time };
      return;
    }

    if (mode === 'cut') {
      // 先记录锚点，等确认是拖动才生成选区；单击则定位指针。
      setCutDraft(null);
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

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
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
      const time = clamp(timeAtX(x, rect.width), 0, duration);
      const anchor = drag.anchorTime;
      if (mode === 'cut') {
        const nextSelection = time >= anchor
          ? { start: anchor, end: Math.min(duration, Math.max(anchor + MIN_CLIP_SECONDS, time)) }
          : { start: Math.max(0, time), end: Math.max(anchor, time + MIN_CLIP_SECONDS) };
        setCutDraft(nextSelection);
        return;
      }
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

  const handlePointerUp = () => {
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
        return;
      }
      if (mode === 'cut' && drag.mode === 'create') {
        setCutDraft((current) => {
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
    // 分段精确调度：删除段被直接跳过，段与段之间无缝衔接。
    const startedAt = context.currentTime + 0.03;
    let cursor = startedAt;
    const timeline: Array<{ at: number; from: number; duration: number }> = [];
    for (const part of parts) {
      const partDuration = part.end - part.start;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(cursor, part.start, partDuration);
      sourcesRef.current.push(source);
      timeline.push({ at: cursor, from: part.start, duration: partDuration });
      cursor += partDuration;
    }
    playbackRef.current = { startedAt, total: cursor - startedAt, timeline };
    setPlaying(true);
    const tick = () => {
      const playback = playbackRef.current;
      if (!playback) return;
      const elapsed = context.currentTime - playback.startedAt;
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
      : [...current, { time, note: '', color: DEFAULT_AUDIO_MARKER_COLOR }].sort((left, right) => left.time - right.time));
  };

  const updateMarker = (time: number, patch: Partial<Pick<AudioMarker, 'note' | 'color'>>) => {
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
      return marker.time !== previous.time || marker.note !== previous.note || marker.color !== previous.color;
    });

  const save = () => {
    if (markersChanged) {
      try { localStorage.setItem(markerStorageKey, JSON.stringify(markers)); }
      catch { setSaveError('浏览器无法保存标记，请重试。'); return; }
    }
    stopPlayback();
    if (!onSave({ start, end, cuts: visibleCuts })) {
      setSaveError('裁剪无法保存到本机，请重试。');
      return;
    }
    setCutState(current => ({
      ...current,
      cutHistory: current.cutHistory.map((snapshot, index) => index === current.cutHistoryIndex ? visibleCuts : snapshot),
    }));
    setSaved({ start, end, cuts: visibleCuts, markers, confirmed: true });
    setSaveError('');
  };

  // 有未保存改动时先确认，避免手快点了「取消」白剪一场。
  const dirty = useMemo(() => {
    if (start.toFixed(3) !== saved.start.toFixed(3) || end.toFixed(3) !== saved.end.toFixed(3)) return true;
    if (saved.cuts.length !== cuts.length) return true;
    return cuts.some((cut, index) => (
      cut.start !== saved.cuts[index].start || cut.end !== saved.cuts[index].end
    ));
  }, [cuts, end, saved, start]);

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
      if (event.key === ' ' && !target?.closest?.('[aria-controls="audio-marker-editor"], #audio-marker-editor button')) {
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
    if (mode === 'cut') {
      setCutDraft((current) => {
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

  const activeRange = mode === 'cut' ? cutDraft ?? {} : { start, end };
  const getBoundaryLimits = (field: Boundary) => boundaryLimits(
    field, activeRange, mode === 'cut' ? start : 0, mode === 'cut' ? end : duration,
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
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-orange-200/70">
              <Scissors className="h-3.5 w-3.5" />AUDIO TRIM
            </div>
            <h2 className="mt-1 truncate font-serif text-xl font-black text-white sm:text-2xl">{recordingTitle}</h2>
            <p className="mt-0.5 truncate text-xs text-white/40">{songTitle}</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="关闭裁剪" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4 [&>*]:shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-white/10 bg-black/30 p-1">
              <button type="button" onClick={() => { setMode('range'); setCutDraft(null); }} className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${mode === 'range' ? 'bg-orange-300 text-black' : 'text-white/55 hover:text-white'}`}>裁剪首尾</button>
              <button type="button" onClick={() => setMode('cut')} className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${mode === 'cut' ? 'bg-red-300 text-black' : 'text-white/55 hover:text-white'}`}>删除中间片段</button>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => zoomBy(1 / 1.6)} title="缩小" aria-label="缩小波形" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white"><ZoomOut className="h-4 w-4" /></button>
              <button type="button" onClick={resetView} title="显示全曲" aria-label="显示全曲" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-bold text-white/60 transition hover:border-white/25 hover:text-white"><RotateCcw className="h-3.5 w-3.5" />全曲</button>
              <button type="button" onClick={() => zoomBy(1.6)} title="放大" aria-label="放大波形" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/60 transition hover:border-white/25 hover:text-white"><ZoomIn className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1 font-mono text-sm tabular-nums">
            <span className="text-white/45">范围 <b className="font-black text-orange-200">{formatDuration(start, true)}</b> → <b className="font-black text-orange-200">{formatDuration(end, true)}</b></span>
            <span className="text-white/45">指针{timeline.length < duration && '（原音频）'} <b className="font-black text-emerald-300">{formatDuration(playhead, true)}</b></span>
            <span className="text-white/45">保留 <b className="font-black text-emerald-300">{formatDuration(kept, true)}</b></span>
            {visibleCuts.length > 0 && <span className="text-red-200/80">已删 {visibleCuts.length} 段（{formatDuration(Math.max(0, (end - start) - kept), true)}）</span>}
            {selectedCutIndex >= 0 && <span className="text-amber-200/80">已选中第 {selectedCutIndex + 1} 个删除段</span>}
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-white/55">
              <span>全曲概览</span>
              <span className="font-mono tabular-nums">{timeline.length < duration && '剪后 '}{formatDuration(timeline.length, true)}</span>
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
          >
            <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-crosshair rounded-[inherit]" />
            {viewSpan > 0 && viewMarkers.map(({ time, color, note }) => {
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
                    title={note.trim() || `编辑标记 ${label}`}
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

          {mode === 'range' ? (
            <p className="mt-2 text-[11px] leading-5 text-white/35">
              单击波形定位播放指针（也可直接拖动绿线）；拖橙色边界调首尾；拖范围内侧整体平移；拖空白处重新框选。
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] leading-5 text-white/35">
                拖动波形框选，或输入原音频的待删起止秒数。点击下方的已删时段可调整或恢复。
              </p>
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
              {markers.map(({ time, note, color }) => {
                const label = markerTimeLabel(time);
                return (
                  <li key={time} className="inline-flex max-w-full items-center rounded-full border border-white/15 bg-white/[.06] text-white/85">
                    <button type="button" aria-label={`跳到标记 ${label}`} onClick={() => jumpToMarker(time)} style={{ color }} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-l-full pl-2 pr-1 font-mono text-[11px] hover:bg-white/10">
                      <Flag aria-hidden="true" className="h-3 w-3" />{label}
                    </button>
                    <button
                      type="button"
                      aria-label={`编辑标记 ${label}的备注和颜色`}
                      aria-expanded={editingMarkerTime === time}
                      aria-controls="audio-marker-editor"
                      title={note.trim() || '编辑备注和颜色'}
                      onClick={() => setEditingMarkerTime(time)}
                      className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 border-l border-white/10 px-1.5 text-[11px] text-white/75 hover:bg-white/10 aria-expanded:bg-white/10"
                    >
                      <Pencil aria-hidden="true" className="h-3 w-3 shrink-0" />
                      {note.trim() && <span className="max-w-[7rem] truncate">{note.trim()}</span>}
                    </button>
                    {(['start', 'end'] as const).map(field => {
                      const { min, max } = getBoundaryLimits(field);
                      const boundary = field === 'start' ? '起点' : '终点';
                      const target = `${mode === 'cut' ? '待删' : '范围'}${boundary}`;
                      const allowed = time >= min - 1e-9 && time <= max + 1e-9;
                      return (
                        <button
                          key={field}
                          type="button"
                          aria-label={`将标记 ${label} 设为${target}`}
                          title={allowed ? `设为${target}` : `此标记超出${target}的可用范围`}
                          disabled={!allowed}
                          onClick={() => { stopPlayback(); setBoundaryInput(null); setBoundary(field, time); }}
                          className="min-h-8 shrink-0 whitespace-nowrap border-l border-white/10 px-1.5 text-[11px] enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-35"
                        >设为{boundary}</button>
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
                感受备注
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
              const label = `${mode === 'cut' ? '待删' : '范围'}${field === 'start' ? '起点' : '终点'}`;
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
                      placeholder={mode === 'cut' ? '秒数' : undefined}
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
