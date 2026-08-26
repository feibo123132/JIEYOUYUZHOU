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
}

export interface SongRoadshowRecord extends SongRecordBase {
  kind: 'roadshow';
  audienceName: string;
  feedback: string;
}

export type SongRecord = PracticeRecord | SongRoadshowRecord;

interface ReadableStorage { getItem: (key: string) => string | null; }
interface WritableStorage { setItem: (key: string, value: string) => void; }
interface RemovableStorage { removeItem: (key: string) => void; }

const CACHE_PREFIX = 'jieyou-song-records-v1:';
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
      && isText(record.feelings, 2000, false) && isText(record.problems, 2000, false) && isText(record.improvements, 2000, false);
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

export const parseMatchScoreInput = (value: string): number | '' => value === '' ? '' : Number(value);

export type MatchQuality = {
  label: '普通' | '优秀' | '精良' | '稀有' | '传奇';
  tone: 'white' | 'green' | 'lightBlue' | 'darkBlue' | 'purple' | 'gold';
};

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
        return { key: dayKey, count: sorted.length, averageScore: averageMatchScore(sorted), records: sorted };
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
    return { song, score: averageMatchScore(practices), practiceCount: practices.length, catalogIndex };
  }).filter((item): item is typeof item & { score: number } => item.score !== null)
    .sort((left, right) => right.score - left.score || left.catalogIndex - right.catalogIndex)
    .map(({ song, score, practiceCount }) => ({ song, score, practiceCount }));
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
  return record.kind === 'practice'
    ? {
        ...base,
        kind: 'practice',
        matchScore: record.matchScore,
        feelings: record.feelings,
        problems: record.problems,
        improvements: record.improvements,
      }
    : {
        ...base,
        kind: 'roadshow',
        audienceName: record.audienceName,
        feedback: record.feedback,
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
