import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import ThemeHub from './components/Theme/ThemeHub';
import KeepsakeStudio from './components/Keepsake/KeepsakeStudio';
import SongRequestStation from './components/SongRequest/SongRequestStation';
import WelcomeScreen from './components/Welcome/WelcomeScreen';
import NicknameInput from './components/Welcome/NicknameInput';
import StarrySky from './components/StarrySky/StarrySky';
import StarryCanvas from './components/StarrySky/StarryCanvas';
import services from './services/starService';
import useAppStore from './store/appStore';
import { tryGetThemeConfig, type ThemeId } from './themes/themeConfig';

const { userService } = services;

const getPublicBase = () => {
  const raw = import.meta.env.BASE_URL || '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
};

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    activeTheme,
    currentView,
    enterKeepsakeStudio,
    enterSongRequestStation,
    enterStarrySky,
    enterTheme,
    returnToWelcome,
    returnToThemeHub,
    setUser,
    user,
  } = useAppStore();

  const theme = tryGetThemeConfig(activeTheme);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== 'keepsake') return;

    enterKeepsakeStudio();
    url.searchParams.delete('view');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [enterKeepsakeStudio]);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    (audio as any).crossOrigin = 'anonymous';
    audioRef.current = audio;
    (window as any).__bgAudio = audio;

    (window as any).__ensureBgAudioGraph = async () => {
      try {
        if ((window as any).__bgGain) return;
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx || !audioRef.current) return;
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audioRef.current);
        const gain = ctx.createGain();
        source.connect(gain).connect(ctx.destination);
        (window as any).__bgCtx = ctx;
        (window as any).__bgGain = gain;
        try { await ctx.resume(); } catch {}
      } catch {}
    };

    return () => {
      audio.pause();
      audioRef.current = null;
      delete (window as any).__bgAudio;
    };
  }, []);

  useEffect(() => {
    if (activeTheme && !theme) {
      returnToThemeHub();
      toast.error('主题配置不可用，请重新选择');
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (!theme) {
      audio.pause();
      return;
    }

    const base = getPublicBase();
    audio.pause();
    audio.src = base + encodeURIComponent(theme.audio.background);
    audio.load();

    (window as any).__sfxBase = base;
    (window as any).__sfxFiles = ['点亮星星的音效.mp3', ...theme.audio.voices];
    (window as any).__sfxMap = null;
    (window as any).__initSfx = () => {
      if ((window as any).__sfxMap) return;
      const map: Record<string, HTMLAudioElement> = {};
      for (const fileName of (window as any).__sfxFiles) {
        const item = new Audio(base + encodeURIComponent(fileName));
        item.preload = 'auto';
        (item as any).crossOrigin = 'anonymous';
        try { item.load(); } catch {}
        map[fileName] = item;
      }
      (window as any).__sfxMap = map;
    };

    if (isPlayingRef.current) {
      audio.play().catch(() => {
        setIsPlaying(false);
        toast.info('需要您的允许才能播放音乐哦');
      });
    }
  }, [activeTheme, returnToThemeHub, theme]);

  const toggleMusic = () => {
    if (!audioRef.current || !theme) return;
    const next = !isPlaying;
    setIsPlaying(next);
    if (next) {
      audioRef.current.play().catch((error) => {
        console.error('音频播放失败:', error);
        toast.info('需要您的允许才能播放音乐哦');
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  };

  const handleSelectTheme = (themeId: ThemeId) => {
    enterTheme(themeId);
  };

  const handleWelcomeEnter = () => {
    if (user) {
      enterStarrySky();
      return;
    }
    toast.info('请输入你的别称');
    document.getElementById('nickname-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleNicknameSubmit = async (nickname: string) => {
    setIsLoading(true);
    try {
      const userData = await userService.createUser(nickname);
      setUser({
        id: userData.id,
        nickname: userData.nickname,
        isAuthenticated: false,
      });
      enterStarrySky();
    } catch (error) {
      console.error('创建用户失败:', error);
      toast.error('暂时无法进入星空，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030306]">
      <StarryCanvas />
      <div
        className={`pointer-events-none fixed inset-0 transition-opacity duration-700 ${theme?.id === 'life' ? 'opacity-100' : 'opacity-70'}`}
        style={{
          background: theme?.id === 'life'
            ? 'radial-gradient(circle at 72% 18%, rgba(245, 158, 11, .16), transparent 32%), radial-gradient(circle at 20% 72%, rgba(249, 115, 22, .08), transparent 28%)'
            : 'radial-gradient(circle at 30% 20%, rgba(124, 58, 237, .14), transparent 32%)',
        }}
      />

      {currentView === 'theme-hub' && (
        <ThemeHub onSelect={handleSelectTheme} onOpenSongRequest={enterSongRequestStation} />
      )}

      {currentView === 'keepsake-studio' && <KeepsakeStudio onBack={returnToThemeHub} />}

      {currentView === 'song-request' && <SongRequestStation onBack={returnToThemeHub} />}

      {currentView === 'welcome' && theme && (
        <div className="relative z-10 min-h-screen">
          <WelcomeScreen
            theme={theme}
            onEnter={handleWelcomeEnter}
            onSwitchTheme={returnToThemeHub}
            onToggleMusic={toggleMusic}
            isPlaying={isPlaying}
          />
          {!user && (
            <div id="nickname-input" className="relative z-20 mx-auto -mt-36 w-full max-w-md px-4 pb-20 md:-mt-40">
              <NicknameInput theme={theme} onSubmit={handleNicknameSubmit} isLoading={isLoading} />
            </div>
          )}
        </div>
      )}

      {currentView === 'starry-sky' && theme && user && (
        <div className="relative z-10">
          <StarrySky
            theme={theme}
            userNickname={user.nickname}
            userId={user.id}
            onBack={returnToWelcome}
          />
        </div>
      )}

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(0, 0, 0, 0.82)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            backdropFilter: 'blur(12px)',
          },
        }}
      />
    </div>
  );
}

export default App;
