import { normalizeAudioMarkers, type AudioMarker } from './audioMarkers.ts';
import { isRecordingGain, type RecordingGain } from './audioGain.ts';

export interface AudioCut {
  start: number;
  end: number;
}

export interface SongRecording {
  id: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  /** 用户给这段录音起的名字，默认用文件名。 */
  title: string;
  /** 云端 fileID（cloud://...）；为空表示只存在本机。 */
  fileID: string;
  /** 本机 IndexedDB 中的 Blob 键，用于离线/未部署云函数时仍可播放。 */
  localBlobId?: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** 音频总时长（秒） */
  duration: number;
  /** 保留区间起点（秒） */
  clipStart: number;
  /** 保留区间终点（秒） */
  clipEnd: number;
  /** 在保留区间内需要移除的片段（相对原音频时间轴）。 */
  cuts?: AudioCut[];
  /** 整段与选区增益。选区使用原音频时间，增益叠加。 */
  gain?: RecordingGain;
  /** 源音频坐标中的标记。空数组表示已移除全部标记，缺省表示旧录音。 */
  markers?: AudioMarker[];
  /** 录音指数：70–100 整数，与匹配 / 合唱 / 狂扫 / 板凳指数共用同一套刻度；缺省表示这段没评。 */
  score?: number;
  pendingSync?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const RECORDINGS_CACHE_PREFIX = 'jieyou-song-recordings-v1:';
/** 与云函数 SONG_RECORDING_MERGE_MAX_BYTES / SONG_RECORDING_MAX_BYTES 保持一致。 */
export const RECORDING_MAX_BYTES = 40 * 1024 * 1024;
export const RECORDING_MAX_CUTS = 30;
/**
 * 云端一个工作台最多存多少段录音（只算未删除的）。
 * 与云函数 SONG_RECORDING_LIMIT 保持一致：超过时云端会拒收（RECORDING_LIMIT_REACHED），
 * 这里提前拦一下，免得上传完 4MB 才失败。云端还有一道元数据体积闸（约 4MB），
 * 条数没到顶也可能因为标记太多被拒（RECORDING_STORAGE_FULL）。
 */
export const RECORDING_CLOUD_LIMIT = 2000;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 录音指数只认 70–100 的整数；云端用 0 表示「这段没评」。 */
export const RECORDING_SCORE_MIN = 70;
export const RECORDING_SCORE_MAX = 100;

export const isRecordingScore = (value: unknown): value is number => (
  Number.isInteger(value) && Number(value) >= RECORDING_SCORE_MIN && Number(value) <= RECORDING_SCORE_MAX
);

/** 把输入框里的内容收成 70–100 整数；越界、非整数或空值一律当作「没评」返回 null。 */
export const parseRecordingScoreInput = (value: string | number): number | null => {
  const number = typeof value === 'number' ? value : Number(value.trim());
  return isRecordingScore(number) ? number : null;
};

/** 排序并合并重叠的删除段，同时裁到 [start, end] 内。 */
export const normalizeAudioCuts = (cuts: AudioCut[] | undefined, start: number, end: number): AudioCut[] => {
  if (!Array.isArray(cuts) || !cuts.length) return [];
  const clamped = cuts
    .filter((cut) => cut && isFiniteNumber(cut.start) && isFiniteNumber(cut.end))
    .map((cut) => ({
      start: Math.max(start, Math.min(cut.start, cut.end)),
      end: Math.min(end, Math.max(cut.start, cut.end)),
    }))
    .filter((cut) => cut.end - cut.start > 0.01)
    .sort((left, right) => left.start - right.start);
  const merged: AudioCut[] = [];
  for (const cut of clamped) {
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end + 0.01) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  return merged;
};

/** 扣除删除段后真正会保留的区间列表。 */
export const resolveKeptSegments = (start: number, end: number, cuts: AudioCut[] | undefined): AudioCut[] => {
  const merged = normalizeAudioCuts(cuts, start, end);
  const segments: AudioCut[] = [];
  let cursor = start;
  for (const cut of merged) {
    if (cut.start > cursor + 0.01) segments.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < end - 0.01) segments.push({ start: cursor, end });
  return segments.filter((segment) => segment.end - segment.start > 0.01);
};

export const keptDuration = (start: number, end: number, cuts: AudioCut[] | undefined): number => (
  resolveKeptSegments(start, end, cuts).reduce((sum, segment) => sum + (segment.end - segment.start), 0)
);

export const isValidSongRecording = (value: unknown): value is SongRecording => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<SongRecording>;
  const cutsValid = item.cuts === undefined || (
    Array.isArray(item.cuts)
    && item.cuts.length <= RECORDING_MAX_CUTS
    && item.cuts.every((cut) => cut && isFiniteNumber(cut.start) && isFiniteNumber(cut.end)
      && cut.start >= 0 && cut.end > cut.start && cut.end <= item.duration! + 0.5)
  );
  return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 120
    && typeof item.songId === 'string' && item.songId.length > 0 && item.songId.length <= 100
    && typeof item.title === 'string' && item.title.length <= 160
    && typeof item.fileID === 'string' && item.fileID.length <= 600
    && typeof item.fileName === 'string' && item.fileName.length <= 260
    && typeof item.mimeType === 'string' && item.mimeType.length <= 120
    && isFiniteNumber(item.size) && item.size >= 0 && item.size <= RECORDING_MAX_BYTES
    && isFiniteNumber(item.duration) && item.duration > 0
    && isFiniteNumber(item.clipStart) && item.clipStart >= 0
    && isFiniteNumber(item.clipEnd) && item.clipEnd > item.clipStart
    && cutsValid
    && typeof item.createdAt === 'string'
    && typeof item.updatedAt === 'string';
};

export const parseSongRecordings = (value: unknown): SongRecording[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidSongRecording).map((item) => {
    const { markers, gain, score, ...recording } = item;
    const clipStart = Math.max(0, Math.min(item.clipStart, item.duration));
    const clipEnd = Math.max(clipStart + 0.05, Math.min(item.clipEnd, item.duration));
    return {
      ...recording,
      clipStart,
      clipEnd,
      score: isRecordingScore(score) ? score : undefined,
      cuts: normalizeAudioCuts(item.cuts, clipStart, clipEnd),
      ...(isRecordingGain(gain, item.duration) ? { gain } : {}),
      ...(Array.isArray(markers) ? { markers: normalizeAudioMarkers(markers, item.duration) } : {}),
    };
  });
};

export const loadRecordingCache = (storage: { getItem: (key: string) => string | null }, alias: string | null): SongRecording[] => {
  if (!alias) return [];
  try {
    return parseSongRecordings(JSON.parse(storage.getItem(`${RECORDINGS_CACHE_PREFIX}${alias}`) ?? '[]'));
  } catch {
    return [];
  }
};

export const saveRecordingCache = (storage: { setItem: (key: string, value: string) => void }, alias: string, recordings: SongRecording[]) => {
  try {
    storage.setItem(`${RECORDINGS_CACHE_PREFIX}${alias}`, JSON.stringify(trimRecordingCache(recordings)));
    return true;
  } catch {
    // 缓存失败不影响云端权威数据。
    return false;
  }
};

/**
 * localStorage 里最多缓存多少段录音。
 * 云端才是权威数据，缓存太大在接近 2000 段时会撞上浏览器 5MB 配额（Chrome 按 UTF-16 计字节），
 * 所以只留最近的一批 + 全部「还没同步」的；更早的靠 pullCloudSongRecordings 拉回来。
 */
export const RECORDING_CACHE_LIMIT = 400;

/** 按「未同步优先、其余取最新」裁剪缓存，保证待补传的录音一条都不会被挤掉。 */
export const trimRecordingCache = (recordings: SongRecording[]): SongRecording[] => {
  if (recordings.length <= RECORDING_CACHE_LIMIT) return recordings;
  const pending = recordings.filter((item) => item.pendingSync);
  const synced = recordings
    .filter((item) => !item.pendingSync)
    .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
  return [...pending, ...synced].slice(0, Math.max(RECORDING_CACHE_LIMIT, pending.length));
};

/* ------------------------------------------------------------------ */
/* 录音榜：把本机缓存与云端列表并成一份，再按歌汇总录音指数。            */
/* ------------------------------------------------------------------ */

/**
 * 本机缓存与云端列表按 id 合并，较新的 updatedAt 胜出。
 * 本机刚评的分 / 刚裁的片段还没同步上云时，不会被云端的旧数据盖掉。
 */
export const mergeSongRecordings = (local: SongRecording[], remote: SongRecording[]): SongRecording[] => {
  const byId = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) {
      byId.set(item.id, { ...existing, ...item, localBlobId: existing?.localBlobId });
    }
  }
  return [...byId.values()];
};

/** 每首歌取所有录音里最高的录音指数（同一套 70–100 刻度），count 为已评过的段数。 */
/**
 * 录音榜口径：一首歌可能有很多段录音，榜上只占一行，按「最高的一段」排名，
 * 同时把每段的分都带上（降序），方便悬停看到这首歌到底评了几段、各是多少。
 */
export const collectRecordingScores = (
  recordings: SongRecording[],
): Map<string, { score: number; count: number; scores: number[] }> => {
  const map = new Map<string, { score: number; count: number; scores: number[] }>();
  for (const recording of recordings) {
    if (!isRecordingScore(recording.score)) continue;
    const current = map.get(recording.songId);
    const scores = [...(current?.scores ?? []), recording.score].sort((left, right) => right - left);
    map.set(recording.songId, { score: scores[0], count: scores.length, scores });
  }
  return map;
};

/* ------------------------------------------------------------------ */
/* IndexedDB：本机保存原始音频 Blob，保证未上云时也能播放和重新裁剪。      */
/* ------------------------------------------------------------------ */

const DB_NAME = 'jieyou-song-recordings';
const DB_VERSION = 1;
const BLOB_STORE = 'files';

const openDatabase = (): Promise<IDBDatabase | null> => new Promise((resolve) => {
  if (typeof indexedDB === 'undefined') {
    resolve(null);
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(BLOB_STORE)) database.createObjectStore(BLOB_STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(BLOB_STORE, mode);
      const request = run(transaction.objectStore(BLOB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    } catch {
      database.close();
      resolve(null);
    }
  });
};

export const putRecordingBlob = async (id: string, blob: Blob): Promise<boolean> => {
  const result = await withStore<IDBValidKey>('readwrite', (store) => store.put(blob, id));
  return result !== null;
};

export const getRecordingBlob = async (id: string): Promise<Blob | null> => {
  const result = await withStore<unknown>('readonly', (store) => store.get(id));
  return result instanceof Blob ? result : null;
};

export const deleteRecordingBlob = async (id: string): Promise<void> => {
  await withStore<undefined>('readwrite', (store) => store.delete(id));
};
