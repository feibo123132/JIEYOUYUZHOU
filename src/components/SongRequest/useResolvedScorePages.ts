import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isCloudScorePage } from './songScores';
import { refreshSongScorePageUrls } from './songRequestCloud';

/**
 * 谱子图片存在腾讯云存储里，<img> 用的是 getTempFileURL 换来的签名地址，而签名地址有有效期。
 * 之前只在「拉取云端数据」时换一次，所以页面长时间挂着（iPad 尤其明显）之后地址过期，
 * 谱子全部变成裂图，只有刷新整个网页才会重新换链接。
 *
 * 这里让谱子自己恢复，不再依赖手动刷新：
 *  1. 组件挂载 / 长时间停留 / 从后台回到前台时，主动换一批新的签名地址；
 *  2. 图片加载失败（onError）时立刻换新地址并重试；
 *  3. 换新带节流与重试上限，避免坏图导致死循环、也避免频繁刷新造成阅读时闪烁。
 */
const PROACTIVE_REFRESH_MS = 2 * 60 * 60 * 1000; // 长时间停留：超过 2 小时主动换新
const WAKE_REFRESH_MS = 20 * 60 * 1000;         // 从后台回来：超过 20 分钟就换新
const CHECK_INTERVAL_MS = 15 * 60 * 1000;       // 前台定时检查间隔
const RETRY_DELAY_MS = 1200;                    // 加载失败后的重试间隔
const MAX_AUTO_REFRESH = 4;                     // 连续失败的最大自动重试次数

type ResolveMode = 'proactive' | 'retry' | 'wake';

export interface ResolvedScorePages {
  /** 可直接放进 <img src> 的地址：重试时会带上标记，确保浏览器真的重新发起请求。 */
  pages: string[];
  /** 手动或自动触发一次换链；force 为 true 时忽略重试次数上限。 */
  refresh: (force?: boolean) => void;
}

const withRetryMark = (urls: string[], nonce: number): string[] => (
  nonce === 0
    ? urls
    : urls.map((url) => (
      url.startsWith('data:') ? url : `${url}${url.includes('#') ? '&' : '#'}score-retry=${nonce}`
    ))
);

const joinKey = (values: string[]) => values.join('\u0000');

/**
 * @param sourcePages  云端原始地址（cloud:// fileID），换新签名地址的依据
 * @param initialPages 先用哪一批地址渲染（通常是上一次换好的签名地址），缺省与 sourcePages 一致
 */
export const useResolvedScorePages = (sourcePages: string[], initialPages?: string[]): ResolvedScorePages => {
  const sourceRef = useRef(sourcePages);
  sourceRef.current = sourcePages;
  const initial = initialPages?.length === sourcePages.length ? initialPages : sourcePages;
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const sourceKey = joinKey(sourcePages);
  const initialKey = joinKey(initial);

  const [resolved, setResolved] = useState<string[]>(initial);
  const resolvedRef = useRef(initial);
  const [nonce, setNonce] = useState(0);
  const refreshedAtRef = useRef(0);
  const busyRef = useRef(false);
  const pendingRef = useRef(false);
  const attemptsRef = useRef(0);
  const generationRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    };
  }, []);

  const resolveNow = useCallback(async (mode: ResolveMode) => {
    const sources = sourceRef.current;
    if (!sources.some(isCloudScorePage)) return;
    if (busyRef.current) {
      // 已经有一次换链在跑：等它结束后再补一次，避免漏掉刚切过来的谱子。
      pendingRef.current = true;
      return;
    }
    const idleMs = Date.now() - refreshedAtRef.current;
    if (mode === 'proactive' && idleMs < PROACTIVE_REFRESH_MS) return;
    if (mode === 'wake' && idleMs < WAKE_REFRESH_MS) return;
    const generation = generationRef.current;
    busyRef.current = true;
    try {
      const urls = await refreshSongScorePageUrls(sources);
      // 期间换了谱子（或组件已卸载）就丢弃这批结果，避免把上一首的地址贴到这一首上。
      if (!aliveRef.current || generation !== generationRef.current) return;
      if (urls.length !== sources.length) return;
      const changed = urls.some((url, index) => url !== resolvedRef.current[index]);
      refreshedAtRef.current = Date.now();
      resolvedRef.current = urls;
      // 主动换新时地址没变就不动，避免阅读途中无谓地重新加载图片。
      if (changed || mode === 'retry') {
        setResolved(urls);
        setNonce((current) => current + 1);
      }
      if (changed) attemptsRef.current = 0;
    } catch {
      // 云端暂时不可用或未登录：保留现有地址，等下一次触发再试。
    } finally {
      busyRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void resolveNow('proactive');
      }
    }
  }, []);

  // 谱子换了（切歌 / 内容更新 / 拉取到新的签名地址）→ 重置状态并立刻换一次链接。
  useEffect(() => {
    generationRef.current += 1;
    const next = initialRef.current;
    resolvedRef.current = next;
    setResolved(next);
    setNonce(0);
    attemptsRef.current = 0;
    refreshedAtRef.current = 0;
    void resolveNow('proactive');
  }, [sourceKey, initialKey, resolveNow]);

  // 从后台回到前台、窗口重新获得焦点、网络恢复 → 检查签名是否可能过期并换新。
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState !== 'visible') return;
      void resolveNow('wake');
    };
    const onOnline = () => {
      attemptsRef.current = 0;
      void resolveNow('wake');
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onOnline);
    };
  }, [resolveNow]);

  // 页面一直开着（iPad 常驻）时定时检查，别等到用户打开翻谱器才发现链接过期。
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void resolveNow('proactive');
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [resolveNow]);

  // 图片加载失败 → 合并同一批失败，延迟一次换新后重试。
  const refresh = useCallback((force = false) => {
    if (force) attemptsRef.current = 0;
    else if (attemptsRef.current >= MAX_AUTO_REFRESH) return;
    attemptsRef.current += 1;
    if (retryTimerRef.current !== null) return;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void resolveNow('retry');
    }, RETRY_DELAY_MS);
  }, [resolveNow]);

  const pages = useMemo(() => withRetryMark(resolved, nonce), [resolved, nonce]);

  return { pages, refresh };
};
