import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Redo2, RotateCcw, Scissors, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { computeWaveformPeaks, formatDuration, getAudioContext } from './audioClipping';
import { keptDuration, normalizeAudioCuts, resolveKeptSegments, type AudioCut } from './songRecordings';

interface AudioTrimDialogProps {
  songTitle: string;
  recordingTitle: string;
  buffer: AudioBuffer;
  initialStart: number;
  initialEnd: number;
  initialCuts?: AudioCut[];
  saving?: boolean;
  onCancel: () => void;
  onSave: (clip: { start: number; end: number; cuts: AudioCut[] }) => void;
}

type EditMode = 'range' | 'cut';

const HANDLE_HIT_PX = 14;
const MIN_CLIP_SECONDS = 0.05;
const MIN_VIEW_SECONDS = 0.4;
const PEAK_BUCKETS = 12_000;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const AudioTrimDialog = ({
  songTitle, recordingTitle, buffer, initialStart, initialEnd, initialCuts = [], saving = false, onCancel, onSave,
}: AudioTrimDialogProps) => {
  const duration = buffer.duration;
  const peaks = useMemo(() => computeWaveformPeaks(buffer, PEAK_BUCKETS), [buffer]);

  const [start, setStart] = useState(() => clamp(initialStart, 0, Math.max(0, duration - MIN_CLIP_SECONDS)));
  const [end, setEnd] = useState(() => clamp(initialEnd, start + MIN_CLIP_SECONDS, duration));
  const [cuts, setCuts] = useState<AudioCut[]>(() => normalizeAudioCuts(initialCuts, start, end));
  const [mode, setMode] = useState<EditMode>('range');
  const [selection, setSelection] = useState<AudioCut | null>(null);
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(duration);
  const [playing, setPlaying] = useState(false);
  // 播放指针：可点击/拖拽/键盘定位，试听从这里开始。
  const [playhead, setPlayhead] = useState<number>(() => clamp(initialStart, 0, duration));

  // 打开时的初始状态，用来判断「有没有改过」。
  const baselineRef = useRef<{ start: number; end: number; cuts: AudioCut[] } | null>(null);
  if (!baselineRef.current) baselineRef.current = { start, end, cuts };

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
    mode: 'start' | 'end' | 'move' | 'create' | 'select' | 'playhead';
    originX: number;
    originStart: number;
    originEnd: number;
    anchorTime: number;
  } | null>(null);
  const tapRef = useRef<{ time: number; moved: boolean; canRelocate: boolean } | null>(null);

  const viewSpan = Math.max(MIN_VIEW_SECONDS, viewEnd - viewStart);
  const timeAtX = useCallback((x: number, width: number) => viewStart + (x / Math.max(1, width)) * viewSpan, [viewStart, viewSpan]);
  const xAtTime = useCallback((time: number, width: number) => ((time - viewStart) / viewSpan) * width, [viewStart, viewSpan]);

  const visibleCuts = useMemo(() => normalizeAudioCuts(cuts, start, end), [cuts, start, end]);
  const kept = useMemo(() => keptDuration(start, end, cuts), [start, end, cuts]);
  const selectedCutIndex = useMemo(() => {
    if (!selection) return -1;
    return visibleCuts.findIndex((cut) => Math.abs(cut.start - selection.start) < 0.06 && Math.abs(cut.end - selection.end) < 0.06);
  }, [selection, visibleCuts]);

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

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const middle = height / 2;
    const rangeStartX = clamp(xAtTime(start, width), 0, width);
    const rangeEndX = clamp(xAtTime(end, width), 0, width);
    const cutRanges = visibleCuts.map((cut) => ({
      from: clamp(xAtTime(cut.start, width), 0, width),
      to: clamp(xAtTime(cut.end, width), 0, width),
    }));

    context.fillStyle = 'rgba(255,255,255,0.02)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(251,146,60,0.07)';
    context.fillRect(rangeStartX, 0, Math.max(0, rangeEndX - rangeStartX), height);

    // 删除片段：红色底 + 斜纹
    for (const range of cutRanges) {
      const cutWidth = Math.max(0, range.to - range.from);
      if (!cutWidth) continue;
      context.fillStyle = 'rgba(248,113,113,0.14)';
      context.fillRect(range.from, 0, cutWidth, height);
      context.save();
      context.beginPath();
      context.rect(range.from, 0, cutWidth, height);
      context.clip();
      context.strokeStyle = 'rgba(248,113,113,0.28)';
      context.lineWidth = 1;
      for (let x = range.from - height; x < range.to + height; x += 7) {
        context.beginPath();
        context.moveTo(x, height);
        context.lineTo(x + height, 0);
        context.stroke();
      }
      context.restore();
      context.fillStyle = 'rgba(248,113,113,0.85)';
      context.fillRect(Math.round(range.from), 0, 1, height);
      context.fillRect(Math.round(range.to) - 1, 0, 1, height);
    }

    // 当前选择（删除模式）
    if (mode === 'cut' && selection) {
      const from = clamp(xAtTime(selection.start, width), 0, width);
      const to = clamp(xAtTime(selection.end, width), 0, width);
      context.fillStyle = 'rgba(250,204,21,0.12)';
      context.fillRect(from, 0, Math.max(0, to - from), height);
      context.strokeStyle = 'rgba(250,204,21,0.8)';
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      context.strokeRect(Math.round(from) + 0.5, 1, Math.max(1, to - from - 1), height - 2);
      context.setLineDash([]);
    }

    // 波形
    const firstIndex = Math.max(0, Math.floor((viewStart / duration) * peaks.length));
    const lastIndex = Math.min(peaks.length, Math.ceil((viewEnd / duration) * peaks.length));
    const visibleCount = Math.max(1, lastIndex - firstIndex);
    const columnStep = 2;
    for (let x = 0; x < width; x += columnStep) {
      const from = firstIndex + Math.floor((x / width) * visibleCount);
      const to = firstIndex + Math.floor(((x + columnStep) / width) * visibleCount);
      let amplitude = 0;
      for (let index = from; index < Math.max(from + 1, to); index += 1) {
        if (index < peaks.length && peaks[index] > amplitude) amplitude = peaks[index];
      }
      const barHeight = Math.max(1, amplitude * (height * 0.86));
      const insideRange = x >= rangeStartX && x <= rangeEndX;
      const insideCut = cutRanges.some((range) => x >= range.from && x <= range.to);
      context.fillStyle = insideCut
        ? 'rgba(248,113,113,0.35)'
        : insideRange
          ? 'rgba(253,186,116,0.9)'
          : 'rgba(255,255,255,0.18)';
      context.fillRect(x, middle - barHeight / 2, columnStep - 1, barHeight);
    }

    // 范围边界手柄（仅首尾模式可拖）
    if (mode === 'range') {
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
  }, [cuts, duration, end, mode, peaks, selection, start, viewEnd, viewStart, xAtTime, visibleCuts]);

  useEffect(() => {
    drawWaveform();
    const handleResize = () => drawWaveform();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawWaveform]);

  const zoomBy = (factor: number, anchorTime = (start + end) / 2) => {
    const span = viewSpan;
    const nextSpan = clamp(span / factor, MIN_VIEW_SECONDS, duration);
    const ratio = clamp((anchorTime - viewStart) / span, 0, 1);
    let nextStart = anchorTime - ratio * nextSpan;
    nextStart = clamp(nextStart, 0, Math.max(0, duration - nextSpan));
    setViewStart(nextStart);
    setViewEnd(nextStart + nextSpan);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
      const hitCut = visibleCuts.find((cut) => time >= cut.start && time <= cut.end);
      if (hitCut) {
        setSelection({ start: hitCut.start, end: hitCut.end });
        dragRef.current = { mode: 'select', originX: x, originStart: hitCut.start, originEnd: hitCut.end, anchorTime: time };
        return;
      }
      // 先记录锚点，等确认是拖动才生成选区；单击则定位指针。
      setSelection(null);
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
        setSelection(nextSelection);
        return;
      }
      // 首尾模式：从锚点拖出新范围
      const from = Math.max(0, Math.min(anchor, time));
      const to = Math.min(duration, Math.max(anchor, time));
      setStart(clamp(from, 0, duration - MIN_CLIP_SECONDS));
      setEnd(clamp(Math.max(to, from + MIN_CLIP_SECONDS), from + MIN_CLIP_SECONDS, duration));
      return;
    }
    if (drag.mode === 'select') return;

    const delta = ((x - drag.originX) / Math.max(1, rect.width)) * viewSpan;
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
        if (mode === 'cut') setSelection(null);
        return;
      }
      if (mode === 'cut' && drag.mode === 'create') {
        setSelection((current) => {
          if (!current || current.end - current.start < 0.1) return null;
          return { start: Number(current.start.toFixed(2)), end: Number(current.end.toFixed(2)) };
        });
      }
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1.35 : 1 / 1.35, timeAtX(event.clientX - rect.left, rect.width));
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
    setPlayhead((current) => clamp(Number((current + delta).toFixed(3)), start, end));
  }, [start, end]);

  // 有未保存改动时先确认，避免手快点了「取消」白剪一场。
  const dirty = useMemo(() => {
    const baseline = baselineRef.current;
    if (!baseline) return false;
    if (Math.abs(start - baseline.start) > 0.01 || Math.abs(end - baseline.end) > 0.01) return true;
    if (baseline.cuts.length !== cuts.length) return true;
    return cuts.some((cut, index) => (
      Math.abs(cut.start - baseline.cuts[index].start) > 0.02 || Math.abs(cut.end - baseline.cuts[index].end) > 0.02
    ));
  }, [cuts, end, start]);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('这次裁剪还没保存，确定放弃吗？')) return;
    onCancel();
  }, [dirty, onCancel]);

  // 键盘控制播放指针：←/→ 微调，Shift ±1s、Alt ±0.01s；空格播放/暂停；Home/End 到首尾。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = event.shiftKey ? 1 : event.altKey ? 0.01 : 0.1;
        movePlayhead(event.key === 'ArrowLeft' ? -step : step);
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        if (playing) stopPlayback(); else void play();
        return;
      }
      // 选中后直接按 Delete 就删掉，不用再去点按钮。
      if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'cut' && selection) {
        event.preventDefault();
        setCuts((current) => normalizeAudioCuts([...current, selection], start, end));
        setSelection(null);
        return;
      }
      if (event.key === 'Home') { event.preventDefault(); setPlayhead(start); return; }
      if (event.key === 'End') { event.preventDefault(); setPlayhead(end); return; }
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movePlayhead, playing, stopPlayback, play, start, end, requestClose, mode, selection]);

  const addCut = () => {
    if (!selection) return;
    setCuts((current) => normalizeAudioCuts([...current, selection], start, end));
    setSelection(null);
  };

  const restoreCut = () => {
    if (selectedCutIndex < 0 || !selection) return;
    const target = selection;
    setCuts((current) => current.filter((cut) => !(Math.abs(cut.start - target.start) < 0.06 && Math.abs(cut.end - target.end) < 0.06)));
    setSelection(null);
  };

  const nudge = (field: 'start' | 'end', delta: number) => {
    if (field === 'start') setStart((value) => clamp(Number((value + delta).toFixed(2)), 0, end - MIN_CLIP_SECONDS));
    else setEnd((value) => clamp(Number((value + delta).toFixed(2)), start + MIN_CLIP_SECONDS, duration));
  };

  const resetView = () => { setViewStart(0); setViewEnd(duration); };
  const canSave = kept >= MIN_CLIP_SECONDS;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="音频裁剪">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0b0b10] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-white/10 bg-black/30 p-1">
              <button type="button" onClick={() => { setMode('range'); setSelection(null); }} className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${mode === 'range' ? 'bg-orange-300 text-black' : 'text-white/55 hover:text-white'}`}>裁剪首尾</button>
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
            <span className="text-white/45">指针 <b className="font-black text-emerald-300">{formatDuration(playhead, true)}</b></span>
            <span className="text-white/45">保留 <b className="font-black text-emerald-300">{formatDuration(kept, true)}</b></span>
            {visibleCuts.length > 0 && <span className="text-red-200/80">已删 {visibleCuts.length} 段（{formatDuration(Math.max(0, (end - start) - kept), true)}）</span>}
            {selectedCutIndex >= 0 && <span className="text-amber-200/80">已选中第 {selectedCutIndex + 1} 个删除段</span>}
          </div>

          <div
            ref={wrapRef}
            className="relative mt-2 touch-none select-none rounded-2xl border border-white/10 bg-black/40"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            <canvas ref={canvasRef} className="block h-[160px] w-full cursor-crosshair sm:h-[200px]" />
            <div
              className="pointer-events-none absolute top-0 h-full w-0.5 bg-emerald-300/90"
              style={{ left: `${(xAtTime(playhead, wrapRef.current?.clientWidth ?? 1) / Math.max(1, wrapRef.current?.clientWidth ?? 1)) * 100}%` }}
            >
              <span className="absolute -top-0.5 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-[6px] border-x-transparent border-t-emerald-300" />
            </div>
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
                拖出一段后按 Delete（或点「删除这段」）立即生效；点红色区域可选中再恢复；单击其它位置定位指针。
              </p>
              <button
                type="button"
                disabled={!selection || selectedCutIndex >= 0}
                onClick={addCut}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-red-400/90 px-3 text-xs font-black text-black transition hover:bg-red-300 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />删除这段
              </button>
              <button
                type="button"
                disabled={selectedCutIndex < 0}
                onClick={restoreCut}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 text-xs font-black text-emerald-200 transition hover:bg-emerald-300/20 disabled:opacity-30"
              >
                <Redo2 className="h-3.5 w-3.5" />恢复这段
              </button>
            </div>
          )}

          {visibleCuts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleCuts.map((cut, index) => {
                const active = Math.abs((selection?.start ?? -1) - cut.start) < 0.06 && Math.abs((selection?.end ?? -1) - cut.end) < 0.06;
                return (
                  <button
                    key={`${cut.start}-${index}`}
                    type="button"
                    onClick={() => { setMode('cut'); setSelection({ start: cut.start, end: cut.end }); }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${active ? 'border-amber-300/60 bg-amber-300/15 text-amber-100' : 'border-red-300/25 bg-red-300/8 text-red-200/75 hover:border-red-300/45'}`}
                  >
                    <Trash2 className="h-3 w-3" />{formatDuration(cut.start, true)}–{formatDuration(cut.end, true)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/30">
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">空格</kbd>播放/暂停</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">← →</kbd>指针 ±0.1s</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Shift</kbd>±1s</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Alt</kbd>±0.01s</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Delete</kbd>删除选中段</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-white/50">Home / End</kbd>首尾</span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(['start', 'end'] as const).map((field) => {
              const value = field === 'start' ? start : end;
              return (
                <div key={field} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                  <div className="mb-1.5 text-[10px] font-bold tracking-widest text-white/35">{field === 'start' ? '范围起点' : '范围终点'}</div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => nudge(field, -1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">−1s</button>
                    <button type="button" onClick={() => nudge(field, -0.1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">−0.1</button>
                    <input
                      type="number"
                      min={0}
                      max={duration}
                      step={0.01}
                      value={Number(value.toFixed(2))}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next)) return;
                        if (field === 'start') setStart(clamp(next, 0, end - MIN_CLIP_SECONDS));
                        else setEnd(clamp(next, start + MIN_CLIP_SECONDS, duration));
                      }}
                      className="h-8 w-full min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-center font-mono text-xs text-white outline-none focus:border-orange-300/45"
                      aria-label={field === 'start' ? '范围起点秒数' : '范围终点秒数'}
                    />
                    <button type="button" onClick={() => nudge(field, 0.1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">+0.1</button>
                    <button type="button" onClick={() => nudge(field, 1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/60 hover:border-white/25 hover:text-white">+1s</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-5 py-4 sm:px-6">
          <button type="button" onClick={() => (playing ? stopPlayback() : void play())} className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black transition ${playing ? 'bg-emerald-300 text-black' : 'bg-white/10 text-white hover:bg-white/16'}`}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playing ? '停止试听' : '试听（从指针开始）'}
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={requestClose} className="h-11 rounded-full border border-white/12 px-5 text-sm font-bold text-white/65 transition hover:border-white/25 hover:text-white">取消</button>
            <button
              type="button"
              disabled={saving || !canSave}
              onClick={() => { stopPlayback(); onSave({ start, end, cuts: normalizeAudioCuts(cuts, start, end) }); }}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-6 text-sm font-black text-black transition hover:bg-orange-300 disabled:opacity-40"
            >
              <Scissors className="h-4 w-4" />{saving ? '保存中…' : '保存裁剪'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AudioTrimDialog;
