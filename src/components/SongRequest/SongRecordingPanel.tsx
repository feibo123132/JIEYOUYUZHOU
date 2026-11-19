import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Mic2, Pause, Play, RefreshCw, Scissors, Trash2 } from 'lucide-react';
import type { Song } from './songCatalog';
import type { SongRecordSession } from './songRecords';
import { getMatchQuality } from './songRecords';
import {
  deleteRecordingBlob, getRecordingBlob, isRecordingScore, keptDuration, loadRecordingCache, normalizeAudioCuts,
  parseSongRecordings, putRecordingBlob, RECORDING_CLOUD_LIMIT, RECORDING_MAX_BYTES, resolveKeptSegments, saveRecordingCache,
  type AudioCut, type SongRecording,
} from './songRecordings';
import {
  deleteCloudSongRecording, deleteSongRecordingFile, mapSongRecordingError, pullCloudSongRecordings,
  readSongRecordingBlob, resolveSongRecordingUrl, saveCloudSongRecording, uploadSongRecordingFile,
} from './songRequestCloud';
import { decodeAudioBlob, downloadBlob, encodeAudioClipToWav, formatDuration, formatFileSize as formatRecordingSize, getAudioContext } from './audioClipping';
import AudioTrimDialog from './AudioTrimDialog';
import { loadLegacyAudioMarkers, type AudioMarker } from './audioMarkers';
import { hasRecordingGain, sameRecordingGain, scheduleAudioGain, type RecordingGain } from './audioGain';
import { buildPlaybackPeaks, joinedPosition, playbackDuration, probePlayback, slicePlayback, type RecordingWaveform } from './recordingPlayback';

export interface SongRecordingsHandle {
  upload: (file: File) => Promise<void>;
  openTrimPicker: () => void;
  toggleScorePlayback: () => Promise<string | undefined>;
  /** 切到练习 / 路演时在顶部挂一个「停止」按钮，不用切回谱子就能掐掉播放。 */
  stopPlayback: () => void;
  readPlaybackPosition: () => number;
  seekPlayback: (position: number) => Promise<string | undefined>;
}

interface SongRecordingsProps {
  song: Song;
  session: SongRecordSession | null;
  canManage: boolean;
  onCountChange?: (count: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  showWaveform?: boolean;
  onWaveformChange?: (waveform: RecordingWaveform | null) => void;
  /** 裁剪弹窗里点「录音榜」：评分已经落库，这里只需通知页面跳过去。 */
  onOpenRecordingBoard?: () => void;
}

const fileNameOf = (file: File) => file.name.replace(/\.[^.]+$/, '').trim() || '录音';

/**
 * 一段 0.05 秒的静音 wav。
 * iOS 只允许「用户手势里 play() 过一次」的媒体元素长期出声，
 * 所以点击播放时先用它把手势解一次锁，后面换 src 就不会被拦。
 */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=';

/**
 * 锁屏 / 通知栏的控制条：有 metadata 才有锁屏封面与进度，
 * 否则系统只会把网页当成「静音掉的后台页」，不会当播放器接管。
 */
const applyMediaSession = (song: Song | null, recording: SongRecording | null, playing: boolean) => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (!recording || !song) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: recording.title,
        artist: `${song.title} · ${song.artist}`,
        album: 'JIEYOU 声音档案',
      });
    }
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  } catch { /* 老浏览器没有这套 API，忽略即可 */ }
};

/**
 * 用 <audio> 元数据读时长。比 decodeAudioData 宽容得多，
 * 即使浏览器解不了波形，也能先把文件存下来。
 */
const readAudioDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  const cleanup = () => { URL.revokeObjectURL(url); audio.removeAttribute('src'); };
  audio.preload = 'metadata';
  audio.onloadedmetadata = () => {
    const duration = audio.duration;
    cleanup();
    if (Number.isFinite(duration) && duration > 0) resolve(duration);
    else reject(new Error('INVALID_AUDIO'));
  };
  audio.onerror = () => { cleanup(); reject(new Error('INVALID_AUDIO')); };
  audio.src = url;
});

const SongRecordings = forwardRef<SongRecordingsHandle, SongRecordingsProps>(({
  song, session, canManage, onCountChange, onPlayingChange, showWaveform, onWaveformChange, onOpenRecordingBoard,
}, ref) => {
  const [recordings, setRecordings] = useState<SongRecording[]>(() => loadRecordingCache(window.localStorage, session?.alias ?? null));
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [trimming, setTrimming] = useState<{ recording: SongRecording; buffer: AudioBuffer } | null>(null);
  const [trimMinimized, setTrimMinimized] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 解码后的音频只留最近一条：播放和裁剪共用，省掉重复解码。 */
  const bufferCacheRef = useRef<{ id: string; buffer: AudioBuffer } | null>(null);
  const pendingBuffers = useRef(new Map<string, Promise<AudioBuffer>>());
  const playhead = useRef<{ id: string; position: number; read?: () => number } | null>(null);
  const playbackRequested = useRef(false);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playbackGainRef = useRef<GainNode | null>(null);
  const playbackVersionRef = useRef(0);
  /** 前台追帧的句柄：媒体元素靠它把「删掉的段落」精确跳过（后台自动停，不影响出声）。 */
  const segmentRafRef = useRef(0);
  /** 追帧函数本身：从后台切回前台时重新启动它（后台 rAF 会被浏览器停掉）。 */
  const playbackPumpRef = useRef<(() => void) | null>(null);
  /** 锁屏 / 线控按钮回调里用的最新播放函数（effect 里只绑一次监听，避免反复解绑）。 */
  const playbackControlsRef = useRef<{ play?: (recording: SongRecording, position: number) => void; stop?: () => void }>({});
  const urlCacheRef = useRef(new Map<string, string>());
  const recordingsRef = useRef(recordings);
  recordingsRef.current = recordings;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** 防止同一段录音被并发上传（自动补传 + 手动重试撞车）。 */
  const syncingRef = useRef(new Set<string>());
  const autoSyncRef = useRef('');

  const songRecordings = useMemo(
    () => recordings.filter((item) => item.songId === song.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [recordings, song.id],
  );
  const selectedRecording = songRecordings.find(item => item.id === selectedRecordingId) ?? songRecordings[0];
  const selectedParts = useMemo(() => selectedRecording
    ? resolveKeptSegments(selectedRecording.clipStart, selectedRecording.clipEnd, selectedRecording.cuts)
    : [], [selectedRecording]);

  useEffect(() => { onCountChange?.(songRecordings.length); }, [onCountChange, songRecordings.length]);
  const isRecordingPlaying = playingId !== null;
  useEffect(() => { onPlayingChange?.(isRecordingPlaying); }, [onPlayingChange, isRecordingPlaying]);

  useEffect(() => {
    const cached = loadRecordingCache(window.localStorage, session?.alias ?? null);
    recordingsRef.current = cached;
    setRecordings(cached);
  }, [session?.alias]);

  // 云端拉取：失败时静默保留本机缓存，不打扰用户。
  useEffect(() => {
    const current = sessionRef.current;
    if (!current) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = parseSongRecordings(await pullCloudSongRecordings(current));
        if (cancelled) return;
        setRecordings((existing) => {
          const byId = new Map<string, SongRecording>();
          for (const item of existing) byId.set(item.id, item);
          for (const item of remote) {
            const local = byId.get(item.id);
            // 本机还有没同步出去的改动时先保住本机版本，避免刚裁好的区间被云端旧值盖掉。
            byId.set(item.id, local?.pendingSync ? { ...item, ...local } : { ...item, localBlobId: local?.localBlobId });
          }
          const merged = [...byId.values()];
          recordingsRef.current = merged;
          saveRecordingCache(window.localStorage, current.alias, merged);
          return merged;
        });
      } catch {
        // 云函数未部署或离线：使用本机缓存。
      }
    })();
    return () => { cancelled = true; };
  }, [session?.alias]);

  const commit = useCallback((next: SongRecording[]) => {
    recordingsRef.current = next;
    setRecordings(next);
    if (session) saveRecordingCache(window.localStorage, session.alias, next);
  }, [session]);

  // 基于最新状态更新，避免连续两次 commit 时读到旧闭包；
  // 同时立刻回写 ref，让上传这类异步流程能读到刚写进去的 fileID / 裁剪区间。
  // 以 ref 为唯一真相源同步计算：上传 / 裁剪都是异步流程，
  // 必须保证「刚写进去的 fileID」在下一次读取时一定拿得到。
  const commitWith = useCallback((updater: (current: SongRecording[]) => SongRecording[]) => {
    const next = updater(recordingsRef.current);
    recordingsRef.current = next;
    setRecordings(next);
    return session ? saveRecordingCache(window.localStorage, session.alias, next) : false;
  }, [session]);

  /**
   * 把一段「只在本机」的录音推到云端 —— 音频进云存储拿 fileID，元数据与裁剪区间
   * 进 workspace.recordings，和谱子完全同一套范式，所以电脑与 iPad 都能拉到。
   * 失败时保留本机文件并标记待同步，随时可以重试，不会丢东西。
   */
  const syncRecording = useCallback(async (id: string, seed?: SongRecording) => {
    const credentials = sessionRef.current;
    if (!credentials || syncingRef.current.has(id)) return;
    const local = recordingsRef.current.find((item) => item.id === id) ?? seed;
    if (!local || (local.fileID && !local.pendingSync)) return;

    syncingRef.current.add(id);
    setSyncingId(id);
    setUploadProgress(local.fileID ? null : 0);
    try {
      let fileID = local.fileID;
      if (!fileID) {
        const blob = await getRecordingBlob(local.localBlobId ?? local.id);
        if (!blob) throw new Error('RECORDING_LOCAL_MISSING');
        const file = new File([blob], local.fileName || `${local.title}.mp3`, { type: local.mimeType || 'audio/mpeg' });
        const uploaded = await uploadSongRecordingFile(credentials, local.songId, file, (percent) => setUploadProgress(percent));
        fileID = uploaded.fileID;
        // 音频已经进了云存储，先把 fileID 落到本机，重试时不会重复上传整首。
        commitWith((items) => items.map((item) => (item.id === id ? { ...item, fileID, pendingSync: true } : item)));
      }
      let latest = recordingsRef.current.find((item) => item.id === id);
      while (latest) {
        // 录音指数跟着录音一起上云：没有分就显式送 0，云端按「这段没评」处理，
        // 这样清空评分也能同步出去（省略字段的含义是「本次客户端没带这个信息」）。
        const payload: SongRecording = { ...latest, fileID, pendingSync: false, score: latest.score ?? 0 };
        const remote = parseSongRecordings([await saveCloudSongRecording(credentials, payload)])[0];
        const current = recordingsRef.current.find((item) => item.id === id);
        // 窗口可以连续保存。上一笔同步完成时，继续提交保存期间产生的新版本。
        if (current !== latest) {
          latest = current;
          continue;
        }
        if (payload.markers !== undefined && (remote?.markers === undefined || payload.markers.some(
          ({ topic }, index) => topic !== undefined && topic !== remote.markers?.[index]?.topic,
        ))) {
          throw new Error('RECORDING_MARKERS_UNSUPPORTED');
        }
        // 片段评论的终点是后加的字段：老云函数会把它剥掉，那样评论就退回成一个点。
        if (payload.markers?.some((marker, index) => marker.end !== undefined && (
          remote?.markers?.[index]?.end === undefined || Math.abs(remote.markers[index].end! - marker.end) > 0.001
        ))) {
          throw new Error('RECORDING_MARKER_SPAN_UNSUPPORTED');
        }
        if (payload.gain !== undefined && !sameRecordingGain(payload.gain, remote?.gain)) {
          throw new Error('RECORDING_GAIN_UNSUPPORTED');
        }
        if ((isRecordingScore(payload.score) ? payload.score : null) !== (remote?.score ?? null)) {
          throw new Error('RECORDING_SCORE_UNSUPPORTED');
        }
        const synced: SongRecording = remote ? { ...remote, localBlobId: latest.localBlobId } : payload;
        commitWith((items) => items.map((item) => (item.id === id ? synced : item)));
        setMessage('录音已同步到云端，换设备也能听到。');
        break;
      }
    } catch (error) {
      commitWith((items) => items.map((item) => (item.id === id ? { ...item, pendingSync: true } : item)));
      setMessage(mapSongRecordingError(error));
    } finally {
      syncingRef.current.delete(id);
      setSyncingId(null);
      setUploadProgress(null);
    }
  }, [commitWith]);

  const syncPending = async () => {
    const targets = recordingsRef.current.filter((item) => item.pendingSync);
    if (!targets.length) return;
    for (const item of targets) await syncRecording(item.id);
  };

  // 进入页面补传一次：上次没传成功的录音（关掉了页面、断网、云函数刚部署）自动续上。
  // 已经传过音频、只差元数据的那几条（显示「云端待更新」）也一并重试，
  // 否则修好云端之后还得逐条点「重试同步」。
  useEffect(() => {
    const alias = session?.alias;
    if (!alias || autoSyncRef.current === alias) return;
    autoSyncRef.current = alias;
    const pending = recordingsRef.current.filter((item) => item.pendingSync);
    if (!pending.length) return;
    void (async () => {
      for (const item of pending) await syncRecording(item.id);
    })();
  }, [session?.alias, syncRecording]);

  useEffect(() => () => {
    playbackVersionRef.current += 1;
    cancelAnimationFrame(segmentRafRef.current);
    for (const source of sourcesRef.current) { try { source.onended = null; source.stop(); } catch { /* 已停止 */ } }
    sourcesRef.current = [];
    playbackGainRef.current?.disconnect();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    for (const url of urlCacheRef.current.values()) URL.revokeObjectURL(url);
    urlCacheRef.current.clear();
    applyMediaSession(null, null, false);
  }, []);

  /**
   * 锁屏 / 通知栏的控制条：有 metadata 才有锁屏封面与进度，
   * 否则系统只会「静音掉这个网页」，不会把它当成正在播放的播放器。
   */
  const syncMediaSession = (recording: SongRecording | null, playing: boolean) => applyMediaSession(song, recording, playing);

  // 线控 / 锁屏按钮：只绑一次，通过 ref 调最新的播放函数。
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const mediaSession = navigator.mediaSession;
    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { mediaSession.setActionHandler(action, handler); } catch { /* 该设备不支持这个动作 */ }
    };
    setHandler('play', () => {
      const head = playhead.current;
      const item = head ? recordingsRef.current.find((recording) => recording.id === head.id) : undefined;
      if (item) playbackControlsRef.current.play?.(item, head?.position ?? 0);
    });
    setHandler('pause', () => playbackControlsRef.current.stop?.());
    setHandler('stop', () => playbackControlsRef.current.stop?.());
    return () => {
      setHandler('play', null);
      setHandler('pause', null);
      setHandler('stop', null);
    };
  }, []);

  // 从后台 / 息屏回来：rAF 被系统停了，重新拉起追帧，删除段才会继续被跳过。
  useEffect(() => {
    const restart = () => {
      if (document.visibilityState !== 'visible' || !playbackRequested.current) return;
      const pump = playbackPumpRef.current;
      if (!pump) return;
      cancelAnimationFrame(segmentRafRef.current);
      segmentRafRef.current = requestAnimationFrame(pump);
    };
    document.addEventListener('visibilitychange', restart);
    return () => document.removeEventListener('visibilitychange', restart);
  }, []);

  const stopPlayback = () => {
    playbackVersionRef.current += 1;
    playbackRequested.current = false;
    cancelAnimationFrame(segmentRafRef.current);
    playbackPumpRef.current = null;
    const head = playhead.current;
    if (head?.read) playhead.current = { id: head.id, position: head.read() };
    setBusy(current => current === '正在加载音频…' ? '' : current);
    for (const source of sourcesRef.current) {
      try { source.onended = null; source.stop(); } catch { /* 已停止 */ }
    }
    sourcesRef.current = [];
    playbackGainRef.current?.disconnect();
    playbackGainRef.current = null;
    const audio = audioRef.current;
    if (audio) { audio.pause(); try { audio.currentTime = 0; } catch { /* ignore */ } }
    setPlayingId(null);
    applyMediaSession(null, null, false);
  };

  /**
   * 点播放时先同步解一次媒体元素的锁（必须在手势里，不能 await 之后再做），
   * 否则 iOS 会把之后的 play() 当成自动播放拦下来。
   */
  const unlockAudioElement = () => {
    let audio = audioRef.current;
    if (!audio) { audio = new Audio(); audioRef.current = audio; }
    if (audio.dataset.unlocked === '1') return;
    audio.dataset.unlocked = '1';
    audio.src = SILENT_WAV;
    void audio.play().catch(() => undefined);
  };

  const playableUrl = async (recording: SongRecording): Promise<string> => {
    const cached = urlCacheRef.current.get(recording.id);
    if (cached) return cached;
    const blob = await getRecordingBlob(recording.localBlobId ?? recording.id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      urlCacheRef.current.set(recording.id, url);
      return url;
    }
    if (recording.fileID) {
      const url = await resolveSongRecordingUrl(recording.fileID);
      if (url) {
        urlCacheRef.current.set(recording.id, url);
        return url;
      }
    }
    throw new Error('RECORDING_NOT_FOUND');
  };

  /**
   * 媒体元素播放（默认路径）：只有 <audio> 能被系统当成播放器接管，
   * 息屏、切到别的 App、锁屏后继续出声靠的都是它（酷狗那种体验）。
   * 裁剪段靠 rAF 逐帧跳过（前台约 16ms，听不出），后台 rAF 停了就由 timeupdate 兜（约 250ms）。
   */
  const playWithMediaElement = async (recording: SongRecording, version: number, parts: AudioCut[], position: number): Promise<boolean> => {
    const url = await playableUrl(recording);
    if (version !== playbackVersionRef.current) return false;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.setAttribute('playsinline', 'true');
    audio.preload = 'auto';
    if (audio.src !== url) audio.src = url;
    const finish = () => finishPlayback(recording.id, playbackDuration(parts), version);
    // 把播放头推回保留段内：返回 false 表示已经放到头了。
    const settleIntoKeptPart = () => {
      if (version !== playbackVersionRef.current) return false;
      if (audio.seeking || audio.paused) return true;
      const probe = probePlayback(parts, audio.currentTime);
      if (probe.kind === 'ok') return true;
      if (probe.kind === 'end') { audio.pause(); finish(); return false; }
      try { audio.currentTime = probe.at; } catch { /* 还没 seekable */ }
      return true;
    };
    const pump = () => {
      // 暂停 / 播完就停掉追帧，别空转；回到前台时由 visibilitychange 重新拉起。
      if (audio.paused || !settleIntoKeptPart()) return;
      if (document.visibilityState === 'visible') segmentRafRef.current = requestAnimationFrame(pump);
    };
    audio.onended = () => { if (version === playbackVersionRef.current) finish(); };
    audio.ontimeupdate = () => { settleIntoKeptPart(); };
    const first = slicePlayback(parts, position)[0];
    audio.currentTime = (first ?? parts[0]).start;
    await audio.play();
    if (version !== playbackVersionRef.current || !playbackRequested.current) return false;
    playhead.current = { id: recording.id, position, read: () => joinedPosition(parts, audio.currentTime) };
    playbackPumpRef.current = pump;
    segmentRafRef.current = requestAnimationFrame(pump);
    setPlayingId(recording.id);
    syncMediaSession(recording, true);
    return true;
  };

  const finishPlayback = (id: string, duration: number, version: number) => {
    if (version !== playbackVersionRef.current) return;
    playbackRequested.current = false;
    playhead.current = { id, position: duration };
    cancelAnimationFrame(segmentRafRef.current);
    playbackPumpRef.current = null;
    setPlayingId(null);
    applyMediaSession(null, null, false);
  };

  /**
   * 播放录音。默认交给 <audio>（息屏 / 后台能继续播），
   * 存过增益的录音才走 Web Audio —— <audio> 的 volume 上限是 1，抬不动电平。
   */
  const playRecording = async (recording: SongRecording, position = 0) => {
    // 必须在 await 之前、在这个点击手势里把媒体元素解一次锁（iOS 的硬要求）。
    unlockAudioElement();
    stopPlayback();
    setSelectedRecordingId(recording.id);
    playhead.current = { id: recording.id, position };
    playbackRequested.current = true;
    const version = playbackVersionRef.current;
    const fail = (reason: string) => {
      playbackRequested.current = false;
      setMessage(reason);
      return reason;
    };
    const kept = resolveKeptSegments(recording.clipStart, recording.clipEnd, recording.cuts);
    const parts = slicePlayback(kept, position);
    if (!parts.length) return fail('没有可播放的部分。');

    if (!hasRecordingGain(recording.gain)) {
      try {
        if (await playWithMediaElement(recording, version, kept, position)) return;
        if (version !== playbackVersionRef.current) return;
      } catch {
        if (version !== playbackVersionRef.current) return;
        // 媒体元素也放不了（编码特殊 / 取不到地址），退到解码后的 Web Audio。
      }
    }

    let buffer = bufferCacheRef.current?.id === recording.id ? bufferCacheRef.current.buffer : null;
    if (!buffer) {
      setBusy('正在加载音频…');
      buffer = await getPlaybackBuffer(recording).catch(() => null);
      setBusy(current => current === '正在加载音频…' && version === playbackVersionRef.current ? '' : current);
    }
    if (version !== playbackVersionRef.current) return;
    if (!buffer) {
      if (hasRecordingGain(recording.gain)) {
        return fail('无法读取音频来应用已保存的增益，请重试。');
      }
      try {
        await playWithMediaElement(recording, version, kept, position);
      } catch {
        if (version === playbackVersionRef.current) return fail('这段录音暂时无法播放，请重新上传。');
      }
      return;
    }
    try {
      const context = getAudioContext();
      await context.resume();
      if (version !== playbackVersionRef.current) return;
      const startedAt = context.currentTime + 0.03;
      const gainNode = recording.gain && hasRecordingGain(recording.gain) ? context.createGain() : null;
      if (gainNode && recording.gain) {
        playbackGainRef.current = gainNode;
        gainNode.connect(context.destination);
        scheduleAudioGain(gainNode.gain, parts, recording.gain, startedAt);
      }
      let cursor = startedAt;
      const sources: AudioBufferSourceNode[] = [];
      sourcesRef.current = sources;
      for (const part of parts) {
        const duration = part.end - part.start;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gainNode ?? context.destination);
        source.start(cursor, part.start, duration);
        cursor += duration;
        sources.push(source);
      }
      const last = sources[sources.length - 1];
      if (last) last.onended = () => {
        if (version !== playbackVersionRef.current) return;
        gainNode?.disconnect();
        playbackGainRef.current = null;
        sourcesRef.current = [];
        finishPlayback(recording.id, playbackDuration(kept), version);
      };
      playhead.current = {
        id: recording.id, position,
        read: () => position + Math.max(0, Math.min(cursor - startedAt, context.currentTime - startedAt)),
      };
      setPlayingId(recording.id);
      syncMediaSession(recording, true);
    } catch {
      if (version !== playbackVersionRef.current) return;
      stopPlayback();
      return fail('这段录音暂时无法播放，请重新上传。');
    }
  };

  // 锁屏按钮用的是这里的最新函数，避免在 effect 里反复解绑监听。
  playbackControlsRef.current = {
    play: (recording, position) => { void playRecording(recording, position); },
    stop: () => stopPlayback(),
  };

  const togglePlay = async (recording: SongRecording) => {
    if (playingId === recording.id) { stopPlayback(); return; }
    return playRecording(recording);
  };

  const loadBuffer = useCallback(async (recording: SongRecording): Promise<AudioBuffer> => {
    const blobKey = recording.localBlobId ?? recording.id;
    const cached = await getRecordingBlob(blobKey);
    if (cached) return decodeAudioBlob(cached);
    if (!recording.fileID) throw new Error('RECORDING_NOT_FOUND');

    // 只存在云端的录音（通常是另一台设备上传的）：先直连签名地址，
    // 被跨域拦下来就改走云函数分段代取，取回后顺手留在本机。
    let remote: Blob | null = null;
    try {
      const url = await resolveSongRecordingUrl(recording.fileID);
      const response = await fetch(url);
      if (response.ok) remote = await response.blob();
    } catch {
      remote = null;
    }
    if ((!remote || !remote.size) && sessionRef.current) {
      remote = await readSongRecordingBlob(sessionRef.current, recording.fileID, recording.mimeType);
    }
    if (!remote || !remote.size) throw new Error('RECORDING_DOWNLOAD_FAILED');
    void putRecordingBlob(blobKey, remote);
    return decodeAudioBlob(remote);
  }, []);

  const getPlaybackBuffer = useCallback((recording: SongRecording): Promise<AudioBuffer> => {
    const cached = bufferCacheRef.current;
    if (cached?.id === recording.id) return Promise.resolve(cached.buffer);
    const pending = pendingBuffers.current.get(recording.id);
    if (pending) return pending;
    const request = loadBuffer(recording).then(buffer => {
      bufferCacheRef.current = { id: recording.id, buffer };
      return buffer;
    }).finally(() => pendingBuffers.current.delete(recording.id));
    pendingBuffers.current.set(recording.id, request);
    return request;
  }, [loadBuffer]);

  useEffect(() => {
    if (!showWaveform || !selectedRecording || !onWaveformChange) {
      onWaveformChange?.(null);
      return;
    }
    let cancelled = false;
    const duration = playbackDuration(selectedParts);
    const base = { id: selectedRecording.id, duration, peaks: null };
    onWaveformChange(base);
    if (!duration) return;
    void getPlaybackBuffer(selectedRecording).then(buffer => {
      if (!cancelled) onWaveformChange({ ...base, peaks: buildPlaybackPeaks(buffer, selectedParts, selectedRecording.gain) });
    }).catch(() => {
      if (!cancelled) onWaveformChange({ ...base, unavailable: true });
    });
    return () => { cancelled = true; };
  }, [getPlaybackBuffer, onWaveformChange, selectedParts, selectedRecording, showWaveform]);

  const openTrim = async (recording: SongRecording) => {
    if (trimming) {
      setTrimMinimized(false);
      return;
    }
    stopPlayback();
    setMessage('');
    try {
      // 刚播放过就直接复用已解码的缓冲，弹窗打开瞬间出波形。
      const cached = bufferCacheRef.current?.id === recording.id ? bufferCacheRef.current.buffer : null;
      if (cached) { setTrimming({ recording, buffer: cached }); return; }
      setBusy('正在读取音频波形…');
      const buffer = await loadBuffer(recording);
      bufferCacheRef.current = { id: recording.id, buffer };
      setTrimming(current => current ?? { recording, buffer });
    } catch (error) {
      setMessage(mapSongRecordingError(error));
    } finally {
      setBusy('');
    }
  };

  const upload = async (file: File) => {
    if (!session || !canManage) { setMessage('只有登录后的站主可以上传录音。'); return; }
    if (file.size > RECORDING_MAX_BYTES) { setMessage(`录音超过 ${formatRecordingSize(RECORDING_MAX_BYTES)} 上限，请先压缩或剪短。`); return; }
    // 云端上限是「录音条数」，先拦一下，别等 4MB 传完才被拒。
    if (recordingsRef.current.length >= RECORDING_CLOUD_LIMIT) {
      setMessage(`云端最多保存 ${RECORDING_CLOUD_LIMIT} 段录音，先删掉一些旧录音再上传。`);
      return;
    }
    stopPlayback();
    setMessage('');
    setBusy('正在读取音频信息…');

    // 先用 <audio> 元数据拿时长（比 decodeAudioData 宽容得多），拿不到再退回去解码。
    // 时长是裁剪区间与云端校验的基准，两路都失败才判定为无法解析。
    let buffer: AudioBuffer | null = null;
    let duration = await readAudioDuration(file).catch(() => 0);
    if (!duration) {
      buffer = await decodeAudioBlob(file).catch(() => null);
      duration = buffer?.duration ?? 0;
    }
    if (!duration) {
      setBusy('');
      setMessage('这段音频无法解析，请确认格式（mp3 / m4a / wav / ogg），或先转成 mp3 再上传。');
      return;
    }

    // ① 先落本机：此刻断网、云函数没部署，这段录音也不会丢。
    setBusy('正在保存到本机…');
    const id = `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const storedLocally = await putRecordingBlob(id, file);
    const now = new Date().toISOString();
    const seconds = Number(duration.toFixed(2));
    const recording: SongRecording = {
      id,
      songId: song.id,
      songTitle: song.title,
      songArtist: song.artist,
      title: fileNameOf(file),
      fileID: '',
      localBlobId: storedLocally ? id : undefined,
      fileName: file.name,
      mimeType: file.type || 'audio/mpeg',
      size: file.size,
      duration: seconds,
      clipStart: 0,
      clipEnd: seconds,
      pendingSync: true,
      createdAt: now,
      updatedAt: now,
    };
    commitWith((current) => [recording, ...current.filter((item) => item.id !== recording.id)]);
    setBusy('');

    // ② 画得出波形就直接进裁剪面板；画不出也不影响保存。
    if (!buffer) buffer = await decodeAudioBlob(file).catch(() => null);
    if (buffer) {
      bufferCacheRef.current = { id, buffer };
      const decodedBuffer = buffer;
      setTrimming(current => current ?? { recording, buffer: decodedBuffer });
    } else setMessage('已保存到本机；这段格式画不出波形，暂时不能精细裁剪，但可以直接播放。');

    // ③ 再异步上云；成功前这段录音一直是「仅在本机」，可随时手动重试。
    void syncRecording(id, recording);
  };

  const saveTrim = (clip: { start: number; end: number; cuts: AudioCut[]; gain?: RecordingGain; markers?: AudioMarker[] }) => {
    if (!trimming) return false;
    // 裁剪期间录音可能已经上传完成，必须并到最新那条记录上，避免把 fileID 冲掉。
    const latest = recordingsRef.current.find((item) => item.id === trimming.recording.id);
    if (!latest) return false;
    const clipEnd = Number(clip.end.toFixed(3));
    const legacyMarkers = latest.markers === undefined && clip.markers === undefined
      ? loadLegacyAudioMarkers(window.localStorage, session?.alias ?? '', latest.id, trimming.buffer.duration)
      : [];
    const markers = clip.markers ?? latest.markers ?? (legacyMarkers.length ? legacyMarkers : undefined);
    const updated: SongRecording = {
      ...latest,
      duration: Math.max(latest.duration, clipEnd, trimming.buffer.duration),
      clipStart: Number(clip.start.toFixed(3)),
      clipEnd,
      cuts: normalizeAudioCuts(clip.cuts, clip.start, clip.end),
      ...(clip.gain === undefined ? {} : { gain: clip.gain }),
      ...(markers === undefined ? {} : { markers }),
      pendingSync: true,
      updatedAt: new Date().toISOString(),
    };
    const savedLocally = commitWith((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    if (savedLocally) setMessage('已保存裁剪结果。');
    void syncRecording(updated.id);
    return savedLocally;
  };

  /**
   * 录音指数落在录音本身：本机立刻写入并缓存，再异步推给云端（云端没更新就先留在本机待同步）。
   * null 表示清空评分。
   */
  const rateRecording = useCallback((id: string, score: number | null) => {
    if (!sessionRef.current) return false;
    const latest = recordingsRef.current.find((item) => item.id === id);
    if (!latest || (isRecordingScore(latest.score) ? latest.score : null) === score) return false;
    const updated: SongRecording = {
      ...latest,
      // 清空时写成 undefined：落缓存时这个键会自然消失，云端按「送 0」处理成没评。
      score: score ?? undefined,
      pendingSync: true,
      updatedAt: new Date().toISOString(),
    };
    const savedLocally = commitWith((items) => items.map((item) => (item.id === id ? updated : item)));
    setMessage(score === null ? '已清空录音指数。' : `录音指数已记 ${score}。`);
    void syncRecording(id);
    return savedLocally;
  }, [commitWith, syncRecording]);

  const exportClip = async (recording: SongRecording) => {
    setBusy('正在导出裁剪片段…');
    try {
      const buffer = await loadBuffer(recording);
      const segments = resolveKeptSegments(recording.clipStart, recording.clipEnd, recording.cuts);
      if (!segments.length) { setMessage('没有可导出的片段，请检查删除段是否覆盖了全部内容。'); return; }
      const blob = encodeAudioClipToWav(buffer, segments, recording.gain);
      downloadBlob(blob, `${song.title} - ${recording.title}（裁剪）.wav`);
      setMessage(`已导出 WAV（${segments.length} 段拼接）；原文件仍完整保留。`);
    } catch (error) {
      setMessage(mapSongRecordingError(error));
    } finally {
      setBusy('');
    }
  };

  const remove = async (recording: SongRecording) => {
    if (!session || !canManage) return;
    if (!window.confirm(`确定删除「${recording.title}」这段录音吗？`)) return;
    stopPlayback();
    setBusy('正在删除…');
    syncingRef.current.delete(recording.id);
    try {
      await deleteCloudSongRecording(session, recording.id).catch(() => undefined);
      await deleteSongRecordingFile(recording.fileID);
      await deleteRecordingBlob(recording.localBlobId ?? recording.id);
      const cached = urlCacheRef.current.get(recording.id);
      if (cached) { URL.revokeObjectURL(cached); urlCacheRef.current.delete(recording.id); }
      commit(recordingsRef.current.filter((item) => item.id !== recording.id));
      setMessage('录音已删除。');
    } finally {
      setBusy('');
    }
  };

  const readPlaybackPosition = () => {
    const head = playhead.current;
    return head && head.id === selectedRecording?.id ? head.read?.() ?? head.position : 0;
  };

  useImperativeHandle(ref, () => ({
    upload,
    stopPlayback: () => stopPlayback(),
    toggleScorePlayback: async () => {
      if (playbackRequested.current) { stopPlayback(); return; }
      if (selectedRecording) {
        const position = readPlaybackPosition();
        const duration = playbackDuration(selectedParts);
        return playRecording(selectedRecording, position < duration - 1e-6 ? position : 0);
      }
    },
    readPlaybackPosition,
    seekPlayback: async (target) => {
      if (!selectedRecording || !Number.isFinite(target)) return;
      const duration = playbackDuration(selectedParts);
      const position = Math.min(Math.max(0, target), duration);
      if (playbackRequested.current && position < duration - 1e-6) {
        return playRecording(selectedRecording, position);
      }
      stopPlayback();
      playhead.current = { id: selectedRecording.id, position };
    },
    openTrimPicker: () => {
      if (trimming) { setTrimMinimized(false); return; }
      if (!songRecordings.length) { setMessage('请先上传一段录音，再进入裁剪。'); return; }
      if (songRecordings.length === 1) { void openTrim(songRecordings[0]); return; }
      setMessage('这首歌有多段录音，请在下方列表里选择要裁剪的那一段。');
      document.getElementById(`recording-list-${song.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  }), [songRecordings, session, canManage, trimming, selectedRecording, selectedParts]);

  if (!songRecordings.length && !busy && !message && !trimming) return null;

  // 批量补传包含「已上传音频、只差元数据」的那几条，和单条的「重试同步」保持同一口径。
  const pendingCount = songRecordings.filter((item) => item.pendingSync).length;

  return (
    <section id={`recording-list-${song.id}`} className="mt-5 rounded-2xl border border-orange-200/12 bg-orange-300/[.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic2 className="h-4 w-4 text-orange-200/80" />
          <h3 className="font-serif text-lg font-black text-white">录音</h3>
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-bold text-white/45">{songRecordings.length} 段</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 && canManage && (
            <button
              type="button"
              onClick={() => void syncPending()}
              disabled={syncingId !== null}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold text-amber-100 transition hover:border-amber-200/60 hover:text-amber-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${syncingId ? 'animate-spin' : ''}`} />
              同步 {pendingCount} 段到云端
            </button>
          )}
          {(busy || uploadProgress !== null) && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-100/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {uploadProgress !== null ? `同步中 ${uploadProgress}%` : busy}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {songRecordings.map((recording) => {
          const isPlaying = playingId === recording.id;
          const cuts = normalizeAudioCuts(recording.cuts, recording.clipStart, recording.clipEnd);
          const kept = keptDuration(recording.clipStart, recording.clipEnd, cuts);
          const trimmed = recording.clipStart > 0.01 || recording.clipEnd < recording.duration - 0.01 || cuts.length > 0;
          const scoreQuality = isRecordingScore(recording.score) ? getMatchQuality(recording.score) : null;
          return (
            <div key={recording.id} className="relative isolate rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => void openTrim(recording)}
                      title="打开波形裁剪"
                      className="block max-w-full text-left text-sm font-bold text-white after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-orange-100 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-orange-300"
                    >
                      <span className="block truncate">{recording.title}</span>
                    </button>
                  ) : (
                    <div className="truncate text-sm font-bold text-white">{recording.title}</div>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/40">
                    <span>{formatDuration(recording.duration)}</span>
                    <span className="text-white/15">·</span>
                    <span>{formatRecordingSize(recording.size)}</span>
                    {scoreQuality && (
                      <>
                        <span className="text-white/15">·</span>
                        <span className="inline-flex items-center gap-1" title={`录音指数 ${recording.score}（${scoreQuality.label}）`}>
                          <b className="font-mono text-[11px] font-black text-orange-200/85">{recording.score}</b>
                          <em className={`practice-quality ${scoreQuality.tone}`}>{scoreQuality.label}</em>
                          <span>录音指数</span>
                        </span>
                      </>
                    )}
                    {trimmed && (
                      <>
                        <span className="text-white/15">·</span>
                        <span className="text-orange-200/70">
                          保留 {formatDuration(kept, true)}
                          {cuts.length > 0 && ` · 删 ${cuts.length} 段`}
                        </span>
                      </>
                    )}
                    {recording.pendingSync && (
                      <>
                        <span className="text-white/15">·</span>
                        <span className="text-amber-200/70">{recording.fileID ? '云端待更新' : '仅在本机'}</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => void syncRecording(recording.id)}
                            disabled={syncingId === recording.id}
                            className="relative z-10 inline-flex items-center gap-1 text-amber-200/85 underline decoration-dotted underline-offset-2 transition hover:text-amber-100 disabled:opacity-50"
                          >
                            {syncingId === recording.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            {syncingId === recording.id ? '同步中' : '重试同步'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="relative z-10 flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void togglePlay(recording)} aria-label={isPlaying ? '停止播放' : '播放裁剪片段'} className={`grid h-8 w-8 place-items-center rounded-full transition ${isPlaying ? 'bg-emerald-300 text-black' : 'border border-white/10 text-white/65 hover:border-white/25 hover:text-white'}`}>
                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  {canManage && (
                    <>
                      <button type="button" onClick={() => void openTrim(recording)} aria-label="精细裁剪" title="精细裁剪" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/65 transition hover:border-orange-200/40 hover:text-orange-100">
                        <Scissors className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void exportClip(recording)} aria-label="导出裁剪片段" title="导出裁剪片段（WAV）" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/65 transition hover:border-white/25 hover:text-white">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void remove(recording)} aria-label="删除录音" title="删除录音" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/45 transition hover:border-red-300/40 hover:text-red-200">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {message && <p role="status" className="mt-2 text-xs leading-5 text-amber-200/85">{message}</p>}

      {trimming && (
        <AudioTrimDialog
          recordingTitle={trimming.recording.title}
          buffer={trimming.buffer}
          initialStart={trimming.recording.clipStart}
          initialEnd={trimming.recording.clipEnd}
          initialCuts={trimming.recording.cuts}
          initialGain={trimming.recording.gain}
          noteStorageKey={`jieyou-recording-note-v1:${JSON.stringify([session?.alias.trim().toLowerCase() ?? '', trimming.recording.id])}`}
          initialScore={trimming.recording.score}
          onScoreChange={score => rateRecording(trimming.recording.id, score)}
          onOpenRecordingBoard={onOpenRecordingBoard}
          initialMarkers={trimming.recording.markers ?? loadLegacyAudioMarkers(
            window.localStorage, session?.alias ?? '', trimming.recording.id, trimming.buffer.duration,
          )}
          minimized={trimMinimized}
          onMinimize={() => setTrimMinimized(true)}
          onCancel={() => setTrimming(null)}
          onSave={saveTrim}
        />
      )}
      {trimming && trimMinimized && createPortal(
        <button type="button" onClick={() => setTrimMinimized(false)} className="fixed bottom-5 right-5 z-[85] inline-flex h-11 items-center gap-2 rounded-full border border-orange-200/30 bg-[#211814] px-4 text-sm font-bold text-orange-100 shadow-lg hover:bg-[#33221a]">
          <Scissors aria-hidden="true" className="h-4 w-4" />返回录音
        </button>,
        document.body,
      )}
    </section>
  );
});

SongRecordings.displayName = 'SongRecordings';

export default SongRecordings;
