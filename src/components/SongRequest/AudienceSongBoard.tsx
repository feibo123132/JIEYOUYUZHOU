import { useEffect, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { Song } from './songCatalog';
import { AUDIENCE_SONG_TAGS, audienceSongTags, getAudienceSongBatch, type AudienceSongTag, type AudienceTaggedSongIds } from './audienceSongs';
import './audienceSongBoard.css';

export default function AudienceSongBoard({ songs, taggedSongIds, start, loadFailed, canManage, filterLabel, onRetry, onManage, onChangeBatch, onSelect }: {
  songs: Song[] | null;
  taggedSongIds: AudienceTaggedSongIds;
  start: number;
  loadFailed: boolean;
  canManage: boolean;
  filterLabel?: string;
  onRetry: () => void;
  onManage: () => void;
  onChangeBatch: (start: number) => void;
  onSelect: (song: Song) => void;
}) {
  const { items, previousStart, nextStart } = getAudienceSongBatch(songs ?? [], start);
  return (
    <section className="audience-board" aria-labelledby="song-showcase-title">
      {items.length > 0 ? (
        <ul className="audience-song-grid" aria-label="本组可点歌曲">
          {items.map(song => (
            <li key={song.id}>
              <button type="button" className="audience-song-note" onClick={() => onSelect(song)}>
                <span className="min-w-0 flex-1">
                  <strong className="audience-song-title" title={song.title}>{song.title}</strong>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5">
                    <small className="min-w-0 truncate text-xs text-amber-50/55" title={song.artist}>{song.artist}</small>
                    {audienceSongTags.map(tag => {
                      if (!taggedSongIds[tag].has(song.id)) return null;
                      const { label, icon: Icon, badgeClass } = AUDIENCE_SONG_TAGS[tag];
                      return <span key={tag} role="img" aria-label={label} title={label} className={`shrink-0 ${badgeClass}`}><Icon aria-hidden="true" className="h-3.5 w-3.5" /></span>;
                    })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mx-auto grid min-h-48 max-w-sm place-content-center gap-4 text-center">
          <p role="status" className="text-sm text-white/60">
            {loadFailed ? '歌单暂时没加载出来' : songs === null ? '正在加载歌单…' : filterLabel ? `还没有标记为「${filterLabel}」的歌曲` : '观众点歌歌单还是空的'}
          </p>
          {loadFailed && <button type="button" className="audience-board-button" onClick={onRetry}>重新加载</button>}
          {songs && canManage && !filterLabel && <button type="button" className="audience-board-button" onClick={onManage}>挑选歌曲</button>}
        </div>
      )}
      {songs && songs.length > items.length && (
        <footer className="mt-8 flex justify-center gap-3 pb-5 sm:mt-10">
          <button type="button" className="audience-board-button" onClick={() => onChangeBatch(previousStart)}>上一组</button>
          <button type="button" className="audience-board-button" onClick={() => onChangeBatch(nextStart)}>下一组</button>
        </footer>
      )}
    </section>
  );
}

export function AudienceSongEditor({ catalog, songIds, taggedSongIds, saving, onToggleTag, onSave, onClose }: {
  catalog: Song[];
  songIds: string[];
  taggedSongIds: AudienceTaggedSongIds;
  saving: boolean;
  onToggleTag: (tag: AudienceSongTag, songId: string) => boolean;
  onSave: (add: string[], remove: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(() => new Set(songIds));
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tagSaveFailed, setTagSaveFailed] = useState(false);
  const keyword = query.trim().toLocaleLowerCase();
  const visible = catalog.filter(song => (!selectedOnly || selected.has(song.id)) &&
    `${song.title} ${song.artist}`.toLocaleLowerCase().includes(keyword));
  const original = new Set(songIds);
  const add = [...selected].filter(id => !original.has(id));
  const remove = songIds.filter(id => !selected.has(id));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="audience-editor-title" className="audience-song-editor text-white" onCancel={event => {
      event.preventDefault();
      if (!saving) onClose();
    }}>
      <form className="flex min-h-0 flex-col gap-4" onSubmit={async event => {
        event.preventDefault();
        setFailed(false);
        if (await onSave(add, remove)) onClose();
        else setFailed(true);
      }}>
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="audience-editor-title" className="font-serif text-2xl font-black sm:text-3xl">管理观众点歌</h2>
            <p className="mt-2 text-sm text-amber-50/60">已选 {selected.size} 首</p>
          </div>
          <button type="button" aria-label="关闭歌单管理" disabled={saving} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-white/65 hover:bg-white/10 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[10rem] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-amber-200/55">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-100/55" />
            <input type="search" aria-label="搜索歌名或歌手" placeholder="搜索歌名或歌手" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/40 sm:text-sm" />
          </label>
          <button type="button" aria-pressed={selectedOnly} onClick={() => setSelectedOnly(value => !value)} className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${selectedOnly ? 'border-amber-200/35 bg-amber-200/15 text-amber-100' : 'border-white/10 text-white/65 hover:bg-white/10'}`}>仅看已选</button>
        </div>
        <div className="audience-editor-results" aria-label="可选歌曲">
          {visible.length === 0 && <p className="py-8 text-center text-sm text-white/55">{selectedOnly && !keyword ? '还没有已选歌曲' : '没有找到匹配的歌曲'}</p>}
          {visible.map(song => {
            const checked = selected.has(song.id);
            return (
              <div key={song.id} className="flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/[.055]">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch">
                  <input type="checkbox" checked={checked} disabled={saving} onChange={() => {
                    setSelected(current => {
                      const next = new Set(current);
                      if (next.has(song.id)) next.delete(song.id);
                      else next.add(song.id);
                      return next;
                    });
                  }} className="h-4 w-4 shrink-0 accent-amber-300" />
                  <span className="min-w-0">
                    <strong className="block break-words text-sm">{song.title}</strong>
                    <small className="block break-words text-xs text-white/55">{song.artist}</small>
                  </span>
                </label>
                <div className="flex shrink-0 gap-1">
                  {audienceSongTags.map(tag => {
                    const { label, icon: Icon, pressedClass } = AUDIENCE_SONG_TAGS[tag];
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-label={`${song.title} · ${label}`}
                        aria-pressed={taggedSongIds[tag].has(song.id)}
                        onClick={() => setTagSaveFailed(!onToggleTag(tag, song.id))}
                        className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-white/10 px-2 text-xs font-bold text-white/65 transition hover:bg-white/10 ${pressedClass}`}
                      >
                        <Icon aria-hidden="true" className="hidden h-3.5 w-3.5 min-[380px]:block" />{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
          <div className="mr-auto space-y-1">
            {failed && <p role="alert" className="text-sm text-rose-200">歌单保存失败，勾选已保留，请重试。</p>}
            {tagSaveFailed ? <p role="alert" className="text-xs text-rose-200">浏览器无法保存标记，刷新后可能丢失。</p> : <p className="text-xs text-white/45">多练和精选自动保存</p>}
          </div>
          <button type="submit" disabled={saving || (!add.length && !remove.length)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-200 px-4 text-sm font-black text-[#211509] hover:bg-amber-100 disabled:opacity-45">
            <Check aria-hidden="true" className="h-4 w-4" />{saving ? '保存中…' : '保存歌单'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
