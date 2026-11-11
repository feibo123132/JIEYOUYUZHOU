import { Star, Target } from 'lucide-react';
import { shuffleSongs } from './songRequest.ts';

const AUDIENCE_BATCH_SIZE = 20;
export const AUDIENCE_SONG_ORDER_STORAGE_KEY = 'jieyou-audience-song-order-v1';

export const AUDIENCE_SONG_TAGS = {
  practice: {
    label: '多练', icon: Target, storageKey: 'jieyou-audience-practice-song-ids-v1',
    pressedClass: 'aria-pressed:border-emerald-200/45 aria-pressed:bg-emerald-300/20 aria-pressed:text-emerald-100',
    badgeClass: 'text-emerald-300',
  },
  featured: {
    label: '精选', icon: Star, storageKey: 'jieyou-audience-featured-song-ids-v1',
    pressedClass: 'aria-pressed:border-amber-200/45 aria-pressed:bg-amber-300/20 aria-pressed:text-amber-100',
    badgeClass: 'text-amber-300',
  },
};
export type AudienceSongTag = keyof typeof AUDIENCE_SONG_TAGS;
export const audienceSongTags = Object.keys(AUDIENCE_SONG_TAGS) as AudienceSongTag[];
export type AudienceTaggedSongIds = Record<AudienceSongTag, ReadonlySet<string>>;
export type AudienceSongTagLists = Record<AudienceSongTag, string[]>;
export type AudienceSongTagChange = { operationId: string; tag: AudienceSongTag; songId: string; marked: boolean };

export const reconcileAudienceSongOrder = (savedOrder: readonly string[], songIds: readonly string[]) => {
  const remaining = new Set(songIds);
  const ordered: string[] = [];
  for (const id of savedOrder) {
    if (remaining.delete(id)) ordered.push(id);
  }
  return [...ordered, ...remaining];
};

export const restoreAudienceSongOrder = (songIds: string[], rawOrder: string | null, random = Math.random) => {
  if (rawOrder === null) return shuffleSongs(songIds, random);
  try {
    const savedOrder: unknown = JSON.parse(rawOrder);
    if (Array.isArray(savedOrder)) {
      return reconcileAudienceSongOrder(savedOrder.filter((id): id is string => typeof id === 'string'), songIds);
    }
  } catch { /* ignore invalid saved order */ }
  return songIds;
};

export const getAudienceSongBatch = <T>(songs: T[], start: number) => {
  const pageCount = Math.ceil(songs.length / AUDIENCE_BATCH_SIZE);
  if (pageCount === 0) return { items: [], page: 0, pageCount, previousStart: 0, nextStart: 0 };
  const pageIndex = Math.max(0, Math.min(Math.floor(start / AUDIENCE_BATCH_SIZE), pageCount - 1));
  const offset = pageIndex * AUDIENCE_BATCH_SIZE;
  return {
    items: songs.slice(offset, offset + AUDIENCE_BATCH_SIZE),
    page: pageIndex + 1,
    pageCount,
    previousStart: ((pageIndex + pageCount - 1) % pageCount) * AUDIENCE_BATCH_SIZE,
    nextStart: ((pageIndex + 1) % pageCount) * AUDIENCE_BATCH_SIZE,
  };
};
