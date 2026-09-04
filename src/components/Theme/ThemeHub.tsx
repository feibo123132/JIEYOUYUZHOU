import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Guitar, PawPrint, SunMedium } from 'lucide-react';
import services from '../../services/starService';
import { getThemeConfig, type ThemeId } from '../../themes/themeConfig';
import { getMeowGeneratorUrl } from '../../utils/meowGenerator';

const { starService } = services;
const HUB_CARD_SIZE_CLASS = 'h-[300px] md:h-[310px]';
const HUB_CARD_CONTENT_CLASS = 'relative flex h-full flex-col gap-5';

interface ThemeHubProps {
  onSelect: (themeId: ThemeId) => void;
  onOpenSongRequest: () => void;
}

const ThemeHub: React.FC<ThemeHubProps> = ({ onSelect, onOpenSongRequest }) => {
  const [count, setCount] = useState<number | null | undefined>(undefined);
  const theme = getThemeConfig('life');

  useEffect(() => {
    let active = true;
    starService.getAllStars('life')
      .then((stars) => { if (active) setCount(stars.length); })
      .catch(() => { if (active) setCount(null); });
    return () => { active = false; };
  }, []);

  return (
    <main className="relative z-10 min-h-screen overflow-y-auto px-5 py-10 text-white md:px-10 md:py-14">
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-6xl flex-col justify-center">
        <header className="mb-9 text-center md:mb-12">
          <h1 className="text-balance font-serif text-4xl font-black tracking-[-0.04em] text-white md:text-6xl lg:text-7xl">
            很高兴，在这片星空遇见你
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
            生活是独属于每个人自己的感受，不属于任何别人的看法
          </p>
        </header>

        <section data-theme-hub-top className="grid w-full grid-cols-1 gap-5 md:grid-cols-2 md:gap-7" aria-label="主要企划">
          <button
            type="button"
            onClick={() => { (window as any).playClickSound?.(); onSelect('life'); }}
            aria-label={`进入${theme.hub.name}`}
            className={`group relative ${HUB_CARD_SIZE_CLASS} w-full overflow-hidden rounded-[2rem] border border-amber-200/20 bg-[#211407]/80 p-7 text-left backdrop-blur-xl transition duration-500 hover:-translate-y-2 focus:outline-none focus:ring-2 focus:ring-amber-300/70 md:p-9`}
            style={{ animation: 'theme-card-in .75s cubic-bezier(.2,.8,.2,1) both' }}
          >
            <span
              className="absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-45 blur-3xl transition duration-700 group-hover:scale-125 group-hover:opacity-70"
              style={{ background: theme.visual.cardGlow }}
            />
            <span className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />

            <span className={HUB_CARD_CONTENT_CLASS}>
              <span className="flex items-start justify-between">
                <span className="grid h-14 w-14 place-items-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-200">
                  <SunMedium className="h-7 w-7" />
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/50">
                  {count === undefined ? '正在遥望…' : count === null ? '— 颗星' : `${count} 颗星`}
                </span>
              </span>

              <span>
                <span className="text-xs font-bold tracking-[0.2em] text-amber-300">
                  {theme.hub.eyebrow}
                </span>
                <span className="mt-3 block font-serif text-3xl font-black tracking-tight md:text-4xl">
                  {theme.hub.name}
                </span>
                <span className="mt-3 block max-w-md text-sm leading-7 text-white/55">
                  {theme.hub.description}
                </span>
                <span className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-amber-200">
                  {theme.hub.invitation}
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => { (window as any).playClickSound?.(); onOpenSongRequest(); }}
            aria-label="进入点歌台"
            className={`group relative ${HUB_CARD_SIZE_CLASS} overflow-hidden rounded-[2rem] border border-red-200/20 bg-[#190b0b]/85 p-7 text-left backdrop-blur-xl motion-safe:transition motion-safe:duration-500 motion-safe:hover:-translate-y-2 focus:outline-none focus:ring-2 focus:ring-orange-200/70 md:p-9`}
          >
            <span className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-red-500/20 blur-3xl motion-safe:transition motion-safe:duration-700 motion-safe:group-hover:bg-red-400/30" />
            <span className="pointer-events-none absolute -bottom-24 left-8 h-48 w-48 rounded-full bg-amber-300/10 blur-3xl" />
            <span className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/70 to-transparent" />

            <span className={HUB_CARD_CONTENT_CLASS}>
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-red-200/20 bg-red-300/10 text-orange-100">
                <Guitar className="h-7 w-7" />
              </span>
              <span>
                <span className="block text-[10px] font-bold tracking-[0.28em] text-orange-200/80">SONG REQUEST</span>
                <span className="mt-3 block font-serif text-3xl font-black tracking-tight text-white md:text-4xl">点歌台</span>
                <span className="mt-3 block max-w-md text-sm leading-7 text-white/55">翻翻JIEYOU会唱的歌，把最想听的那一首送上点歌榜。</span>
                <span className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-orange-100">
                  去点一首歌
                  <ArrowUpRight className="h-4 w-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:translate-x-1 motion-safe:group-hover:-translate-y-1" />
                </span>
              </span>
            </span>
          </button>
        </section>

        <section data-theme-hub-bottom className="mt-5 flex justify-center md:mt-7" aria-label="创作工具">
          <a
            href={getMeowGeneratorUrl()}
            aria-label="捏猫"
            onClick={() => { (window as any).playClickSound?.(); }}
            className={`group relative ${HUB_CARD_SIZE_CLASS} w-full overflow-hidden rounded-[2rem] border border-orange-200/20 bg-[#17100c]/85 p-7 text-left backdrop-blur-xl motion-safe:transition motion-safe:duration-500 motion-safe:hover:-translate-y-2 focus:outline-none focus:ring-2 focus:ring-emerald-200/70 md:w-[calc(50%-0.875rem)] md:p-9`}
          >
            <span className="pointer-events-none absolute -left-16 -top-24 h-52 w-52 rounded-full bg-orange-400/20 blur-3xl motion-safe:transition motion-safe:duration-700 motion-safe:group-hover:bg-orange-300/30" />
            <span className="pointer-events-none absolute -bottom-24 right-10 h-48 w-48 rounded-full bg-emerald-300/10 blur-3xl motion-safe:transition motion-safe:duration-700 motion-safe:group-hover:bg-emerald-200/20" />
            <span className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/70 to-transparent" />

            <span className={HUB_CARD_CONTENT_CLASS}>
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-orange-200/20 bg-orange-300/10 text-orange-100">
                <PawPrint className="h-7 w-7" />
              </span>
              <span>
                <span className="block text-[10px] font-bold tracking-[0.28em] text-emerald-200/80">MEOW GENERATOR</span>
                <span className="mt-3 block font-serif text-3xl font-black tracking-tight text-white md:text-4xl">捏猫</span>
                <span className="mt-3 block max-w-md text-sm leading-7 text-white/55">捏出独一无二的小猫，换花色、玩玩具，再留下一张收藏卡。</span>
                <span className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-orange-100">
                  去捏一只猫
                  <ArrowUpRight className="h-4 w-4 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:translate-x-1 motion-safe:group-hover:-translate-y-1" />
                </span>
              </span>
            </span>
          </a>
        </section>

        <p className="mt-7 text-center text-xs tracking-[0.12em] text-white/30">
          欲买桂花同载酒，终不似，少年游
        </p>
      </div>
    </main>
  );
};

export default ThemeHub;
