import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Mic2, Pause, Play, RefreshCw, Scissors, Trash2 } from 'lucide-react';
import type { Song } from './songCatalog';
import type { SongRecordSession } from './songRecords';
import {
  deleteRecordingBlob, getRecordingBlob, keptDuration, loadRecordingCache, normalizeAudioCuts,
  parseSongRecordings, putRecordingBlob, RECORDING_MAX_BYTES, resolveKeptSegments, saveRecordingCache,
  type AudioCut, type SongRecording,
} from './songRecordings';
import {
  deleteCloudSongRecording, deleteSongRecordingFile, mapSongRecordingError, pullCloudSongRecordings,
  readSongRecordingBlob, resolveSongRecordingUrl, saveCloudSongRecording, uploadSongRecordingFile,
} from './songRequestCloud';
import { decodeAudioBlob, downloadBlob, encodeAudioClipToWav, formatDuration, formatFileSize as formatRecordingSize, getAudioContext } from './audioClipping';
import AudioTrimDialog from './AudioTrimDialog';

export interface SongRecordingsHandle {
  upload: (file: File) => Promise<void>;
  openTrimPicker: () => void;
}

interface SongRecordingsProps {
  song: Song;
  session: SongRecordSession | null;
  canManage: boolean;
  onCountChange?: (count: number) => void;
}

const fileNameOf = (file: File) => file.name.replace(/\.[^.]+$/, '').trim() || '录音';

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

const SongRecordings = forwardRef<SongRecordingsHandle, SongRecordingsProps>(({ song, session, canManage, onCountChange }, ref) => {
  const [recordings, setRecordings] = useState<SongRecording[]>(() => loadRecordingCache(window.localStorage, session?.alias ?? null));
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [trimming, setTrimming] = useState<{ recording: SongRecording; buffer: AudioBuffer } | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 解码后的音频只留最近一条：播放和裁剪共用，省掉重复解码。 */
  const bufferCacheRef = useRef<{ id: string; buffer: AudioBuffer } | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
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

  useEffect(() => { onCountChange?.(songRecordings.length); }, [onCountChange, songRecordings.length]);

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
    if (session) saveRecordingCache(window.localStorage, session.alias, next);
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
      const latest = recordingsRef.current.find((item) => item.id === id) ?? local;
      const payload: SongRecording = { ...latest, fileID, pendingSync: false };
      const remote = parseSongRecordings([await saveCloudSongRecording(credentials, payload)])[0];
      const synced: SongRecording = remote ? { ...remote, localBlobId: latest.localBlobId } : payload;
      commitWith((items) => items.map((item) => (item.id === id ? synced : item)));
      setMessage('录音已同步到云端，换设备也能听到。');
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
    const targets = recordingsRef.current.filter((item) => item.pendingSync && !item.fileID);
    if (!targets.length) return;
    for (const item of targets) await syncRecording(item.id);
  };

  // 进入页面补传一次：上次没传成功的录音（关掉了页面、断网、云函数刚部署）自动续上。
  useEffect(() => {
    const alias = session?.alias;
    if (!alias || autoSyncRef.current === alias) return;
    autoSyncRef.current = alias;
    const pending = recordingsRef.current.filter((item) => item.pendingSync && !item.fileID);
    if (!pending.length) return;
    void (async () => {
      for (const item of pending) await syncRecording(item.id);
    })();
  }, [session?.alias, syncRecording]);

  useEffect(() => () => {
    for (const source of sourcesRef.current) { try { source.onended = null; source.stop(); } catch { /* 已停止 */ } }
    sourcesRef.current = [];
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    for (const url of urlCacheRef.current.values()) URL.revokeObjectURL(url);
    urlCacheRef.current.clear();
  }, []);

  const stopPlayback = () => {
    for (const source of sourcesRef.current) {
      try { source.onended = null; source.stop(); } catch { /* 已停止 */ }
    }
    sourcesRef.current = [];
    const audio = audioRef.current;
    if (audio) { audio.pause(); try { audio.currentTime = 0; } catch { /* ignore */ } }
    setPlayingId(null);
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
   * 兜底播放：解码失败（超大文件 / 特殊编码）时交给 <audio>。
   * 跳段精度受 timeupdate（约 250ms）限制，所以只当备用。
   */
  const playFromElement = async (recording: SongRecording) => {
    const url = await playableUrl(recording);
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    const cuts = normalizeAudioCuts(recording.cuts, recording.clipStart, recording.clipEnd);
    audio.ontimeupdate = () => {
      const time = audio.currentTime;
      const cut = cuts.find((item) => time >= item.start && time < item.end);
      if (cut) {
        if (cut.end >= recording.clipEnd - 0.02) { audio.pause(); setPlayingId(null); return; }
        try { audio.currentTime = cut.end; } catch { /* ignore */ }
        return;
      }
      if (time >= recording.clipEnd) { audio.pause(); setPlayingId(null); }
    };
    audio.currentTime = recording.clipStart;
    await audio.play();
    setPlayingId(recording.id);
  };

  /**
   * 播放裁剪结果：直接把保留段排进 AudioBufferSourceNode。
   * 删除段在调度阶段就被跳过（采样级精确、无 timeupdate 的 250ms 滞后），
   * 所以「删掉中间一小段」听上去是真的一剪就没。
   */
  const togglePlay = async (recording: SongRecording) => {
    if (playingId === recording.id) { stopPlayback(); return; }
    stopPlayback();

    let buffer = bufferCacheRef.current?.id === recording.id ? bufferCacheRef.current.buffer : null;
    if (!buffer) {
      setBusy('正在加载音频…');
      buffer = await loadBuffer(recording).catch(() => null);
      setBusy('');
    }
    if (!buffer) {
      try { await playFromElement(recording); } catch { setMessage('这段录音暂时无法播放，请重新上传。'); }
      return;
    }
    bufferCacheRef.current = { id: recording.id, buffer };

    const parts = resolveKeptSegments(recording.clipStart, recording.clipEnd, recording.cuts);
    if (!parts.length) { setMessage('删除段覆盖了全部内容，没有可播放的部分。'); return; }

    try {
      const context = getAudioContext();
      await context.resume();
      const startedAt = context.currentTime + 0.03;
      let cursor = startedAt;
      const sources: AudioBufferSourceNode[] = [];
      for (const part of parts) {
        const duration = part.end - part.start;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(cursor, part.start, duration);
        cursor += duration;
        sources.push(source);
      }
      const last = sources[sources.length - 1];
      if (last) last.onended = () => { sourcesRef.current = []; setPlayingId(null); };
      sourcesRef.current = sources;
      setPlayingId(recording.id);
    } catch {
      setMessage('这段录音暂时无法播放，请重新上传。');
    }
  };

  const loadBuffer = async (recording: SongRecording): Promise<AudioBuffer> => {
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
  };

  const openTrim = async (recording: SongRecording) => {
    stopPlayback();
    setMessage('');
    try {
      // 刚播放过就直接复用已解码的缓冲，弹窗打开瞬间出波形。
      const cached = bufferCacheRef.current?.id === recording.id ? bufferCacheRef.current.buffer : null;
      if (cached) { setTrimming({ recording, buffer: cached }); return; }
      setBusy('正在读取音频波形…');
      const buffer = await loadBuffer(recording);
      bufferCacheRef.current = { id: recording.id, buffer };
      setTrimming({ recording, buffer });
    } catch (error) {
      setMessage(mapSongRecordingError(error));
    } finally {
      setBusy('');
    }
  };

  const upload = async (file: File) => {
    if (!session || !canManage) { setMessage('只有登录后的站主可以上传录音。'); return; }
    if (file.size > RECORDING_MAX_BYTES) { setMessage(`录音超过 ${formatRecordingSize(RECORDING_MAX_BYTES)} 上限，请先压缩或剪短。`); return; }
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
      setTrimming({ recording, buffer });
    } else setMessage('已保存到本机；这段格式画不出波形，暂时不能精细裁剪，但可以直接播放。');

    // ③ 再异步上云；成功前这段录音一直是「仅在本机」，可随时手动重试。
    void syncRecording(id, recording);
  };

  /** 后台把裁剪区间写回云端；失败只标记待同步，不回滚本地结果。 */
  const pushTrimToCloud = async (updated: SongRecording) => {
    const credentials = sessionRef.current;
    if (!credentials || !updated.fileID) return;
    const apply = (pendingSync: boolean) => commitWith((items) => items.map((item) => (
      // 期间又改过一次的话，以新的那条为准。
      item.id === updated.id && item.updatedAt === updated.updatedAt ? { ...item, pendingSync } : item
    )));
    try {
      await saveCloudSongRecording(credentials, { ...updated, pendingSync: false });
      apply(false);
      setMessage('裁剪已保存，并同步到云端。');
    } catch {
      apply(true);
      setMessage('裁剪已保存在本机，云端同步失败（可点「重试同步」）。');
    }
  };

  const saveTrim = (clip: { start: number; end: number; cuts: AudioCut[] }) => {
    if (!trimming) return;
    // 裁剪期间录音可能已经上传完成，必须并到最新那条记录上，避免把 fileID 冲掉。
    const latest = recordingsRef.current.find((item) => item.id === trimming.recording.id) ?? trimming.recording;
    const updated: SongRecording = {
      ...latest,
      clipStart: Number(clip.start.toFixed(2)),
      clipEnd: Number(clip.end.toFixed(2)),
      cuts: normalizeAudioCuts(clip.cuts, clip.start, clip.end),
      updatedAt: new Date().toISOString(),
    };
    // 本地立刻生效并关窗：裁剪只是改一段索引，不该等网络往返。
    commitWith((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setTrimming(null);
    setMessage('已保存裁剪结果。');
    // 已经在云端的只补元数据；还只在本机的连音频一起传，保证别的设备也能看到这次裁剪。
    if (updated.fileID) void pushTrimToCloud(updated);
    else void syncRecording(updated.id);
  };

  const exportClip = async (recording: SongRecording) => {
    setBusy('正在导出裁剪片段…');
    try {
      const buffer = await loadBuffer(recording);
      const segments = resolveKeptSegments(recording.clipStart, recording.clipEnd, recording.cuts);
      if (!segments.length) { setMessage('没有可导出的片段，请检查删除段是否覆盖了全部内容。'); return; }
      const blob = encodeAudioClipToWav(buffer, segments);
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

  useImperativeHandle(ref, () => ({
    upload,
    openTrimPicker: () => {
      if (!songRecordings.length) { setMessage('请先上传一段录音，再进入裁剪。'); return; }
      if (songRecordings.length === 1) { void openTrim(songRecordings[0]); return; }
      setMessage('这首歌有多段录音，请在下方列表里选择要裁剪的那一段。');
      document.getElementById(`recording-list-${song.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  }), [songRecordings, session, canManage]);

  if (!songRecordings.length && !busy && !message) return null;

  const pendingCount = songRecordings.filter((item) => item.pendingSync && !item.fileID).length;

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
          return (
            <div key={recording.id} className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">{recording.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/40">
                    <span>{formatDuration(recording.duration)}</span>
                    <span className="text-white/15">·</span>
                    <span>{formatRecordingSize(recording.size)}</span>
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
                            className="inline-flex items-center gap-1 text-amber-200/85 underline decoration-dotted underline-offset-2 transition hover:text-amber-100 disabled:opacity-50"
                          >
                            {syncingId === recording.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            {syncingId === recording.id ? '同步中' : '重试同步'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
          songTitle={song.title}
          recordingTitle={trimming.recording.title}
          buffer={trimming.buffer}
          initialStart={trimming.recording.clipStart}
          initialEnd={trimming.recording.clipEnd}
          initialCuts={trimming.recording.cuts}
          onCancel={() => setTrimming(null)}
          onSave={saveTrim}
        />
      )}
    </section>
  );
});

SongRecordings.displayName = 'SongRecordings';

export default SongRecordings;
