import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { readScorePage, saveScorePage } from './songScores';

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
  const [zoomed, setZoomed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const goTo = useCallback((next: number) => {
    setPage((current) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      if (clamped !== current) saveScorePage(window.localStorage, songId, clamped);
      return clamped;
    });
  }, [total, songId]);

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

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
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

  return (
    <div className="fixed inset-0 z-[90] flex flex-col select-none bg-black/97" role="dialog" aria-label={`${songTitle} 谱子翻页器`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
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

      <div className={`relative flex min-h-0 flex-1 items-stretch justify-center ${zoomed ? 'overflow-auto' : 'overflow-hidden'}`}>
        <img
          src={pages[page]}
          alt={`${songTitle} 谱子 第 ${page + 1} 页`}
          draggable={false}
          onDoubleClick={() => setZoomed((prev) => !prev)}
          className={zoomed ? 'h-auto max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'}
        />

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

      <footer className="shrink-0 px-4 pb-4 pt-2 text-center text-[11px] text-white/30">
        {zoomed ? '双击图片恢复适应屏幕 · 放大后可拖动滚动' : '← → 键或左右滑动翻页 · 双击放大 · Esc 关闭'}
      </footer>
    </div>
  );
};

export default ScoreViewer;
