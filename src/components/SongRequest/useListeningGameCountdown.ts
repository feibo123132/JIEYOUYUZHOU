import { useEffect, useRef, useState } from 'react';
import { getAudioContext } from './audioClipping';
import { answerSecondsLeft } from './listeningGame';

const sounds = ['./listening-game/countdown/tick.wav', './listening-game/countdown/time-up.wav'];

export function useListeningGameCountdown(deadline: number | null, receivedAt: number, timerKey: string | null) {
  const [now, setNow] = useState(() => performance.now());
  const seconds = deadline === null ? null : answerSecondsLeft(deadline, Math.max(now, receivedAt));
  const clips = useRef<AudioBuffer[] | null>(null);
  const previous = useRef<{ key: string; seconds: number } | null>(null);

  useEffect(() => {
    if (deadline === null) return;
    let timer: number;
    const tick = () => {
      window.clearTimeout(timer);
      const current = performance.now();
      setNow(current);
      const left = deadline - current;
      if (left > 0) {
        const nextSecond = left - (Math.ceil(left / 1000) - 1) * 1000;
        timer = window.setTimeout(tick, Math.ceil(nextSecond));
      }
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [deadline]);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const unlock = () => {
      try {
        const context = getAudioContext();
        if (context.state !== 'running') void context.resume().catch(() => {});
        if (loading || clips.current) return;
        loading = true;
        void Promise.all(sounds.map(async url => {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('COUNTDOWN_AUDIO_UNAVAILABLE');
          return context.decodeAudioData(await response.arrayBuffer());
        })).then(buffers => {
          if (!controller.signal.aborted) clips.current = buffers;
        }).catch(() => { loading = false; });
      } catch {
        // The visual countdown still works when the browser blocks audio.
      }
    };
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      controller.abort();
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, []);

  useEffect(() => {
    const last = previous.current;
    previous.current = timerKey !== null && seconds !== null ? { key: timerKey, seconds } : null;
    if (seconds === null || !last || last.key !== timerKey || seconds >= last.seconds || document.hidden) return;
    const clip = clips.current?.[seconds === 0 ? 1 : 0];
    if (!clip) return;
    try {
      const context = getAudioContext();
      if (context.state !== 'running') return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = seconds === 0 ? 0.62 : 0.34;
      source.buffer = clip;
      source.connect(gain);
      gain.connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
    } catch {
      // Audio is optional when the output device is unavailable.
    }
  }, [seconds, timerKey]);

  return seconds;
}
