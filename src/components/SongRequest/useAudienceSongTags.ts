import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AUDIENCE_SONG_TAGS, type AudienceSongTag, type AudienceSongTagChange, type AudienceSongTagLists } from './audienceSongs';
import { syncCloudAudienceSongTags, type Credentials } from './songRequestCloud';

type TagCache = { tags: AudienceSongTagLists; pending: AudienceSongTagChange[]; legacyImported: boolean };
const CACHE_PREFIX = 'jieyou-audience-song-tags-account-v1:';
const BATCH_SIZE = 200;

const readLocal = (key: string): unknown => {
  try { return JSON.parse(window.localStorage.getItem(key) ?? 'null'); }
  catch { return null; }
};

const songIds = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0 && id.length <= 100)
  : [];

const readLegacyTags = (): AudienceSongTagLists => ({
  practice: songIds(readLocal(AUDIENCE_SONG_TAGS.practice.storageKey)),
  featured: songIds(readLocal(AUDIENCE_SONG_TAGS.featured.storageKey)),
});

const readCache = (key: string, legacy?: AudienceSongTagLists): TagCache => {
  const saved = readLocal(key) as Partial<TagCache> | null;
  return {
    tags: saved?.tags
      ? { practice: songIds(saved.tags.practice), featured: songIds(saved.tags.featured) }
      : legacy ?? { practice: [], featured: [] },
    pending: Array.isArray(saved?.pending) ? saved.pending.filter(change => change
      && typeof change.operationId === 'string' && change.operationId.length > 0 && change.operationId.length <= 48
      && (change.tag === 'practice' || change.tag === 'featured') && typeof change.marked === 'boolean'
      && typeof change.songId === 'string' && change.songId.trim().length > 0 && change.songId.length <= 100) : [],
    legacyImported: saved?.legacyImported === true,
  };
};

export function useAudienceSongTags(session: Credentials | null, importLegacy: boolean, browsing: boolean) {
  // The station remounts when the account changes. Guest marks stay in the original browser storage.
  const key = session ? CACHE_PREFIX + encodeURIComponent(session.alias.trim().toLocaleLowerCase()) : '';
  const [legacy] = useState(() => importLegacy || !session ? readLegacyTags() : undefined);
  const [cache, setCache] = useState(() => readCache(key, legacy));
  const current = useRef(cache);
  const mounted = useRef(false);
  const syncing = useRef(false);
  const [syncFailed, setSyncFailed] = useState(false);

  const taggedSongIds = useMemo(() => {
    const visible = { practice: new Set(cache.tags.practice), featured: new Set(cache.tags.featured) };
    for (const { tag, songId, marked } of cache.pending) {
      if (marked) visible[tag].add(songId);
      else visible[tag].delete(songId);
    }
    return visible;
  }, [cache]);

  const publish = useCallback((next: TagCache) => {
    current.current = next;
    setCache(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      return true;
    } catch { return false; }
  }, [key]);

  const sync = useCallback(async () => {
    if (!session || syncing.current || !mounted.current) return;
    syncing.current = true;
    try {
      do {
        const before = current.current;
        const pending = before.pending.slice(0, BATCH_SIZE);
        const oldTags = !before.legacyImported && legacy && (legacy.practice.length || legacy.featured.length) ? legacy : undefined;
        const tags = await syncCloudAudienceSongTags(session, pending, oldTags);
        if (!mounted.current) return;
        if (!Array.isArray(tags?.practice) || !Array.isArray(tags?.featured)) throw new Error('INVALID_AUDIENCE_SONG_TAGS');
        const acknowledged = new Set(pending.map(change => change.operationId));
        publish({
          tags,
          pending: current.current.pending.filter(change => !acknowledged.has(change.operationId)),
          legacyImported: before.legacyImported || Boolean(oldTags),
        });
        setSyncFailed(false);
      } while (current.current.pending.length);
    } catch {
      if (mounted.current) setSyncFailed(true);
    } finally {
      syncing.current = false;
    }
  }, [legacy, publish, session]);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (!document.hidden) void sync(); };
    void sync();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = session && browsing ? window.setInterval(refresh, 30_000) : undefined;
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [browsing, session, sync]);

  const toggle = (tag: AudienceSongTag, songId: string) => {
    const before = current.current;
    const pending = before.pending.slice().reverse().find(change => change.tag === tag && change.songId === songId);
    const marked = !(pending?.marked ?? before.tags[tag].includes(songId));
    if (session) {
      const operationId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      const saved = publish({ ...before, pending: [...before.pending, { operationId, tag, songId, marked }] });
      void sync();
      return saved;
    }

    const tags = { ...before.tags, [tag]: marked ? [...before.tags[tag], songId] : before.tags[tag].filter(id => id !== songId) };
    const next = { ...before, tags };
    current.current = next;
    setCache(next);
    try {
      window.localStorage.setItem(AUDIENCE_SONG_TAGS[tag].storageKey, JSON.stringify(tags[tag]));
      return true;
    } catch { return false; }
  };

  return { taggedSongIds, toggle, syncFailed };
}
