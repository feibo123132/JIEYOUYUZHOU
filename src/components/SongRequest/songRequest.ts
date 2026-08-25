import type { Song } from './songCatalog.ts';

export type VoteCounts = Record<string, number>;
export interface EditableCatalog { version: 2; artists: string[]; songs: Song[]; }

interface ReadableStorage {
  getItem: (key: string) => string | null;
}

interface WritableStorage {
  setItem: (key: string, value: string) => void;
}

export const VOTE_STORAGE_KEY = 'jieyou-song-request-votes-v1';
export const CATALOG_STORAGE_KEY = 'jieyou-song-catalog-v1';

export const createEditableCatalog = (songs: Song[]): EditableCatalog => ({
  version: 2,
  artists: [...new Set(songs.map((song) => song.artist))],
  songs: [...songs],
});

export const addCatalogArtist = (catalog: EditableCatalog, rawArtist: string): EditableCatalog => {
  const artist = rawArtist.trim();
  if (!artist || catalog.artists.includes(artist)) return catalog;
  return { ...catalog, artists: [...catalog.artists, artist] };
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
    if (parsed.version === 2) {
      return { version: 2, artists: [...new Set(parsed.artists)], songs: parsed.songs };
    }
    if (parsed.version === 1) {
      const defaultCatalog = createEditableCatalog(fallbackSongs);
      const defaultSongIds = new Set(fallbackSongs.map((song) => song.id));
      return {
        version: 2,
        artists: [...new Set([...defaultCatalog.artists, ...parsed.artists])],
        songs: [...fallbackSongs, ...parsed.songs.filter((song) => !defaultSongIds.has(song.id))],
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

export const getSongSubtitle = (song: Song) => song.hotComment?.trim() || `${song.artist} · ${song.category}`;

export const incrementSongVote = (counts: VoteCounts, songId: string): VoteCounts => ({
  ...counts,
  [songId]: (counts[songId] ?? 0) + 1,
});

export const rankSongsByVotes = (songs: Song[], counts: VoteCounts) => songs
  .map((song, catalogIndex) => ({ song, count: counts[song.id] ?? 0, catalogIndex }))
  .filter((item) => item.count > 0)
  .sort((left, right) => right.count - left.count || left.catalogIndex - right.catalogIndex)
  .map(({ song, count }) => ({ song, count }));

export const loadVoteCounts = (storage: ReadableStorage, validSongIds: string[]): VoteCounts => {
  try {
    const raw = storage.getItem(VOTE_STORAGE_KEY);
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

export const saveVoteCounts = (storage: WritableStorage, counts: VoteCounts) => {
  storage.setItem(VOTE_STORAGE_KEY, JSON.stringify({ version: 1, counts }));
};
