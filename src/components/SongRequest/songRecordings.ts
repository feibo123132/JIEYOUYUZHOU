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
  pendingSync?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const RECORDINGS_CACHE_PREFIX = 'jieyou-song-recordings-v1:';
/** 与云函数 SONG_RECORDING_MERGE_MAX_BYTES / SONG_RECORDING_MAX_BYTES 保持一致。 */
export const RECORDING_MAX_BYTES = 40 * 1024 * 1024;
export const RECORDING_MAX_CUTS = 30;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

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
    const clipStart = Math.max(0, Math.min(item.clipStart, item.duration));
    const clipEnd = Math.max(clipStart + 0.05, Math.min(item.clipEnd, item.duration));
    return {
      ...item,
      clipStart,
      clipEnd,
      cuts: normalizeAudioCuts(item.cuts, clipStart, clipEnd),
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
    storage.setItem(`${RECORDINGS_CACHE_PREFIX}${alias}`, JSON.stringify(recordings));
  } catch {
    // 缓存失败不影响云端权威数据。
  }
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
