import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, MessageCircle, Search, Shuffle, Sparkles } from 'lucide-react';
import { formatStarMessageTime } from './starMessageTime';

export interface StarMessage {
  id: string;
  userId?: string;
  nickname?: string;
  message?: string;
  createdAt: string;
  color?: string;
  shape?: string;
}

interface StarMessagesPageProps {
  stars: StarMessage[];
  accentColor: string;
  onBack: () => void;
}

const shapeGlyphs: Record<string, string> = {
  star: '✦', heart: '♥', cloud: '☁', moon: '☾', fullmoon: '●', mountain: '▲',
  leaf: '◆', music: '♫', bird: '⌁', cat: '🐈', cat2: '🐈', cat3: '🐈',
  dog: '🐕', dog2: '🐕', dog3: '🐕', waves: '≋', kite: '➤', apple: '🍎',
  orange: '🍊', banana: '🍌', watermelon: '🍉', grapes: '🍇', aries: '♈',
  taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍', libra: '♎',
  scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
};

type SortMode = 'desc' | 'asc' | 'random';

const StarMessagesPage = ({ stars, accentColor, onBack }: StarMessagesPageProps) => {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('desc');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showTimeDetails, setShowTimeDetails] = useState(true);

  const messages = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = stars
      .filter((star) => Boolean(star.message?.trim()))
      .filter((star) => {
        if (!q) return true;
        return (
          star.message?.toLowerCase().includes(q) ||
          star.nickname?.toLowerCase().includes(q) ||
          false
        );
      });

    if (sortMode === 'random') {
      // Fisher–Yates shuffle
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    } else {
      const dir = sortMode === 'asc' ? 1 : -1;
      list = list.sort((left, right) => dir * (Date.parse(left.createdAt) - Date.parse(right.createdAt)));
    }
    return list;
  }, [stars, search, sortMode]);

  return (
    <section className="relative z-10 min-h-screen overflow-y-auto bg-transparent text-white">
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `linear-gradient(rgba(2, 2, 7, .10), rgba(2, 2, 7, .22)), radial-gradient(circle at 78% 8%, ${accentColor}24, transparent 34%), radial-gradient(circle at 12% 80%, ${accentColor}12, transparent 30%)` }}
      />

      {!assistantOpen ? (
        <button
          data-star-safe-zone
          type="button"
          onClick={() => { (window as any).playClickSound?.(); setAssistantOpen(true); }}
          className="fixed top-4 right-4 z-20 bg-transparent text-3xl"
          aria-label="打开助手栏"
        >
          <span role="img" aria-label="cat" className="inline-block transition-transform duration-200 hover:scale-125 hover:rotate-12 breath-slow">🐱</span>
        </button>
      ) : (
        <aside aria-label="星语心愿助手栏" className="pointer-events-none fixed right-0 top-0 z-20 h-full w-80 overflow-y-auto border-l border-white/10 bg-transparent px-4 py-6 backdrop-blur-2xl md:w-96">
          <div className="pointer-events-auto mb-4 flex items-center justify-between">
            <div className="text-2xl font-extrabold text-white">💪 助手栏</div>
            <button type="button" onClick={() => setAssistantOpen(false)} className="text-white/80 hover:text-white">关闭</button>
          </div>
          <div className="pointer-events-auto rounded-2xl border border-white/5 bg-white/5 p-3 backdrop-blur-md">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-white">时间详情</div>
                <div className="mt-1 text-xs text-white/45">隐藏后仅显示年份和月份</div>
              </div>
              <button
                type="button"
                aria-pressed={!showTimeDetails}
                onClick={() => setShowTimeDetails((visible) => !visible)}
                className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/25 hover:bg-white/15"
              >
                {showTimeDetails ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
        </aside>
      )}

      <div data-star-messages-title className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20 text-center">
        <div className="flex items-center justify-center gap-3">
          <Sparkles className="h-6 w-6 animate-pulse" style={{ color: accentColor }} />
          <h1 className="text-2xl md:text-4xl font-extrabold text-white">星语心愿</h1>
          <Sparkles className="h-6 w-6 animate-pulse" style={{ color: accentColor }} />
        </div>
      </div>

      <div className="relative mx-auto min-h-screen w-full max-w-[100rem] px-5 pb-16 pt-24 sm:px-8 sm:pt-28">
        <button
          type="button"
          aria-label="返回星空"
          onClick={onBack}
          className="fixed left-5 top-5 z-50 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-white/85 shadow-xl backdrop-blur-xl transition hover:-translate-x-0.5 hover:border-white/35 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60 md:left-7 md:top-7"
        >
          <ArrowLeft className="h-4 w-4" />
          星空
        </button>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索留言或昵称…"
              className="w-full rounded-full border border-white/15 bg-black/35 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 shadow-xl backdrop-blur-xl transition focus:border-white/35 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSortMode((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-3.5 py-2 text-xs font-semibold text-white/75 shadow-xl backdrop-blur-xl transition hover:border-white/35 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
              title={sortMode === 'asc' ? '切换为倒序' : '切换为正序'}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {sortMode === 'asc' ? '正序' : '倒序'}
            </button>
            <button
              type="button"
              onClick={() => setSortMode('random')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-xl backdrop-blur-xl transition focus:outline-none focus:ring-2 focus:ring-white/40 ${
                sortMode === 'random'
                  ? 'border-white/40 bg-white/15 text-white'
                  : 'border-white/15 bg-black/35 text-white/75 hover:border-white/35 hover:bg-white/15 hover:text-white'
              }`}
              title="随机排序"
            >
              <Shuffle className="h-3.5 w-3.5" />
              随机
            </button>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-[42vh] max-w-5xl flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/[0.035] px-6 text-center">
            <MessageCircle className="mb-5 h-10 w-10 text-white/25" />
            <h2 className="text-xl font-bold">还没有留下留言</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-white/45">去点亮一颗属于你的星星，让第一句话在宇宙里闪烁吧。</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 sm:gap-5">
            {messages.map((star, index) => (
              <article
                key={star.id}
                className="group relative flex flex-col overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.065] p-4 shadow-[0_22px_70px_rgba(0,0,0,.28)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.09] sm:p-5"
              >
                <div className="mb-8 flex items-center justify-between">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-2xl shadow-inner"
                    style={{ color: star.color || accentColor }}
                    aria-hidden="true"
                  >
                    {shapeGlyphs[star.shape || 'star'] || '✦'}
                  </span>
                  <span className="text-xs font-black tabular-nums tracking-[0.18em] text-white/20">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <p className="whitespace-pre-wrap break-words pb-6 text-[15px] font-medium leading-7 text-white/90 sm:text-base">{star.message?.trim()}</p>
                <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4">
                  <div className="flex min-w-0 items-center gap-2 text-xs leading-none text-white/40">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <time dateTime={star.createdAt}>{formatStarMessageTime(star.createdAt, showTimeDetails)}</time>
                  </div>
                  {star.nickname && (
                    <span className="max-w-[40%] truncate text-right text-xs font-semibold leading-none text-white/50">{star.nickname}</span>
                  )}
                </div>
                <Sparkles className="absolute -bottom-4 -right-3 h-20 w-20 opacity-[0.035] transition duration-500 group-hover:rotate-12 group-hover:scale-110" />
              </article>
            ))}
          </div>
        )}

        <p className="mt-16 text-center text-xs tracking-[0.12em] text-white/30">
          那些在星空留下的思绪或回忆，似乎……让我看到了当时的自己
        </p>
      </div>
    </section>
  );
};

export default StarMessagesPage;
