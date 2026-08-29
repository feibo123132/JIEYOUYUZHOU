import type { Song } from './songCatalog.ts';

export interface RoadshowSong {
  id: string;
  catalogId?: string;
  title: string;
  artist: string;
  source: 'catalog' | 'manual';
}

export interface RoadshowRecord {
  id: string;
  title: string;
  date: string;
  performanceSongs: RoadshowSong[];
  recognitionSongs: RoadshowSong[];
  updatedAt: string;
}

export const ROADSHOW_CACHE_KEY = 'jieyou-roadshows-v1';
export const ROADSHOW_SESSION_KEY = 'jieyou-roadshow-session-v1';

export const groupSongsByArtist = (songs: Song[]) => {
  const groups = new Map<string, Song[]>();
  for (const song of songs) {
    const current = groups.get(song.artist) ?? [];
    current.push(song);
    groups.set(song.artist, current);
  }
  return [...groups].map(([artist, groupedSongs]) => ({ artist, songs: groupedSongs }));
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

const isSong = (value: unknown): value is RoadshowSong => {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<RoadshowSong>;
  return typeof song.id === 'string'
    && typeof song.title === 'string'
    && typeof song.artist === 'string'
    && (song.source === 'catalog' || song.source === 'manual');
};

const isRecord = (value: unknown): value is RoadshowRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RoadshowRecord>;
  return typeof record.id === 'string'
    && typeof record.title === 'string'
    && typeof record.date === 'string'
    && typeof record.updatedAt === 'string'
    && Array.isArray(record.performanceSongs)
    && record.performanceSongs.every(isSong)
    && Array.isArray(record.recognitionSongs)
    && record.recognitionSongs.every(isSong);
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

export type LatestRoadshowRecognitionResult =
  | { kind: 'missing' }
  | { kind: 'duplicate'; record: RoadshowRecord }
  | { kind: 'updated'; record: RoadshowRecord };

export const prepareLatestRoadshowRecognitionSong = (
  records: RoadshowRecord[],
  song: Song,
): LatestRoadshowRecognitionResult => {
  if (!records.length) return { kind: 'missing' };
  const latest = [...records].sort((left, right) => (
    right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
  ))[0];
  const duplicate = latest.recognitionSongs.some((item) => (
    item.catalogId === song.id
    || (normalize(item.title) === normalize(song.title) && normalize(item.artist) === normalize(song.artist))
  ));
  if (duplicate) return { kind: 'duplicate', record: latest };
  return {
    kind: 'updated',
    record: {
      ...latest,
      recognitionSongs: [...latest.recognitionSongs, createRoadshowSong(song)],
    },
  };
};

export const createManualRoadshowSong = (title: string, artist: string): RoadshowSong => ({
  id: `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  title: title.trim(),
  artist: artist.trim(),
  source: 'manual',
});
