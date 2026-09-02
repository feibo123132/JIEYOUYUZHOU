import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { readScorePage, saveScorePage } from './songScores';
import {
  getFittedScoreSize,
  getPinchScoreZoom,
  getReadingScoreZoom,
  SCORE_ZOOM_MAX,
  SCORE_ZOOM_MIN,
  stepScoreZoom,
  type ScoreSize,
} from './scoreViewerZoom';

interface ScoreViewerProps {
  songId: string;
  songTitle: string;
  songArtist: string;
  pages: string[];
  onClose: () => void;
}

const ScoreViewer = ({ songId, songTitle, songArtist, pages, onClose }: ScoreViewerProps) => {
  const total = pages.length;
  const [page, setPage] = useState(() => Math.min(readScorePage(window.localStorage, songId), Math.max(total - 1, 0)));
  const [zoom, setZoom] = useState(SCORE_ZOOM_MIN);
  const [viewportSize, setViewportSize] = useState<ScoreSize>({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<ScoreSize>({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(SCORE_ZOOM_MIN);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const wasPinchingRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

  const fittedSize = useMemo(
    () => getFittedScoreSize(viewportSize, imageSize),
    [viewportSize, imageSize],
  );
  const displaySize = useMemo(() => ({
    width: fittedSize.width * zoom,
    height: fittedSize.height * zoom,
  }), [fittedSize, zoom]);
  const canvasSize = useMemo(() => ({
    width: Math.max(viewportSize.width, displaySize.width),
    height: Math.max(viewportSize.height, displaySize.height),
  }), [viewportSize, displaySize]);
  const imagePosition = useMemo(() => ({
    left: Math.max(0, (canvasSize.width - displaySize.width) / 2),
    top: zoom <= SCORE_ZOOM_MIN ? Math.max(0, (canvasSize.height - displaySize.height) / 2) : 0,
  }), [canvasSize, displaySize, zoom]);
  const zoomed = zoom > SCORE_ZOOM_MIN + 0.01;

  const goTo = useCallback((next: number) => {
    setPage((current) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      if (clamped !== current) saveScorePage(window.localStorage, songId, clamped);
      return clamped;
    });
  }, [total, songId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    zoomRef.current = SCORE_ZOOM_MIN;
    setZoom(SCORE_ZOOM_MIN);
    setImageSize({ width: 0, height: 0 });
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, [page]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const applyZoom = useCallback((requestedZoom: number, focalPoint?: { x: number; y: number }) => {
    const stage = stageRef.current;
    if (!stage || fittedSize.width <= 0 || fittedSize.height <= 0) return;

    const nextZoom = Math.max(SCORE_ZOOM_MIN, Math.min(SCORE_ZOOM_MAX, requestedZoom));
    const currentZoom = zoomRef.current;
    if (Math.abs(nextZoom - currentZoom) < 0.005) return;

    const rect = stage.getBoundingClientRect();
    const localPoint = focalPoint
      ? { x: focalPoint.x - rect.left, y: focalPoint.y - rect.top }
      : { x: rect.width / 2, y: rect.height / 2 };
    const currentDisplay = { width: fittedSize.width * currentZoom, height: fittedSize.height * currentZoom };
    const currentCanvas = {
      width: Math.max(viewportSize.width, currentDisplay.width),
      height: Math.max(viewportSize.height, currentDisplay.height),
    };
    const currentPosition = {
      left: Math.max(0, (currentCanvas.width - currentDisplay.width) / 2),
      top: currentZoom <= SCORE_ZOOM_MIN ? Math.max(0, (currentCanvas.height - currentDisplay.height) / 2) : 0,
    };
    const imagePoint = {
      x: Math.max(0, Math.min(1, (stage.scrollLeft + localPoint.x - currentPosition.left) / currentDisplay.width)),
      y: Math.max(0, Math.min(1, (stage.scrollTop + localPoint.y - currentPosition.top) / currentDisplay.height)),
    };

    const nextDisplay = { width: fittedSize.width * nextZoom, height: fittedSize.height * nextZoom };
    const nextCanvas = {
      width: Math.max(viewportSize.width, nextDisplay.width),
      height: Math.max(viewportSize.height, nextDisplay.height),
    };
    const nextPosition = {
      left: Math.max(0, (nextCanvas.width - nextDisplay.width) / 2),
      top: nextZoom <= SCORE_ZOOM_MIN ? Math.max(0, (nextCanvas.height - nextDisplay.height) / 2) : 0,
    };

    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      stage.scrollTo({
        left: nextPosition.left + (imagePoint.x * nextDisplay.width) - localPoint.x,
        top: nextPosition.top + (imagePoint.y * nextDisplay.height) - localPoint.y,
      });
      scrollFrameRef.current = null;
    });
  }, [fittedSize, viewportSize]);

  const resetZoom = useCallback(() => applyZoom(SCORE_ZOOM_MIN), [applyZoom]);
  const toggleReadingZoom = useCallback(() => {
    applyZoom(zoomRef.current > SCORE_ZOOM_MIN + 0.01
      ? SCORE_ZOOM_MIN
      : getReadingScoreZoom(viewportSize, imageSize));
  }, [applyZoom, viewportSize, imageSize]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') setPage((current) => {
        const next = Math.max(0, current - 1);
        if (next !== current) saveScorePage(window.localStorage, songId, next);
        return next;
      });
      else if (event.key === 'ArrowRight') setPage((current) => {
        const next = Math.min(total - 1, current + 1);
        if (next !== current) saveScorePage(window.localStorage, songId, next);
        return next;
      });
      else if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, songId, onClose]);

  const touchDistance = (touches: React.TouchList) => Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      pinchRef.current = { distance: touchDistance(event.touches), zoom: zoomRef.current };
      wasPinchingRef.current = true;
      touchStartRef.current = null;
      return;
    }
    if (event.touches.length !== 1) return;
    wasPinchingRef.current = false;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const midpoint = {
      x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
      y: (event.touches[0].clientY + event.touches[1].clientY) / 2,
    };
    applyZoom(getPinchScoreZoom(
      pinchRef.current.zoom,
      pinchRef.current.distance,
      touchDistance(event.touches),
    ), midpoint);
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (wasPinchingRef.current || pinchRef.current) {
      if (event.touches.length < 2) pinchRef.current = null;
      if (event.touches.length === 0) wasPinchingRef.current = false;
      touchStartRef.current = null;
      return;
    }
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || zoomed) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(page + (dx < 0 ? 1 : -1));
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col select-none bg-black"
      role="dialog"
      aria-label={`${songTitle} 谱子翻页器`}
      style={{ overscrollBehavior: 'none' }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white/85 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-black sm:text-base">{songTitle}</p>
          <p className="mt-0.5 truncate text-[11px] text-white/40">{songArtist} · 专属谱子</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold tabular-nums text-white/70">
            {page + 1} / {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭谱子"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'none' }}
      >
        <div
          className="relative"
          style={{ width: canvasSize.width || '100%', height: canvasSize.height || '100%' }}
        >
          <img
            src={pages[page]}
            alt={`${songTitle} 谱子 第 ${page + 1} 页`}
            draggable={false}
            onLoad={(event) => setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })}
            onDoubleClick={toggleReadingZoom}
            className={zoomed ? 'absolute max-w-none cursor-zoom-out' : 'absolute max-w-none cursor-zoom-in'}
            style={displaySize.width > 0 ? {
              left: imagePosition.left,
              top: imagePosition.top,
              width: displaySize.width,
              height: displaySize.height,
            } : { inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>

        {total > 1 && !zoomed && (
          <>
            <button
              type="button"
              aria-label="上一页"
              disabled={page === 0}
              onClick={() => goTo(page - 1)}
              className="absolute inset-y-0 left-0 grid min-w-20 w-1/4 place-items-center bg-gradient-to-r from-black/55 to-transparent text-white/0 transition hover:text-white/80 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-10 w-10" />
            </button>
            <button
              type="button"
              aria-label="下一页"
              disabled={page === total - 1}
              onClick={() => goTo(page + 1)}
              className="absolute inset-y-0 right-0 grid min-w-20 w-1/4 place-items-center bg-gradient-to-l from-black/55 to-transparent text-white/0 transition hover:text-white/80 disabled:pointer-events-none"
            >
              <ChevronRight className="h-10 w-10" />
            </button>
          </>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-4 pb-3 pt-2 text-center text-[11px] text-white/30">
        <div className="flex items-center rounded-full border border-white/10 bg-white/[.06] p-1 text-white/75 shadow-2xl">
          <button type="button" aria-label="缩小谱子" disabled={!zoomed} onClick={() => applyZoom(stepScoreZoom(zoomRef.current, -1))} className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/10 disabled:opacity-25"><Minus className="h-4 w-4" /></button>
          <button type="button" aria-label="恢复适应屏幕" disabled={!zoomed} onClick={resetZoom} className="flex h-10 min-w-20 items-center justify-center gap-1.5 rounded-full px-3 font-bold tabular-nums transition hover:bg-white/10 disabled:opacity-45"><RotateCcw className="h-3.5 w-3.5" />{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="放大谱子" disabled={zoom >= SCORE_ZOOM_MAX} onClick={() => applyZoom(stepScoreZoom(zoomRef.current, 1))} className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/10 disabled:opacity-25"><Plus className="h-4 w-4" /></button>
        </div>
        <span className="w-full sm:w-auto">{zoomed ? '双指缩放 · 单指拖动阅览 · 双击复原' : '左右滑动翻页 · 双击适合宽度 · 双指缩放'}</span>
      </footer>
    </div>,
    document.body,
  );
};

export default ScoreViewer;
