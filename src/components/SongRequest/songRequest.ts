import type { Song } from './songCatalog.ts';

export type VoteCounts = Record<string, number>;
export interface EditableCatalog { version: 7; artists: string[]; songs: Song[]; }

interface ReadableStorage {
  getItem: (key: string) => string | null;
}

interface WritableStorage {
  setItem: (key: string, value: string) => void;
}

export const VOTE_STORAGE_KEY = 'jieyou-song-request-votes-v1';
export const SUNG_VOTE_STORAGE_KEY = 'jieyou-song-request-sung-votes-v1';
export const CATALOG_STORAGE_KEY = 'jieyou-song-catalog-v1';

export const paginateRankingItems = <T>(items: T[], requestedPage: number, pageSize: number) => {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage)));
  const start = (page - 1) * safePageSize;
  return { items: items.slice(start, start + safePageSize), page, pageCount, total: items.length };
};

export type RankingDisplayMode = 'normal' | 'reverse' | 'random';

export const togglePersonalRankingReverse = (mode: RankingDisplayMode): RankingDisplayMode => (
  mode === 'reverse' ? 'normal' : 'reverse'
);

export const togglePersonalRankingRandom = (mode: RankingDisplayMode): RankingDisplayMode => (
  mode === 'random' ? 'normal' : 'random'
);

export const orderPersonalRankingItems = <T extends object>(
  items: T[],
  mode: RankingDisplayMode,
  random: () => number = Math.random,
): Array<T & { originalRank: number }> => {
  const withRank = items.map((item, index) => ({ ...item, originalRank: index + 1 }));
  if (mode === 'reverse') return withRank.reverse();
  if (mode !== 'random' || withRank.length <= 3) return withRank;
  const top3 = withRank.slice(0, 3);
  const rest = withRank.slice(3);
  for (let index = rest.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [rest[index], rest[target]] = [rest[target], rest[index]];
  }
  return [...top3, ...rest];
};

export const createEditableCatalog = (songs: Song[]): EditableCatalog => ({
  version: 7,
  artists: [...new Set(songs.map((song) => song.artist))],
  songs: [...songs],
});

export const addCatalogArtist = (catalog: EditableCatalog, rawArtist: string): EditableCatalog => {
  const artist = rawArtist.trim();
  if (!artist || catalog.artists.includes(artist)) return catalog;
  return { ...catalog, artists: [...catalog.artists, artist] };
};

export const moveCatalogArtist = (catalog: EditableCatalog, artist: string, targetArtist: string): EditableCatalog => {
  const artistIndex = catalog.artists.indexOf(artist);
  const targetIndex = catalog.artists.indexOf(targetArtist);
  if (artistIndex < 0 || targetIndex < 0 || artistIndex === targetIndex) return catalog;
  const artists = [...catalog.artists];
  [artists[artistIndex], artists[targetIndex]] = [artists[targetIndex], artists[artistIndex]];
  return { ...catalog, artists };
};

export type ArtistDropPlacement = 'before' | 'after';

export const insertCatalogArtist = (
  catalog: EditableCatalog,
  artist: string,
  targetArtist: string,
  placement: ArtistDropPlacement,
): EditableCatalog => {
  if (artist === targetArtist || !catalog.artists.includes(artist) || !catalog.artists.includes(targetArtist)) return catalog;
  const artists = catalog.artists.filter((item) => item !== artist);
  const targetIndex = artists.indexOf(targetArtist);
  artists.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, artist);
  return artists.every((item, index) => item === catalog.artists[index]) ? catalog : { ...catalog, artists };
};

export const removeCatalogArtist = (catalog: EditableCatalog, artist: string): EditableCatalog => ({
  ...catalog,
  artists: catalog.artists.filter((item) => item !== artist),
  songs: catalog.songs.filter((song) => song.artist !== artist),
});

export const addCatalogSong = (catalog: EditableCatalog, song: Song): EditableCatalog => ({
  ...catalog,
  artists: catalog.artists.includes(song.artist) ? catalog.artists : [...catalog.artists, song.artist],
  songs: [...catalog.songs.filter((item) => item.id !== song.id), song],
});

export const removeCatalogSong = (catalog: EditableCatalog, songId: string): EditableCatalog => ({
  ...catalog,
  songs: catalog.songs.filter((song) => song.id !== songId),
});

export const moveCatalogSong = (catalog: EditableCatalog, songId: string, targetSongId: string): EditableCatalog => {
  const songIndex = catalog.songs.findIndex((song) => song.id === songId);
  const targetIndex = catalog.songs.findIndex((song) => song.id === targetSongId);
  if (songIndex < 0 || targetIndex < 0 || songIndex === targetIndex
    || catalog.songs[songIndex].artist !== catalog.songs[targetIndex].artist) return catalog;
  const songs = [...catalog.songs];
  [songs[songIndex], songs[targetIndex]] = [songs[targetIndex], songs[songIndex]];
  return { ...catalog, songs };
};

export const insertCatalogSong = (
  catalog: EditableCatalog,
  songId: string,
  targetSongId: string,
  placement: ArtistDropPlacement,
): EditableCatalog => {
  const song = catalog.songs.find((item) => item.id === songId);
  const target = catalog.songs.find((item) => item.id === targetSongId);
  if (!song || !target || song.id === target.id || song.artist !== target.artist) return catalog;
  const songs = catalog.songs.filter((item) => item.id !== songId);
  const targetIndex = songs.findIndex((item) => item.id === targetSongId);
  songs.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, song);
  return songs.every((item, index) => item.id === catalog.songs[index]?.id) ? catalog : { ...catalog, songs };
};

export const sortCatalogByMatchScore = (
  catalog: EditableCatalog,
  records: Array<{ songId: string; matchScore: number }>,
): EditableCatalog => {
  const scoresBySong = new Map<string, number[]>();
  for (const record of records) {
    scoresBySong.set(record.songId, [...(scoresBySong.get(record.songId) ?? []), record.matchScore]);
  }
  const avgScore = (songId: string): number | null => {
    const scores = scoresBySong.get(songId) ?? [];
    if (!scores.length) return null;
    return Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
  };
  const byArtist = new Map<string, Song[]>();
  for (const song of catalog.songs) {
    byArtist.set(song.artist, [...(byArtist.get(song.artist) ?? []), song]);
  }
  const sortedSongs: Song[] = [];
  for (const artist of catalog.artists) {
    const songs = byArtist.get(artist) ?? [];
    songs.sort((a, b) => {
      const scoreA = avgScore(a.id);
      const scoreB = avgScore(b.id);
      if (scoreA === null && scoreB === null) return 0;
      if (scoreB === null) return -1;
      if (scoreA === null) return 1;
      return scoreB - scoreA;
    });
    sortedSongs.push(...songs);
    byArtist.delete(artist);
  }
  for (const songs of byArtist.values()) sortedSongs.push(...songs);
  const sameOrder =
    sortedSongs.length === catalog.songs.length &&
    sortedSongs.every((song, index) => song.id === catalog.songs[index]?.id);
  return sameOrder ? catalog : { ...catalog, songs: sortedSongs };
};

const isSong = (value: unknown): value is Song => {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<Song>;
  return typeof song.id === 'string' && typeof song.title === 'string'
    && typeof song.artist === 'string' && typeof song.category === 'string'
    && typeof song.featured === 'boolean'
    && (song.hotComment === undefined || typeof song.hotComment === 'string');
};

export const loadEditableCatalog = (storage: ReadableStorage, fallbackSongs: Song[]): EditableCatalog => {
  try {
    const raw = storage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return createEditableCatalog(fallbackSongs);
    const parsed = JSON.parse(raw) as { version?: unknown; artists?: unknown; songs?: unknown };
    if (!Array.isArray(parsed.artists) || !Array.isArray(parsed.songs)
      || !parsed.artists.every((artist) => typeof artist === 'string' && artist.trim())
      || !parsed.songs.every(isSong)) return createEditableCatalog(fallbackSongs);
    if (parsed.version === 7) {
      return { version: 7, artists: [...new Set(parsed.artists)], songs: parsed.songs };
    }
    if (parsed.version === 1 || parsed.version === 2 || parsed.version === 3 || parsed.version === 4 || parsed.version === 5 || parsed.version === 6) {
      const defaultCatalog = createEditableCatalog(fallbackSongs);
      const defaultSongIds = new Set(fallbackSongs.map((song) => song.id));
      const cachedSongs = new Map(parsed.songs.map((song) => [song.id, song]));
      const customSongs = parsed.songs.filter((song) => !defaultSongIds.has(song.id));
      const customSongArtists = new Set(customSongs.map((song) => song.artist));
      const renamedDefaultArtists = new Set(fallbackSongs.flatMap((song) => {
        const cachedSong = cachedSongs.get(song.id);
        return cachedSong && cachedSong.artist !== song.artist ? [cachedSong.artist] : [];
      }));
      return {
        version: 7,
        artists: [...new Set([
          ...defaultCatalog.artists,
          ...parsed.artists.filter((artist) => !renamedDefaultArtists.has(artist) || customSongArtists.has(artist)),
        ])],
        songs: [
          ...fallbackSongs.map((song) => ({ ...(cachedSongs.get(song.id) ?? {}), ...song })),
          ...customSongs,
        ],
      };
    }
    return createEditableCatalog(fallbackSongs);
  } catch {
    return createEditableCatalog(fallbackSongs);
  }
};

export const saveEditableCatalog = (storage: WritableStorage, catalog: EditableCatalog) => {
  storage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
};

export const filterSongs = (songs: Song[], query: string, category: string) => {
  const needle = query.trim().toLocaleLowerCase();
  return songs.filter((song) => {
    const matchesCategory = category === '全部' || song.category === category;
    const matchesQuery = !needle || `${song.title} ${song.artist}`.toLocaleLowerCase().includes(needle);
    return matchesCategory && matchesQuery;
  });
};

export const getFeaturedSongs = (songs: Song[]) => songs.filter((song) => song.featured);

export const isFeaturedSongManager = (alias: string | null | undefined) => (
  alias?.trim().toLocaleLowerCase() === '2421415030@qq.com'
);

export const getSongSubtitle = (song: Song) => song.hotComment?.trim() || `${song.artist} · ${song.category}`;

export const incrementSongVote = (counts: VoteCounts, songId: string): VoteCounts => ({
  ...counts,
  [songId]: (counts[songId] ?? 0) + 1,
});

export const finishRequestedVotes = (pending: VoteCounts, sung: VoteCounts) => ({
  pending: {},
  sung: Object.entries(pending).reduce<VoteCounts>((next, [songId, count]) => ({
    ...next,
    [songId]: (next[songId] ?? 0) + count,
  }), { ...sung }),
});

export const rankSongsByVotes = (songs: Song[], counts: VoteCounts) => songs
  .map((song, catalogIndex) => ({ song, count: counts[song.id] ?? 0, catalogIndex }))
  .filter((item) => item.count > 0)
  .sort((left, right) => right.count - left.count || left.catalogIndex - right.catalogIndex)
  .map(({ song, count }) => ({ song, count }));

export const rankArtistsByVotes = (songs: Song[], counts: VoteCounts) => {
  const ranking = new Map<string, { artist: string; count: number; songCount: number; catalogIndex: number }>();
  songs.forEach((song, catalogIndex) => {
    const count = counts[song.id] ?? 0;
    if (count <= 0) return;
    const current = ranking.get(song.artist) ?? { artist: song.artist, count: 0, songCount: 0, catalogIndex };
    current.count += count;
    current.songCount += 1;
    ranking.set(song.artist, current);
  });
  return [...ranking.values()]
    .sort((left, right) => right.count - left.count || left.catalogIndex - right.catalogIndex)
    .map(({ artist, count, songCount }) => ({ artist, count, songCount }));
};

export type RankingMedalTone = 'gold' | 'silver' | 'bronze' | 'neutral';

export const getRankingMedalTone = (index: number, podiumSize: number): RankingMedalTone => {
  if (!Number.isInteger(index) || index < 0 || index >= podiumSize || index >= 3) return 'neutral';
  return (['gold', 'silver', 'bronze'] as const)[index];
};

export const getPersonalRankingPodiumSize = (artistSongCount: number | null) => (
  artistSongCount === null || artistSongCount >= 5 ? 3 : 1
);

const loadStoredVoteCounts = (storage: ReadableStorage, storageKey: string, validSongIds: string[]): VoteCounts => {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version?: unknown; counts?: unknown };
    if (parsed.version !== 1 || !parsed.counts || typeof parsed.counts !== 'object') return {};

    const validIds = new Set(validSongIds);
    return Object.fromEntries(
      Object.entries(parsed.counts)
        .filter(([songId, count]) => validIds.has(songId) && Number.isInteger(count) && Number(count) > 0),
    ) as VoteCounts;
  } catch {
    return {};
  }
};

export const loadVoteCounts = (storage: ReadableStorage, validSongIds: string[]) => (
  loadStoredVoteCounts(storage, VOTE_STORAGE_KEY, validSongIds)
);

export const loadSungVoteCounts = (storage: ReadableStorage, validSongIds: string[]) => (
  loadStoredVoteCounts(storage, SUNG_VOTE_STORAGE_KEY, validSongIds)
);

export const saveVoteCounts = (storage: WritableStorage, counts: VoteCounts) => {
  storage.setItem(VOTE_STORAGE_KEY, JSON.stringify({ version: 1, counts }));
};

export const saveSungVoteCounts = (storage: WritableStorage, counts: VoteCounts) => {
  storage.setItem(SUNG_VOTE_STORAGE_KEY, JSON.stringify({ version: 1, counts }));
};
