export interface AvatarAdjustment {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface ArtistSettingsPayload {
  version: 1;
  artistOrder: string[];
  songOrder: string[];
  customAvatars: Record<string, string>;
  avatarAdjustments: Record<string, AvatarAdjustment>;
}

export interface ArtistSettingsSnapshot extends ArtistSettingsPayload {
  revision: number;
  updatedAt: string;
}

export interface ArtistSettingsDraft {
  changeId: number;
  baseRevision: number | null;
  snapshot: ArtistSettingsPayload;
}

interface ReadableStorage { getItem: (key: string) => string | null; }
interface WritableStorage { setItem: (key: string, value: string) => void; }
interface RemovableStorage { removeItem: (key: string) => void; }

export const ARTIST_SETTINGS_CACHE_KEY = 'jieyou-artist-settings-cache-v1';
export const ARTIST_SETTINGS_DRAFT_KEY = 'jieyou-artist-settings-dirty-v1';

const isArtist = (value: unknown): value is string => (
  typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 100
);

const isSongId = (value: unknown): value is string => (
  typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 120
);

const isAdjustment = (value: unknown): value is AvatarAdjustment => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => !['x', 'y', 'scale', 'rotation'].includes(key))) return false;
  return typeof item.x === 'number' && Number.isFinite(item.x) && item.x >= 0 && item.x <= 100
    && typeof item.y === 'number' && Number.isFinite(item.y) && item.y >= 0 && item.y <= 100
    && typeof item.scale === 'number' && Number.isFinite(item.scale) && item.scale >= 1 && item.scale <= 4
    && typeof item.rotation === 'number' && Number.isFinite(item.rotation) && item.rotation >= -30 && item.rotation <= 30;
};

const parseArtistSettingsPayload = (value: unknown): ArtistSettingsPayload | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !Array.isArray(item.artistOrder)
    || item.artistOrder.length < 1 || item.artistOrder.length > 200
    || !item.artistOrder.every(isArtist) || new Set(item.artistOrder).size !== item.artistOrder.length
    || !item.customAvatars || typeof item.customAvatars !== 'object' || Array.isArray(item.customAvatars)
    || !item.avatarAdjustments || typeof item.avatarAdjustments !== 'object' || Array.isArray(item.avatarAdjustments)) return null;
  const songOrder = item.songOrder === undefined ? [] : item.songOrder;
  if (!Array.isArray(songOrder) || songOrder.length > 2000
    || !songOrder.every(isSongId) || new Set(songOrder).size !== songOrder.length) return null;
  const artistOrder = item.artistOrder as string[];
  const artistSet = new Set(artistOrder);
  const customAvatars = item.customAvatars as Record<string, unknown>;
  const avatarAdjustments = item.avatarAdjustments as Record<string, unknown>;
  if (Object.keys(customAvatars).length > 100 || Object.keys(avatarAdjustments).length > 200) return null;
  if (Object.entries(customAvatars).some(([artist, avatar]) => (
    !artistSet.has(artist) || typeof avatar !== 'string'
      || !/^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)
  ))) return null;
  if (Object.entries(avatarAdjustments).some(([artist, adjustment]) => !artistSet.has(artist) || !isAdjustment(adjustment))) return null;
  return {
    version: 1,
    artistOrder: [...artistOrder],
    songOrder: [...songOrder],
    customAvatars: Object.fromEntries(Object.entries(customAvatars)) as Record<string, string>,
    avatarAdjustments: Object.fromEntries(Object.entries(avatarAdjustments)) as Record<string, AvatarAdjustment>,
  };
};

export const parseArtistSettingsSnapshot = (value: unknown): ArtistSettingsSnapshot | null => {
  const payload = parseArtistSettingsPayload(value);
  if (!payload || !value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!Number.isInteger(item.revision) || Number(item.revision) < 1
    || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) return null;
  return { ...payload, revision: Number(item.revision), updatedAt: item.updatedAt };
};

export const mergeArtistOrder = (cloudOrder: string[], localArtists: string[]) => {
  const localSet = new Set(localArtists);
  const ordered = cloudOrder.filter((artist, index) => localSet.has(artist) && cloudOrder.indexOf(artist) === index);
  return [...ordered, ...localArtists.filter((artist) => !ordered.includes(artist))];
};

export const mergeSongOrder = (cloudOrder: string[], localSongs: Song[]) => {
  const songsById = new Map(localSongs.map((song) => [song.id, song]));
  const ordered = cloudOrder.flatMap((songId) => {
    const song = songsById.get(songId);
    if (!song) return [];
    songsById.delete(songId);
    return [song];
  });
  return [...ordered, ...localSongs.filter((song) => songsById.has(song.id))];
};

export const createArtistSettingsPayload = (
  artistOrder: string[],
  customAvatars: Record<string, string>,
  avatarAdjustments: Record<string, AvatarAdjustment>,
  songOrder: string[] = [],
): ArtistSettingsPayload => {
  const order = [...new Set(artistOrder.filter(isArtist))].slice(0, 200);
  const artistSet = new Set(order);
  return {
    version: 1,
    artistOrder: order,
    songOrder: [...new Set(songOrder.filter(isSongId))].slice(0, 2000),
    customAvatars: Object.fromEntries(Object.entries(customAvatars).filter(([artist]) => artistSet.has(artist))),
    avatarAdjustments: Object.fromEntries(Object.entries(avatarAdjustments).filter(([artist, adjustment]) => artistSet.has(artist) && isAdjustment(adjustment))),
  };
};

export const hasCustomArtistSettings = (
  payload: ArtistSettingsPayload,
  defaultArtistOrder: string[],
  defaultSongOrder: string[] = [],
) => (
  Object.keys(payload.customAvatars).length > 0
  || Object.keys(payload.avatarAdjustments).length > 0
  || payload.artistOrder.length !== defaultArtistOrder.length
  || payload.artistOrder.some((artist, index) => artist !== defaultArtistOrder[index])
  || payload.songOrder.length !== defaultSongOrder.length
  || payload.songOrder.some((songId, index) => songId !== defaultSongOrder[index])
);

export const loadArtistSettingsCache = (storage: ReadableStorage) => {
  try { return parseArtistSettingsSnapshot(JSON.parse(storage.getItem(ARTIST_SETTINGS_CACHE_KEY) || 'null')); } catch { return null; }
};

export const saveArtistSettingsCache = (storage: WritableStorage, snapshot: ArtistSettingsSnapshot) => {
  storage.setItem(ARTIST_SETTINGS_CACHE_KEY, JSON.stringify(snapshot));
};

export const loadArtistSettingsDraft = (storage: ReadableStorage): ArtistSettingsDraft | null => {
  try {
    const value = JSON.parse(storage.getItem(ARTIST_SETTINGS_DRAFT_KEY) || 'null') as Record<string, unknown> | null;
    const snapshot = parseArtistSettingsPayload(value?.snapshot);
    if (!value || !snapshot || !Number.isInteger(value.changeId) || Number(value.changeId) < 1
      || !(value.baseRevision === null || (Number.isInteger(value.baseRevision) && Number(value.baseRevision) >= 1))) return null;
    return { changeId: Number(value.changeId), baseRevision: value.baseRevision === null ? null : Number(value.baseRevision), snapshot };
  } catch { return null; }
};

export const saveArtistSettingsDraft = (storage: WritableStorage, draft: ArtistSettingsDraft) => {
  storage.setItem(ARTIST_SETTINGS_DRAFT_KEY, JSON.stringify(draft));
};

export const clearArtistSettingsDraft = (storage: RemovableStorage) => storage.removeItem(ARTIST_SETTINGS_DRAFT_KEY);

export const createArtistSettingsDraft = (
  previous: ArtistSettingsDraft | null,
  baseRevision: number | null,
  snapshot: ArtistSettingsPayload,
): ArtistSettingsDraft => ({ changeId: (previous?.changeId ?? 0) + 1, baseRevision, snapshot });

export const ensureArtistSettingsRetryDraft = (
  storage: ReadableStorage & WritableStorage,
  local: ArtistSettingsPayload,
  defaultArtistOrder: string[],
  baseRevision: number | null,
  defaultSongOrder: string[] = [],
): ArtistSettingsDraft | null => {
  const current = loadArtistSettingsDraft(storage);
  if (current) return current;
  if (!hasCustomArtistSettings(local, defaultArtistOrder, defaultSongOrder)) return null;
  const draft = createArtistSettingsDraft(null, baseRevision, local);
  saveArtistSettingsDraft(storage, draft);
  return draft;
};

export const resolveArtistSettingsPull = ({ cloud, local, draft, hasSession, defaultArtistOrder, defaultSongOrder = [] }: {
  cloud: ArtistSettingsSnapshot | null;
  local: ArtistSettingsPayload;
  draft: ArtistSettingsDraft | null;
  hasSession: boolean;
  defaultArtistOrder: string[];
  defaultSongOrder?: string[];
}) => {
  if (draft) {
    const cloudRevision = cloud?.revision ?? null;
    if (draft.baseRevision !== cloudRevision) return { kind: 'conflict' as const, draft, cloud };
    return hasSession
      ? { kind: 'push-draft' as const, draft, cloud }
      : { kind: 'keep-draft' as const, draft, cloud };
  }
  if (cloud) return { kind: 'apply-cloud' as const, snapshot: cloud };
  if (hasSession && hasCustomArtistSettings(local, defaultArtistOrder, defaultSongOrder)) return { kind: 'seed-cloud' as const, payload: local };
  return { kind: 'keep-local' as const, payload: local };
};

export const resolveSuccessfulArtistSettingsPush = (
  latestDraft: ArtistSettingsDraft | null,
  pushedChangeId: number,
  serverSnapshot: ArtistSettingsSnapshot,
) => {
  if (!latestDraft || latestDraft.changeId === pushedChangeId) return null;
  if (latestDraft.changeId > pushedChangeId) return { ...latestDraft, baseRevision: serverSnapshot.revision };
  return latestDraft;
};
import type { Song } from './songCatalog';
