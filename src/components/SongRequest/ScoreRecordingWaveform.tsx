import { useEffect, useRef, useState } from 'react';
import { formatDuration } from './audioClipping';
import type { RecordingWaveform } from './recordingPlayback';

interface Props {
  waveform: RecordingWaveform;
  playing: boolean;
  readPosition: () => number;
  onSeek: (position: number) => void;
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

export default function ScoreRecordingWaveform({ waveform, playing, readPosition, onSeek }: Props) {
  const { duration, peaks, unavailable } = waveform;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState(readPosition);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const displayed = clamp(dragPosition ?? position, duration);
  const timeLabel = formatDuration(displayed, true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (let x = 0; x < width; x += 2) {
        const from = Math.floor(x / width * peaks.length);
        const to = Math.min(peaks.length, Math.ceil((x + 2) / width * peaks.length));
        let peak = 0;
        for (let index = from; index < to; index += 1) peak = Math.max(peak, peaks[index]);
        const barHeight = Math.max(1, Math.min(1, peak) * (height - 6));
        const top = (height - barHeight) / 2;
        context.fillStyle = '#9eafc0';
        context.fillRect(x, top, 1, barHeight);
        if (peak >= 1) {
          context.fillStyle = '#fb5252';
          context.fillRect(x, top, 1, 3);
        }
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      setPosition(readPosition());
      if (playing) frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [playing, readPosition]);

  const commit = (target: number) => {
    const next = clamp(target, duration);
    setPosition(next);
    setDragPosition(null);
    onSeek(next);
  };
  const timeAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    return clamp((event.clientX - left) / Math.max(1, width) * duration, duration);
  };

  return (
    <>
      <div
        role="slider"
        aria-label="录音播放位置"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={displayed}
        aria-valuetext={timeLabel}
        aria-disabled={!duration}
        tabIndex={duration ? 0 : -1}
        className="relative h-10 min-w-0 flex-1 touch-none overflow-hidden rounded-md border border-sky-200/65 bg-[#141b22] outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:h-12"
        onPointerDown={event => {
          if (!duration || !event.isPrimary || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragPosition(timeAt(event));
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setDragPosition(timeAt(event));
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) commit(timeAt(event));
        }}
        onLostPointerCapture={() => setDragPosition(null)}
        onKeyDown={event => {
          if (!duration) return;
          let next: number;
          switch (event.key) {
            case 'ArrowLeft': case 'ArrowDown': next = displayed - 5; break;
            case 'ArrowRight': case 'ArrowUp': next = displayed + 5; break;
            case 'Home': next = 0; break;
            case 'End': next = duration; break;
            default: return;
          }
          event.preventDefault();
          event.stopPropagation();
          commit(next);
        }}
      >
        {peaks ? <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" /> : (
          <span className="absolute inset-0 grid place-items-center text-xs text-white/50">
            {!duration ? '没有可播放的音频' : unavailable ? '波形暂不可用' : '正在加载波形…'}
          </span>
        )}
        {duration > 0 && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-emerald-300"
            style={{ left: `clamp(0px, ${displayed / duration * 100}%, calc(100% - 2px))` }} />
        )}
      </div>
      <div className="shrink-0 whitespace-nowrap text-xs text-white/60">
        指针 <span className="font-mono font-bold tabular-nums text-emerald-300">{timeLabel}</span>
      </div>
    </>
  );
}
