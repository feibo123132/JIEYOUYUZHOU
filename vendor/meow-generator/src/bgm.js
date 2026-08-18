const TRACK_URLS = [
  new URL('./assets/audio/sunlit-turnip-path-1.mp3', import.meta.url).href,
  new URL('./assets/audio/sunlit-turnip-path-2.mp3', import.meta.url).href,
];

export function createRandomBgm(button) {
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = 0.24;
  let currentIndex = -1;
  let userPaused = false;

  function pickNextIndex() {
    if (TRACK_URLS.length < 2) return 0;
    const candidate = Math.floor(Math.random() * TRACK_URLS.length);
    return candidate === currentIndex ? (candidate + 1) % TRACK_URLS.length : candidate;
  }

  function syncButton() {
    const playing = !audio.paused;
    button?.classList.toggle('is-playing', playing);
    button?.closest('.music-tool')?.classList.toggle('is-playing', playing);
    button?.setAttribute('aria-pressed', String(playing));
    button?.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
    button?.setAttribute('title', playing ? '暂停背景音乐' : '播放背景音乐');
  }

  async function playNext() {
    currentIndex = pickNextIndex();
    audio.src = TRACK_URLS[currentIndex];
    try {
      await audio.play();
      userPaused = false;
    } catch {
      // Autoplay may still be blocked until the next explicit user gesture.
    }
    syncButton();
  }

  async function resume() {
    if (!audio.src) return playNext();
    try {
      await audio.play();
      userPaused = false;
    } catch {
      // Keep the button available for a later user gesture.
    }
    syncButton();
  }

  function pause() {
    userPaused = true;
    audio.pause();
    syncButton();
  }

  audio.addEventListener('ended', () => {
    if (!userPaused) playNext();
  });
  audio.addEventListener('play', syncButton);
  audio.addEventListener('pause', syncButton);

  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (audio.paused) resume();
    else pause();
  });

  const unlock = (event) => {
    if (event.target instanceof Element && event.target.closest('#bgm-toggle')) return;
    if (!userPaused && audio.paused) resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  syncButton();

  return {
    audio,
    resume,
    pause,
    next: playNext,
    getState: () => ({
      playing: !audio.paused,
      currentIndex,
      source: TRACK_URLS[currentIndex] ?? null,
      volume: audio.volume,
    }),
  };
}
