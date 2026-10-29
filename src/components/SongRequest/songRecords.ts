import type { Song } from './songCatalog.ts';
import { ROADSHOW_SESSION_KEY } from './roadshow.ts';

export const SONG_REQUEST_SESSION_EVENT = 'jieyou-song-request-session-change';

export interface SongRecordSession {
  alias: string;
  password: string;
}

interface SongRecordBase {
  id: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  occurredAt: string;
  updatedAt: string;
}

export interface PracticeRecord extends SongRecordBase {
  kind: 'practice';
  matchScore: number;
  feelings: string;
  problems: string;
  improvements: string;
  needsMorePractice: boolean;
  needsImprovement: boolean;
  singingMoods?: Array<'快乐' | '感动' | '想哭' | '爽歌' | '舒服' | '欢快' | '音色' | '歌词' | '爆款'>;
  /** 合唱指数：70–100 整数，与匹配度同一套刻度；缺省表示这次没评。 */
  chorusScore?: number;
  /** 狂扫指数：70–100 整数，与匹配度同一套刻度；缺省表示这次没评。 */
  strumScore?: number;
  /** 狂扫速度 BPM：20–300 整数，跟狂扫指数一起填，缺省表示没记。 */
  strumBpm?: number;
  /** @deprecated 历史字段「合唱星级」（0–5）。读取时会换算成 chorusScore，新记录不再写入。 */
  chorusStars?: number;
  /** @deprecated 历史字段，仅用于兼容旧记录读取，新记录不再写入。 */
  femaleKey?: string;
}

export interface SongRoadshowRecord extends SongRecordBase {
  kind: 'roadshow';
  audienceName: string;
  feedback: string;
}

export type SongRecord = PracticeRecord | SongRoadshowRecord;

export interface PublicPracticeRankingItem {
  songId: string;
  songTitle: string;
  songArtist: string;
  score: number;
  /** 合唱指数 70–100；null 表示没评过。 */
  chorusScore: number | null;
  /** 狂扫指数 70–100；null 表示没评过。 */
  strumScore: number | null;
  /** 狂扫速度 BPM；null 表示没记。 */
  strumBpm: number | null;
}

interface ReadableStorage { getItem: (key: string) => string | null; }
interface WritableStorage { setItem: (key: string, value: string) => void; }
interface RemovableStorage { removeItem: (key: string) => void; }

const CACHE_PREFIX = 'jieyou-song-records-v1:';
/** 狂扫速度的可填范围，超出视为误填。 */
export const STRUM_BPM_MIN = 20;
export const STRUM_BPM_MAX = 300;
const isText = (value: unknown, max: number, required = true) => (
  typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim()))
);
const isIsoTime = (value: unknown) => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));

export const isValidSongRecord = (value: unknown): value is SongRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<SongRecord> & Record<string, unknown>;
  const commonValid = isText(record.id, 100)
    && isText(record.songId, 100)
    && isText(record.songTitle, 100)
    && isText(record.songArtist, 100, false)
    && isIsoTime(record.occurredAt)
    && isIsoTime(record.updatedAt);
  if (!commonValid) return false;
  if (record.kind === 'practice') {
    return Number.isInteger(record.matchScore) && Number(record.matchScore) >= 70 && Number(record.matchScore) <= 100
      && isText(record.feelings, 2000, false) && isText(record.problems, 2000, false) && isText(record.improvements, 2000, false)
      && (record.needsMorePractice === undefined || typeof record.needsMorePractice === 'boolean')
      && (record.needsImprovement === undefined || typeof record.needsImprovement === 'boolean')
      && (record.femaleKey === undefined || isText(record.femaleKey, 80, false))
      && (record.chorusScore === undefined || (Number.isInteger(record.chorusScore) && Number(record.chorusScore) >= 70 && Number(record.chorusScore) <= 100))
      && (record.strumScore === undefined || (Number.isInteger(record.strumScore) && Number(record.strumScore) >= 70 && Number(record.strumScore) <= 100))
      && (record.strumBpm === undefined || (Number.isInteger(record.strumBpm) && Number(record.strumBpm) >= STRUM_BPM_MIN && Number(record.strumBpm) <= STRUM_BPM_MAX))
      && (record.chorusStars === undefined || (Number.isInteger(record.chorusStars) && Number(record.chorusStars) >= 0 && Number(record.chorusStars) <= 5))
      && (record.singingMoods === undefined || (Array.isArray(record.singingMoods) && record.singingMoods.length <= 9 && record.singingMoods.every((mood) => ['快乐', '感动', '想哭', '爽歌', '舒服', '欢快', '音色', '歌词', '爆款'].includes(mood))));
  }
  return record.kind === 'roadshow'
    && isText(record.audienceName, 100, false)
    && isText(record.feedback, 4000);
};

export const sortSongRecords = (records: SongRecord[]) => [...records]
  .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.updatedAt.localeCompare(left.updatedAt));

export const averageMatchScore = (records: Array<Pick<PracticeRecord, 'matchScore'>>): number | null => {
  if (!records.length) return null;
  const average = records.reduce((sum, record) => sum + record.matchScore, 0) / records.length;
  return Math.round(average * 10) / 10;
};

// 取多次练习中的最高匹配分（整数）。matchScore 本身是 70–100 整数，所以无需小数。
export const bestMatchScore = (records: Array<Pick<PracticeRecord, 'matchScore'>>): number | null => {
  if (!records.length) return null;
  return records.reduce((top, record) => record.matchScore > top ? record.matchScore : top, records[0].matchScore);
};

export const parseMatchScoreInput = (value: string): number | '' => value === '' ? '' : Number(value);

// 旧版「合唱星级」(1–5) 等分映射到 70–100：1★=76、2★=82、3★=88、4★=94、5★=100。
export const chorusStarsToScore = (stars: unknown): number | null => (
  Number.isInteger(stars) && Number(stars) >= 1 && Number(stars) <= 5
    ? 70 + Math.round((Number(stars) / 5) * 30)
    : null
);

/** 单条记录的合唱指数：优先新字段，旧记录按星级换算。 */
const recordChorusScore = (record: Pick<PracticeRecord, 'chorusScore' | 'chorusStars'>): number | null => {
  if (Number.isInteger(record.chorusScore) && Number(record.chorusScore) >= 70 && Number(record.chorusScore) <= 100) {
    return Number(record.chorusScore);
  }
  return chorusStarsToScore(record.chorusStars);
};

// 取多次练习中的最高合唱指数，没评过的记录不参与比较。
export const bestChorusScore = (records: Array<Pick<PracticeRecord, 'chorusScore' | 'chorusStars'>>): number | null => {
  let top: number | null = null;
  for (const record of records) {
    const score = recordChorusScore(record);
    if (score !== null && (top === null || score > top)) top = score;
  }
  return top;
};

/** 单条记录的狂扫指数：只认合法的 70–100 整数，没评就是 null。 */
const recordStrumScore = (record: Pick<PracticeRecord, 'strumScore'>): number | null => (
  Number.isInteger(record.strumScore) && Number(record.strumScore) >= 70 && Number(record.strumScore) <= 100
    ? Number(record.strumScore)
    : null
);

// 取多次练习中的最高狂扫指数，没评过的记录不参与比较。
export const bestStrumScore = (records: Array<Pick<PracticeRecord, 'strumScore'>>): number | null => {
  let top: number | null = null;
  for (const record of records) {
    const score = recordStrumScore(record);
    if (score !== null && (top === null || score > top)) top = score;
  }
  return top;
};

/**
 * 狂扫速度跟着「最高分那次」走：取狂扫指数最高的那条记录的 BPM，同分取更晚的一次。
 * 这样榜单上的指数和 BPM 永远来自同一次练习，不会拼出「A 的分 + B 的速度」。
 */
export const bestStrumBpm = (
  records: Array<Pick<PracticeRecord, 'strumScore' | 'strumBpm' | 'occurredAt'>>,
): number | null => {
  let best: { score: number; occurredAt: string; bpm: number } | null = null;
  for (const record of records) {
    const score = recordStrumScore(record);
    const bpm = Number(record.strumBpm);
    if (score === null || !Number.isInteger(bpm) || bpm < STRUM_BPM_MIN || bpm > STRUM_BPM_MAX) continue;
    if (!best || score > best.score || (score === best.score && record.occurredAt > best.occurredAt)) {
      best = { score, occurredAt: record.occurredAt, bpm };
    }
  }
  return best ? best.bpm : null;
};

export type MatchQuality = {
  label: '普通' | '优秀' | '精良' | '稀有' | '传奇';
  tone: 'white' | 'green' | 'lightBlue' | 'darkBlue' | 'purple' | 'gold';
};

/** 匹配度与合唱指数共用同一套 70–100 品质分档。 */
export const getMatchQuality = (score: number): MatchQuality | null => {
  if (!Number.isInteger(score) || score < 70 || score > 100) return null;
  if (score >= 96) return { label: '传奇', tone: 'gold' };
  if (score >= 90) return { label: '稀有', tone: 'purple' };
  if (score >= 85) return { label: '精良', tone: 'darkBlue' };
  if (score >= 80) return { label: '精良', tone: 'lightBlue' };
  if (score >= 75) return { label: '优秀', tone: 'green' };
  return { label: '普通', tone: 'white' };
};

export interface PracticeDayGroup {
  key: string;
  count: number;
  averageScore: number | null;
  records: PracticeRecord[];
}

export interface PracticeWeekGroup { key: string; days: PracticeDayGroup[]; }
export interface PracticeMonthGroup { key: string; weeks: PracticeWeekGroup[]; }

export const localDateKey = (value: string | Date): string => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const weekStartKey = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return localDateKey(date);
};

export const groupPracticeRecordsByCalendar = (records: SongRecord[]): PracticeMonthGroup[] => {
  const months = new Map<string, Map<string, Map<string, PracticeRecord[]>>>();
  for (const record of records) {
    if (record.kind !== 'practice') continue;
    const dayKey = localDateKey(record.occurredAt);
    const monthKey = dayKey.slice(0, 7);
    const weekKey = weekStartKey(dayKey);
    const weeks = months.get(monthKey) ?? new Map<string, Map<string, PracticeRecord[]>>();
    const days = weeks.get(weekKey) ?? new Map<string, PracticeRecord[]>();
    days.set(dayKey, [...(days.get(dayKey) ?? []), record]);
    weeks.set(weekKey, days);
    months.set(monthKey, weeks);
  }
  return [...months.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([key, weeks]) => ({
    key,
    weeks: [...weeks.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([weekKey, days]) => ({
      key: weekKey,
      days: [...days.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([dayKey, dayRecords]) => {
        const sorted = sortSongRecords(dayRecords) as PracticeRecord[];
        return { key: dayKey, count: sorted.length, averageScore: bestMatchScore(sorted), records: sorted };
      }),
    })),
  }));
};

export const rankSongsByPracticeMatch = (songs: Song[], records: SongRecord[]) => {
  const practicesBySong = new Map<string, PracticeRecord[]>();
  for (const record of records) {
    if (record.kind !== 'practice') continue;
    practicesBySong.set(record.songId, [...(practicesBySong.get(record.songId) ?? []), record]);
  }
  return songs.map((song, catalogIndex) => {
    const practices = practicesBySong.get(song.id) ?? [];
    return {
      song,
      score: bestMatchScore(practices),
      practiceCount: practices.length,
      chorusScore: bestChorusScore(practices),
      strumScore: bestStrumScore(practices),
      strumBpm: bestStrumBpm(practices),
      catalogIndex,
    };
  }).filter((item): item is typeof item & { score: number } => item.score !== null)
    .sort((left, right) => right.score - left.score || left.catalogIndex - right.catalogIndex)
    .map(({ song, score, practiceCount, chorusScore, strumScore, strumBpm }) => ({ song, score, practiceCount, chorusScore, strumScore, strumBpm }));
};

export const parsePublicPracticeRanking = (value: unknown): PublicPracticeRankingItem[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (!isText(entry.songId, 100) || !isText(entry.songTitle, 100)
      || !isText(entry.songArtist, 100, false) || typeof entry.score !== 'number'
      || !Number.isFinite(entry.score) || entry.score < 70 || entry.score > 100) return [];
    return [{
      songId: String(entry.songId).trim(),
      songTitle: String(entry.songTitle).trim(),
      songArtist: String(entry.songArtist).trim(),
      score: Math.round(entry.score * 10) / 10,
      // 新版云端返回 chorusScore / strumScore；旧部署仍返回 stars，这里一并兼容。
      chorusScore: Number.isInteger(entry.chorusScore) && Number(entry.chorusScore) >= 70 && Number(entry.chorusScore) <= 100
        ? Number(entry.chorusScore)
        : chorusStarsToScore(entry.stars),
      strumScore: Number.isInteger(entry.strumScore) && Number(entry.strumScore) >= 70 && Number(entry.strumScore) <= 100
        ? Number(entry.strumScore)
        : null,
      strumBpm: Number.isInteger(entry.strumBpm) && Number(entry.strumBpm) >= STRUM_BPM_MIN && Number(entry.strumBpm) <= STRUM_BPM_MAX
        ? Number(entry.strumBpm)
        : null,
    }];
  });
};

export const getPracticeReflection = (record: Pick<PracticeRecord, 'problems' | 'improvements'>): string => (
  [record.problems.trim(), record.improvements.trim()].filter(Boolean).join('\n')
);

const cleanSongRecord = (record: SongRecord): SongRecord => {
  const base = {
    id: record.id,
    songId: record.songId,
    songTitle: record.songTitle,
    songArtist: record.songArtist,
    occurredAt: record.occurredAt,
    updatedAt: record.updatedAt,
  };
  if (record.kind !== 'practice') {
    return {
      ...base,
      kind: 'roadshow',
      audienceName: record.audienceName,
      feedback: record.feedback,
    };
  }
  // 旧记录的星级在这里就地换算成合唱指数，之后全链路只认 chorusScore。
  const chorusScore = recordChorusScore(record);
  return {
    ...base,
    kind: 'practice',
    matchScore: record.matchScore,
    feelings: record.feelings,
    problems: record.problems,
    improvements: record.improvements,
    needsMorePractice: Boolean(record.needsMorePractice),
    needsImprovement: Boolean(record.needsImprovement),
    singingMoods: normalizeSingingMoods(record.singingMoods ?? []),
    ...(chorusScore !== null ? { chorusScore } : {}),
    ...(recordStrumScore(record) !== null ? { strumScore: recordStrumScore(record) as number } : {}),
    ...(Number.isInteger(record.strumBpm) && Number(record.strumBpm) >= STRUM_BPM_MIN && Number(record.strumBpm) <= STRUM_BPM_MAX
      ? { strumBpm: Number(record.strumBpm) } : {}),
    ...(record.femaleKey?.trim() ? { femaleKey: record.femaleKey.trim() } : {}),
  };
};

export const parseSongRecords = (value: unknown): SongRecord[] => (
  Array.isArray(value) ? sortSongRecords(value.filter(isValidSongRecord).map(cleanSongRecord)) : []
);

export const normalizeSongRecordAlias = (alias: string) => alias.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export const readSongRecordSession = (storage: ReadableStorage): SongRecordSession | null => {
  try {
    const value = JSON.parse(storage.getItem(ROADSHOW_SESSION_KEY) || 'null') as Partial<SongRecordSession> | null;
    if (!value || typeof value.alias !== 'string' || !value.alias.trim()
      || typeof value.password !== 'string' || value.password.length < 6 || value.password.length > 64) return null;
    return { alias: value.alias.trim(), password: value.password };
  } catch {
    return null;
  }
};

const serializeSongRecordSession = (session: SongRecordSession) => JSON.stringify({
  alias: session.alias.trim(),
  password: session.password,
});

export const saveBrowserSongRecordSession = (session: SongRecordSession) => {
  if (typeof window === 'undefined') return;
  const serialized = serializeSongRecordSession(session);
  try { window.sessionStorage.setItem(ROADSHOW_SESSION_KEY, serialized); } catch {}
  try { window.localStorage.setItem(ROADSHOW_SESSION_KEY, serialized); } catch {}
};

export const readBrowserSongRecordSession = (): SongRecordSession | null => {
  if (typeof window === 'undefined') return null;
  const current = readSongRecordSession(window.sessionStorage);
  if (current) return current;
  const remembered = readSongRecordSession(window.localStorage);
  if (remembered) {
    try { window.sessionStorage.setItem(ROADSHOW_SESSION_KEY, serializeSongRecordSession(remembered)); } catch {}
  }
  return remembered;
};

export const clearBrowserSongRecordSession = () => {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(ROADSHOW_SESSION_KEY); } catch {}
  try { window.localStorage.removeItem(ROADSHOW_SESSION_KEY); } catch {}
};

export const songRecordCacheKey = (alias: string) => `${CACHE_PREFIX}${encodeURIComponent(normalizeSongRecordAlias(alias))}`;

export const loadSongRecordCache = (storage: ReadableStorage, session: SongRecordSession | null): SongRecord[] => {
  if (!session?.alias || !session.password) return [];
  try {
    const raw = storage.getItem(songRecordCacheKey(session.alias));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: unknown; records?: unknown };
    return parsed.version === 1 ? parseSongRecords(parsed.records) : [];
  } catch {
    return [];
  }
};

export const saveSongRecordCache = (storage: WritableStorage, alias: string, records: SongRecord[]) => {
  storage.setItem(songRecordCacheKey(alias), JSON.stringify({ version: 1, records: parseSongRecords(records) }));
};

export const clearSongRecordCache = (storage: RemovableStorage, alias: string) => {
  storage.removeItem(songRecordCacheKey(alias));
};

export const recoverSongsFromRecords = (records: SongRecord[], knownSongs: Song[]): Song[] => {
  const knownIds = new Set(knownSongs.map((song) => song.id));
  const recovered = new Map<string, Song>();
  for (const record of records) {
    if (knownIds.has(record.songId) || recovered.has(record.songId)) continue;
    recovered.set(record.songId, {
      id: record.songId,
      title: record.songTitle,
      artist: record.songArtist,
      category: '私有自定义',
      featured: false,
    });
  }
  return [...recovered.values()];
};

export const normalizeSingingMoods = (moods: NonNullable<PracticeRecord['singingMoods']>) => [...new Set(moods.map(mood => mood === '快乐' ? '欢快' as const : mood === '想哭' ? '爆款' as const : mood))];
