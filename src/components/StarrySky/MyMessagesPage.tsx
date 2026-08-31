import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Grid3X3, MessageCircle, PanelsTopLeft, Sparkles } from 'lucide-react';

import { getMyMessages, type MyMessageStar } from './myMessages';

export { getMyMessages, type MyMessageStar } from './myMessages';

interface MyMessagesPageProps {
  stars: MyMessageStar[];
  userId: string;
  nickname: string;
  accentColor: string;
  onBack: () => void;
}

type MessageLayoutMode = 'simple' | 'wide';

const MESSAGE_LAYOUT_STORAGE_KEY = 'jieyou:my-messages-layout';

const getInitialLayoutMode = (): MessageLayoutMode => {
  try {
    return localStorage.getItem(MESSAGE_LAYOUT_STORAGE_KEY) === 'wide' ? 'wide' : 'simple';
  } catch {
    return 'simple';
  }
};

const shapeGlyphs: Record<string, string> = {
  star: '✦', heart: '♥', cloud: '☁', moon: '☾', fullmoon: '●', mountain: '▲',
  leaf: '◆', music: '♫', bird: '⌁', cat: '🐈', cat2: '🐈', cat3: '🐈',
  dog: '🐕', dog2: '🐕', dog3: '🐕', waves: '≋', kite: '➤', apple: '🍎',
  orange: '🍊', banana: '🍌', watermelon: '🍉', grapes: '🍇', aries: '♈',
  taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍', libra: '♎',
  scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const MyMessagesPage = ({ stars, userId, nickname, accentColor, onBack }: MyMessagesPageProps) => {
  const messages = useMemo(() => getMyMessages(stars, userId, nickname), [nickname, stars, userId]);
  const [layoutMode, setLayoutMode] = useState<MessageLayoutMode>(getInitialLayoutMode);

  useEffect(() => {
    try {
      localStorage.setItem(MESSAGE_LAYOUT_STORAGE_KEY, layoutMode);
    } catch {}
  }, [layoutMode]);

  return (
    <section className="relative z-10 min-h-screen overflow-y-auto bg-transparent text-white">
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `linear-gradient(rgba(2, 2, 7, .10), rgba(2, 2, 7, .22)), radial-gradient(circle at 78% 8%, ${accentColor}24, transparent 34%), radial-gradient(circle at 12% 80%, ${accentColor}12, transparent 30%)` }}
      />

      <div className={`relative mx-auto min-h-screen w-full px-5 pb-16 pt-24 transition-[max-width] duration-500 sm:px-8 sm:pt-28 ${layoutMode === 'wide' ? 'max-w-[100rem]' : 'max-w-5xl'}`}>
        <button
          type="button"
          aria-label="返回星空"
          onClick={onBack}
          className="fixed left-5 top-5 z-50 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-white/85 shadow-xl backdrop-blur-xl transition hover:-translate-x-0.5 hover:border-white/35 hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60 md:left-7 md:top-7"
        >
          <ArrowLeft className="h-4 w-4" />
          星空
        </button>

        <header className="pb-9 pt-10 sm:pb-12 sm:pt-14">
          <div className="mb-4 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.28em] text-white/45">
            <span className="h-px w-10" style={{ backgroundColor: accentColor }} />
            My constellation
          </div>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-6xl">{nickname}的留言</h1>
              <p className="mt-3 text-sm text-white/55 sm:text-base">那些在星空留下的思绪或回忆，似乎……让我看到了当时的自己</p>
            </div>
            <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
              <div role="group" aria-label="留言排版" className="flex rounded-full border border-white/15 bg-black/35 p-1 shadow-xl backdrop-blur-xl">
                <button
                  type="button"
                  aria-label="简洁版"
                  title="简洁版：桌面每行两条"
                  aria-pressed={layoutMode === 'simple'}
                  onClick={() => setLayoutMode('simple')}
                  className={`flex h-9 items-center gap-2 rounded-full px-3 text-xs font-bold transition ${layoutMode === 'simple' ? 'text-gray-950 shadow-lg' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
                  style={layoutMode === 'simple' ? { backgroundColor: accentColor } : undefined}
                >
                  <PanelsTopLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">简洁</span>
                </button>
                <button
                  type="button"
                  aria-label="宽大版"
                  title="宽大版：扩展页面并在桌面每行四条"
                  aria-pressed={layoutMode === 'wide'}
                  onClick={() => setLayoutMode('wide')}
                  className={`flex h-9 items-center gap-2 rounded-full px-3 text-xs font-bold transition ${layoutMode === 'wide' ? 'text-gray-950 shadow-lg' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
                  style={layoutMode === 'wide' ? { backgroundColor: accentColor } : undefined}
                >
                  <Grid3X3 className="h-4 w-4" />
                  <span className="hidden sm:inline">宽大</span>
                </button>
              </div>
              <span className="text-5xl font-black tabular-nums" style={{ color: accentColor }}>
                {messages.length}<span className="ml-1 text-sm font-semibold text-white/45">条</span>
              </span>
            </div>
          </div>
        </header>

        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-[42vh] max-w-5xl flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/[0.035] px-6 text-center">
            <MessageCircle className="mb-5 h-10 w-10 text-white/25" />
            <h2 className="text-xl font-bold">还没有留下留言</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-white/45">去点亮一颗属于你的星星，让第一句话在宇宙里闪烁吧。</p>
          </div>
        ) : (
          <div className={`grid gap-4 sm:gap-5 ${layoutMode === 'wide' ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>
            {messages.map((star, index) => (
              <article
                key={star.id}
                className={`group relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.065] shadow-[0_22px_70px_rgba(0,0,0,.28)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.09] ${layoutMode === 'wide' ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}
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
                <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-7 text-white/90 sm:text-base">{star.message?.trim()}</p>
                <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/40">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <time dateTime={star.createdAt}>{formatTime(star.createdAt)}</time>
                </div>
                <Sparkles className="absolute -bottom-4 -right-3 h-20 w-20 opacity-[0.035] transition duration-500 group-hover:rotate-12 group-hover:scale-110" />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default MyMessagesPage;
