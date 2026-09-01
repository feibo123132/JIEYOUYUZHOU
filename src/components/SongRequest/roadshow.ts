import type { Song } from './songCatalog.ts';
import type { QuizAssignments, QuizLevel } from './songQuizLibrary.ts';

export interface RoadshowSong {
  id: string;
  catalogId?: string;
  title: string;
  artist: string;
  source: 'catalog' | 'manual';
}

export interface RecognitionAttempt {
  id: string;
  participantName?: string;
  catalogId?: string;
  title: string;
  artist: string;
  correct: boolean;
  answeredAt: string;
}

export interface PublicQuizParticipantRankingItem {
  participantName: string;
  score: number;
  answerCount: number;
  correctCount: number;
  accuracy: number;
}

export interface PublicQuizRankingItem {
  songId: string;
  songTitle: string;
  songArtist: string;
  answerCount: number;
  correctCount: number;
  accuracy: number;
}

export interface RoadshowRecord {
  id: string;
  title: string;
  date: string;
  location?: string;
  weather?: string;
  performanceSongs: RoadshowSong[];
  recognitionSongs: RoadshowSong[];
  recognitionAttempts?: RecognitionAttempt[];
  updatedAt: string;
}

export const ROADSHOW_CACHE_KEY = 'jieyou-roadshows-v1';
export const ROADSHOW_SESSION_KEY = 'jieyou-roadshow-session-v1';
export const ROADSHOW_QUIZ_PAGE_SIZE = 5;

export const paginateRoadshowSongs = <T>(songs: T[], requestedPage: number) => {
  const pageCount = Math.max(1, Math.ceil(songs.length / ROADSHOW_QUIZ_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage)));
  const start = (page - 1) * ROADSHOW_QUIZ_PAGE_SIZE;
  return {
    items: songs.slice(start, start + ROADSHOW_QUIZ_PAGE_SIZE),
    page,
    pageCount,
    total: songs.length,
  };
};

export const groupSongsByArtist = (songs: Song[]) => {
  const groups = new Map<string, Song[]>();
  for (const song of songs) {
    const current = groups.get(song.artist) ?? [];
    current.push(song);
    groups.set(song.artist, current);
  }
  return [...groups].map(([artist, groupedSongs]) => ({ artist, songs: groupedSongs }));
};

export const groupRoadshowRecognitionSongs = (
  songs: RoadshowSong[],
  assignments: QuizAssignments,
) => {
  const groups: Record<QuizLevel, RoadshowSong[]> = {
    warmup: [],
    standard: [],
    hard: [],
    hell: [],
  };
  for (const song of songs) {
    const level = song.catalogId ? assignments[song.catalogId] : undefined;
    groups[level ?? 'standard'].push(song);
  }
  return groups;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export const findSongAppearances = (
  records: RoadshowRecord[],
  candidate: Pick<RoadshowSong, 'title' | 'artist'> & { catalogId?: string },
  excludingRoadshowId?: string,
) => {
  const seen = new Set<string>();
  for (const record of records) {
    if (record.id === excludingRoadshowId) continue;
    const songs = [...record.performanceSongs, ...record.recognitionSongs];
    const matched = songs.some((song) => (
      candidate.catalogId && song.catalogId === candidate.catalogId
    ) || (
      normalize(song.title) === normalize(candidate.title)
      && normalize(song.artist) === normalize(candidate.artist)
    ));
    if (matched) seen.add(record.title);
  }
  return [...seen];
};

export const findSongRoadshowHistory = (
  records: RoadshowRecord[],
  candidate: Pick<Song, 'id' | 'title' | 'artist'>,
) => records
  .filter((record) => record.performanceSongs.some((song) => (
    song.catalogId === candidate.id
    || (normalize(song.title) === normalize(candidate.title) && normalize(song.artist) === normalize(candidate.artist))
  )))
  .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt));

const isSong = (value: unknown): value is RoadshowSong => {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<RoadshowSong>;
  return typeof song.id === 'string'
    && typeof song.title === 'string'
    && typeof song.artist === 'string'
    && (song.source === 'catalog' || song.source === 'manual');
};

const isRecognitionAttempt = (value: unknown): value is RecognitionAttempt => {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Partial<RecognitionAttempt>;
  return typeof attempt.id === 'string'
    && (attempt.participantName === undefined || (typeof attempt.participantName === 'string' && Boolean(attempt.participantName.trim())))
    && (attempt.catalogId === undefined || typeof attempt.catalogId === 'string')
    && typeof attempt.title === 'string'
    && typeof attempt.artist === 'string'
    && typeof attempt.correct === 'boolean'
    && typeof attempt.answeredAt === 'string';
};

const isRecord = (value: unknown): value is RoadshowRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RoadshowRecord>;
  return typeof record.id === 'string'
    && typeof record.title === 'string'
    && typeof record.date === 'string'
    && (record.location === undefined || typeof record.location === 'string')
    && (record.weather === undefined || typeof record.weather === 'string')
    && typeof record.updatedAt === 'string'
    && Array.isArray(record.performanceSongs)
    && record.performanceSongs.every(isSong)
    && Array.isArray(record.recognitionSongs)
    && record.recognitionSongs.every(isSong)
    && (record.recognitionAttempts === undefined || (
      Array.isArray(record.recognitionAttempts) && record.recognitionAttempts.every(isRecognitionAttempt)
    ));
};

export const parseRoadshowCache = (raw: string | null): RoadshowRecord[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; records?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) return [];
    return parsed.records.filter(isRecord);
  } catch {
    return [];
  }
};

export const createRoadshowSong = (song: Song): RoadshowSong => ({
  id: `catalog:${song.id}`,
  catalogId: song.id,
  title: song.title,
  artist: song.artist,
  source: 'catalog',
});

export const createRecognitionAttempt = (
  song: RoadshowSong,
  correct: boolean,
  participantName: string,
  id = `quiz:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  answeredAt = new Date().toISOString(),
): RecognitionAttempt => ({
  id,
  participantName: participantName.trim(),
  ...(song.catalogId ? { catalogId: song.catalogId } : {}),
  title: song.title,
  artist: song.artist,
  correct,
  answeredAt,
});

export const upsertRecognitionAttempt = (
  record: RoadshowRecord,
  attempt: RecognitionAttempt,
): RoadshowRecord => {
  const attempts = [...(record.recognitionAttempts ?? [])];
  const index = attempts.findIndex((item) => item.id === attempt.id);
  if (index >= 0) attempts[index] = attempt; else attempts.push(attempt);
  return { ...record, recognitionAttempts: attempts };
};

export const parsePublicQuizRanking = (value: unknown): PublicQuizRankingItem[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PublicQuizRankingItem => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Partial<PublicQuizRankingItem>;
    return typeof item.songId === 'string' && Boolean(item.songId.trim())
      && typeof item.songTitle === 'string' && Boolean(item.songTitle.trim())
      && typeof item.songArtist === 'string'
      && Number.isInteger(item.answerCount) && (item.answerCount ?? 0) > 0
      && Number.isInteger(item.correctCount) && (item.correctCount ?? -1) >= 0
      && (item.correctCount ?? 0) <= (item.answerCount ?? 0)
      && typeof item.accuracy === 'number' && item.accuracy >= 0 && item.accuracy <= 100;
  });
};

export const parsePublicQuizParticipantRanking = (value: unknown): PublicQuizParticipantRankingItem[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PublicQuizParticipantRankingItem => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Partial<PublicQuizParticipantRankingItem>;
    return typeof item.participantName === 'string' && Boolean(item.participantName.trim())
      && Number.isInteger(item.score) && (item.score ?? -1) >= 0
      && Number.isInteger(item.answerCount) && (item.answerCount ?? 0) > 0
      && Number.isInteger(item.correctCount) && (item.correctCount ?? -1) >= 0
      && item.score === item.correctCount
      && (item.correctCount ?? 0) <= (item.answerCount ?? 0)
      && typeof item.accuracy === 'number' && item.accuracy >= 0 && item.accuracy <= 100;
  });
};

export type LatestRoadshowSongResult =
  | { kind: 'missing' }
  | { kind: 'duplicate'; record: RoadshowRecord }
  | { kind: 'updated'; record: RoadshowRecord };

export const getLatestRoadshow = (records: RoadshowRecord[]) => (
  [...records].sort((left, right) => (
    right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
  ))[0]
);

export const collectUsedRecognitionSongIds = (records: RoadshowRecord[]) => new Set(
  records.flatMap((record) => record.recognitionSongs.flatMap((song) => song.catalogId ? [song.catalogId] : [])),
);

export const prepareLatestRoadshowRecognitionSongs = (
  records: RoadshowRecord[],
  songs: Song[],
): LatestRoadshowSongResult => {
  const latest = getLatestRoadshow(records);
  if (!latest) return { kind: 'missing' };
  const additions: Song[] = [];
  for (const song of songs) {
    const duplicate = [...latest.recognitionSongs, ...additions.map(createRoadshowSong)].some((item) => (
      item.catalogId === song.id
      || (normalize(item.title) === normalize(song.title) && normalize(item.artist) === normalize(song.artist))
    ));
    if (!duplicate) additions.push(song);
  }
  if (!additions.length) return { kind: 'duplicate', record: latest };
  return {
    kind: 'updated',
    record: {
      ...latest,
      recognitionSongs: [...latest.recognitionSongs, ...additions.map(createRoadshowSong)],
    },
  };
};

export const prepareLatestRoadshowRecognitionSong = (
  records: RoadshowRecord[],
  song: Song,
): LatestRoadshowSongResult => prepareLatestRoadshowRecognitionSongs(records, [song]);

export const prepareLatestRoadshowPerformanceSong = (
  records: RoadshowRecord[],
  song: Song,
): LatestRoadshowSongResult => {
  const latest = getLatestRoadshow(records);
  if (!latest) return { kind: 'missing' };
  const duplicate = latest.performanceSongs.some((item) => (
    item.catalogId === song.id
    || (normalize(item.title) === normalize(song.title) && normalize(item.artist) === normalize(song.artist))
  ));
  if (duplicate) return { kind: 'duplicate', record: latest };
  return {
    kind: 'updated',
    record: {
      ...latest,
      performanceSongs: [...latest.performanceSongs, createRoadshowSong(song)],
    },
  };
};

export const createManualRoadshowSong = (title: string, artist: string): RoadshowSong => ({
  id: `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  title: title.trim(),
  artist: artist.trim(),
  source: 'manual',
});
