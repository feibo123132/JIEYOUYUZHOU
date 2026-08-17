import React, { useEffect, useState } from 'react';
import { ArrowLeft, Music, Music2, Sparkles, Star } from 'lucide-react';
import services from '../../services/starService';
import type { ThemeConfig } from '../../themes/themeConfig';

const { starService } = services;

interface WelcomeScreenProps {
  theme: ThemeConfig;
  onEnter: () => void;
  onSwitchTheme: () => void;
  onToggleMusic?: () => void;
  isPlaying?: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  theme,
  onEnter,
  onSwitchTheme,
  onToggleMusic,
  isPlaying = false,
}) => {
  const [starCount, setStarCount] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setStarCount(undefined);
    starService.getAllStars(theme.id)
      .then((stars) => { if (active) setStarCount(stars.length); })
      .catch(() => { if (active) setStarCount(null); });
    return () => { active = false; };
  }, [theme.id]);

  const isLife = theme.id === 'life';
  const incoming = typeof starCount === 'number' ? starCount + 1 : '—';

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 pb-44 pt-24 text-white md:pb-48 md:pt-20">
      <button
        type="button"
        onClick={() => { (window as any).playClickSound?.(); onSwitchTheme(); }}
        className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white/75 backdrop-blur-xl transition hover:border-white/30 hover:bg-white/10 hover:text-white md:left-7 md:top-7"
      >
        <ArrowLeft className="h-4 w-4" />
        企划入口
      </button>

      <button
        type="button"
        onClick={onToggleMusic}
        className="absolute right-5 top-5 rounded-full border border-white/20 bg-white/10 p-3 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-white/20 md:right-7 md:top-7"
        aria-label={isPlaying ? '暂停音乐' : '播放音乐'}
      >
        {isPlaying ? <Music size={20} /> : <Music2 size={20} />}
      </button>

      <header className="mb-9 text-center md:mb-11">
        <div className="mb-4 flex items-center justify-center">
          <Sparkles className={`mr-3 h-7 w-7 animate-pulse ${isLife ? 'text-amber-200' : 'text-yellow-300'}`} />
          <h1 className={`bg-gradient-to-r ${theme.visual.titleGradientClass} bg-clip-text text-4xl font-black tracking-[-0.04em] text-transparent md:text-6xl`}>
            {theme.welcome.title}
          </h1>
          <Sparkles className={`ml-3 h-7 w-7 animate-pulse ${isLife ? 'text-orange-300' : 'text-yellow-300'}`} />
        </div>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-gray-300 md:text-xl">
          {theme.welcome.intro[0]}
          <br />
          {theme.welcome.intro[1]}
        </p>
      </header>

      <section className={`mb-9 w-full max-w-md rounded-[1.7rem] border p-7 backdrop-blur-xl md:p-8 ${
        isLife
          ? 'border-amber-200/20 bg-amber-950/20 shadow-[0_24px_90px_rgba(245,158,11,.12)]'
          : 'border-white/20 bg-white/10 shadow-[0_24px_90px_rgba(124,58,237,.12)]'
      }`}>
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <Star className={`h-12 w-12 animate-pulse ${isLife ? 'text-amber-300' : 'text-yellow-400'}`} />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white md:text-2xl">
              {theme.welcome.countPrefix}
              <span className={`${theme.visual.counterClass} mx-1 inline-block text-[1.75rem] font-black md:text-[2rem]`}>
                第{incoming}颗
              </span>
              {theme.welcome.countNoun}
            </h2>
            <p className="text-sm leading-relaxed text-gray-300">
              {theme.welcome.description[0]}
              <br />
              {theme.welcome.description[1]}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 text-left text-sm text-gray-300">
            {theme.welcome.features.map((feature, index) => (
              <div key={feature} className="flex items-center">
                {index === 1 ? (
                  <Sparkles className={`mr-2 h-4 w-4 ${isLife ? 'text-orange-300' : 'text-blue-400'}`} />
                ) : (
                  <Star className={`mr-2 h-4 w-4 ${isLife ? (index === 0 ? 'text-amber-300' : 'text-rose-300') : (index === 0 ? 'text-yellow-400' : 'text-purple-400')}`} />
                )}
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => { (window as any).playClickSound?.(); onEnter(); }}
        className={`group relative rounded-full bg-gradient-to-r ${theme.visual.buttonGradientClass} ${theme.visual.buttonHoverClass} px-8 py-4 text-lg font-semibold text-white shadow-2xl transition duration-300 hover:scale-105 ${theme.visual.glowClass} active:scale-95`}
      >
        <span className="flex items-center justify-center">
          <span className="mr-3">{theme.welcome.enterLabel}</span>
          <Star className="h-5 w-5 transition-transform duration-500 group-hover:rotate-180" />
        </span>
      </button>
    </div>
  );
};

export default WelcomeScreen;
