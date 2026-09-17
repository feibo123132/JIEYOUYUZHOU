import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
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
  /** 谱子用的是云端签名地址，过期会变裂图：加载失败时通知上层换一批新地址。 */
  onPagesStale?: (force?: boolean) => void;
  onClose: () => void;
}

type AutoScrollSpeed = 0 | 1 | 2 | 3;

const AUTO_SCROLL_SPEED_LABELS: Record<AutoScrollSpeed, string> = {
  0: '自动',
  1: '慢',
  2: '中',
  3: '快',
};
const AUTO_SCROLL_PIXELS_PER_SECOND: Record<Exclude<AutoScrollSpeed, 0>, number> = {
  1: 5,
  2: 8,
  3: 11,
};

const ScoreViewer = ({ songId, songTitle, pages, onPagesStale, onClose }: ScoreViewerProps) => {
  const total = pages.length;
  const [page, setPage] = useState(() => Math.min(readScorePage(window.localStorage, songId), Math.max(total - 1, 0)));
  const [pageError, setPageError] = useState(false);
  const [zoom, setZoom] = useState(SCORE_ZOOM_MIN);
  const [viewportSize, setViewportSize] = useState<ScoreSize>({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<ScoreSize>({ width: 0, height: 0 });
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<AutoScrollSpeed>(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(SCORE_ZOOM_MIN);
  const autoScrollSpeedRef = useRef<AutoScrollSpeed>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const wasPinchingRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollIntervalRef = useRef<number | null>(null);
  const autoScrollLastTimeRef = useRef<number | null>(null);
  const autoScrollRemainderRef = useRef(0);

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
    setAutoScrollSpeed(0);
    setImageSize({ width: 0, height: 0 });
    setPageError(false);
    stageRef.current?.scrollTo({ left: 0, top: 0 });
  }, [page]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current);
    if (autoScrollIntervalRef.current !== null) window.clearInterval(autoScrollIntervalRef.current);
  }, []);

  useEffect(() => {
    autoScrollSpeedRef.current = autoScrollSpeed;
    autoScrollLastTimeRef.current = null;
    autoScrollRemainderRef.current = 0;
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    if (autoScrollIntervalRef.current !== null) {
      window.clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
    if (autoScrollSpeed === 0) return;

    const advance = (time: number) => {
      const stage = stageRef.current;
      const speed = autoScrollSpeedRef.current;
      if (!stage || speed === 0) {
        return false;
      }
      const lastTime = autoScrollLastTimeRef.current ?? time;
      autoScrollLastTimeRef.current = time;
      const maxTop = Math.max(0, stage.scrollHeight - stage.clientHeight);
      if (stage.scrollTop >= maxTop - 1) {
        setAutoScrollSpeed(0);
        return false;
      }
      const elapsed = Math.min(250, Math.max(0, time - lastTime));
      const distance = autoScrollRemainderRef.current + (AUTO_SCROLL_PIXELS_PER_SECOND[speed] * zoomRef.current * elapsed) / 1000;
      const wholePixels = Math.trunc(distance);
      autoScrollRemainderRef.current = distance - wholePixels;
      if (wholePixels > 0) stage.scrollTop = Math.min(maxTop, stage.scrollTop + wholePixels);
      return true;
    };

    const tick = (time: number) => {
      if (!advance(time)) {
        autoScrollFrameRef.current = null;
        return;
      }
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };

    autoScrollFrameRef.current = requestAnimationFrame(tick);
    autoScrollIntervalRef.current = window.setInterval(() => { advance(performance.now()); }, 180);
    return () => {
      if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current);
      if (autoScrollIntervalRef.current !== null) window.clearInterval(autoScrollIntervalRef.current);
      autoScrollFrameRef.current = null;
      autoScrollIntervalRef.current = null;
    };
  }, [autoScrollSpeed]);

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

  const toggleReadingZoom = useCallback(() => {
    applyZoom(zoomRef.current > SCORE_ZOOM_MIN + 0.01
      ? SCORE_ZOOM_MIN
      : getReadingScoreZoom(viewportSize, imageSize));
  }, [applyZoom, viewportSize, imageSize]);

  const cycleAutoScrollSpeed = () => {
    setAutoScrollSpeed((current) => ((current + 1) % 4) as AutoScrollSpeed);
  };

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
      <div className="absolute left-3 top-3 z-20 flex shrink-0 items-center text-white/85 sm:left-4 sm:top-4">
        <button
          type="button"
          onClick={cycleAutoScrollSpeed}
          aria-label={autoScrollSpeed === 0 ? '开启自动下滑' : `自动下滑速度：${AUTO_SCROLL_SPEED_LABELS[autoScrollSpeed]}，点击切换`}
          aria-pressed={autoScrollSpeed > 0}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold backdrop-blur-md transition ${autoScrollSpeed > 0 ? 'border-orange-200/35 bg-orange-300 text-black shadow-[0_8px_30px_rgba(251,146,60,.22)]' : 'border-white/10 bg-black/50 text-white/75 hover:bg-white/15 hover:text-white'}`}
        >
          <ChevronDown className="h-4 w-4" />
          {AUTO_SCROLL_SPEED_LABELS[autoScrollSpeed]}
        </button>
      </div>

      <div className="absolute right-3 top-3 z-20 flex shrink-0 items-center gap-2 text-white/85 sm:right-4 sm:top-4">
        <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs font-bold tabular-nums text-white/75 backdrop-blur-md">
          {page + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭谱子"
          className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur-md transition hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

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
            onLoad={(event) => {
              setPageError(false);
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
            onError={() => {
              setPageError(true);
              onPagesStale?.();
            }}
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

      <footer className="flex shrink-0 items-center justify-center gap-3 px-3 py-1.5 text-center text-[10px] text-white/30">
        <div className="flex shrink-0 items-center rounded-full border border-white/10 bg-white/[.06] p-0.5 text-white/75 shadow-2xl">
          <button type="button" aria-label="缩小谱子" disabled={!zoomed} onClick={() => applyZoom(stepScoreZoom(zoomRef.current, -1))} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/10 disabled:opacity-25"><Minus className="h-4 w-4" /></button>
          <span className="flex h-8 min-w-14 items-center justify-center px-2 text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="放大谱子" disabled={zoom >= SCORE_ZOOM_MAX} onClick={() => applyZoom(stepScoreZoom(zoomRef.current, 1))} className="grid h-8 w-8 place-items-center rounded-full transition hover:bg-white/10 disabled:opacity-25"><Plus className="h-4 w-4" /></button>
        </div>
        {pageError ? (
          <button
            type="button"
            onClick={() => onPagesStale?.(true)}
            className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 font-bold text-amber-100/90 transition hover:bg-amber-300/20"
          >
            谱子加载失败，点此重新加载
          </button>
        ) : (
          <span className="min-w-0 truncate">{zoomed ? '双指缩放 · 单指拖动阅览 · 双击复原' : '左右滑动翻页 · 双击适合宽度 · 双指缩放'}</span>
        )}
      </footer>
    </div>,
    document.body,
  );
};

export default ScoreViewer;
