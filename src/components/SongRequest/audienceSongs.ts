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
  if (songs.length <= AUDIENCE_BATCH_SIZE) return { items: songs, previousStart: 0, nextStart: 0 };
  const offset = start % songs.length;
  const items = songs.slice(offset, offset + AUDIENCE_BATCH_SIZE);
  return {
    items: items.concat(songs.slice(0, AUDIENCE_BATCH_SIZE - items.length)),
    previousStart: (offset + songs.length - AUDIENCE_BATCH_SIZE) % songs.length,
    nextStart: (offset + AUDIENCE_BATCH_SIZE) % songs.length,
  };
};
