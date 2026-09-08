import { useState, type ReactNode } from 'react';
import { Gift, Plus, X } from 'lucide-react';
import type { Song } from './songCatalog';
import { addFixedQuizSong, createRoadshowSong, removeFixedQuizSong, type RoadshowRecord, type RoadshowSong } from './roadshow';

export default function FixedQuizSongs({ record, catalogSongs, managing, busy, onSave, renderSong }: {
  record: RoadshowRecord;
  catalogSongs: Song[];
  managing: boolean;
  busy: boolean;
  onSave: (record: RoadshowRecord) => void;
  renderSong: (song: RoadshowSong) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const fixed = record.recognitionSongs.filter(song => song.fixedBonus);
  const keyword = query.trim().toLocaleLowerCase();
  const results = keyword ? catalogSongs.filter(song => `${song.title} ${song.artist}`.toLocaleLowerCase().includes(keyword)).slice(0, 20) : [];
  const add = (song: Song) => {
    try { const next = addFixedQuizSong(record, createRoadshowSong(song)); setError(''); onSave(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '添加失败'); }
  };
  return <section className="mt-5 rounded-2xl border border-amber-200/25 bg-amber-300/[.045] p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="flex items-center gap-2 font-serif text-lg font-black text-amber-100"><Gift size={18} />固定送分<small className="ml-1 font-sans text-xs font-normal text-white/40">{fixed.length} 首</small></h4><p className="mt-1 text-xs text-white/40">超级简单的暖场歌曲，随歌单传承；参与时可选入本轮4首。</p></div>
      {managing && <button type="button" disabled={busy} onClick={() => setEditing(!editing)} className="inline-flex h-9 items-center gap-1 rounded-full border border-amber-200/25 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-200/10 disabled:opacity-40">{editing ? <X size={14} /> : <Plus size={14} />}{editing ? '完成管理' : '管理歌曲'}</button>}
    </header>
    {managing && editing && <div className="mt-4">
      <input aria-label="搜索固定送分歌曲" placeholder="搜索歌名或歌手，添加送分歌曲" value={query} onChange={event => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-amber-200/45" />
      <p className="mt-2 text-xs text-white/35">添加后仍保留在原难度档，可同时作为固定送分歌曲。</p>
      {keyword && <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">{results.map(song => {
        const added = fixed.some(item => item.catalogId === song.id || (item.title.trim().toLocaleLowerCase() === song.title.trim().toLocaleLowerCase() && item.artist.trim().toLocaleLowerCase() === song.artist.trim().toLocaleLowerCase()));
        return <button key={song.id} type="button" disabled={busy || added} onClick={() => add(song)} className="flex w-full items-center justify-between gap-3 rounded-lg bg-black/25 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 disabled:opacity-40"><span className="min-w-0 truncate">{song.title}<small className="ml-2 text-white/35">{song.artist}</small></span><span className="shrink-0 text-xs text-amber-200">{added ? '已添加' : '添加'}</span></button>;
      })}{!results.length && <p className="p-3 text-xs text-white/40">没有找到歌曲，请换个关键词。</p>}</div>}
      {error && <p role="status" className="mt-2 text-xs text-amber-200">{error}</p>}
    </div>}
    {fixed.length ? <div className="mt-4 grid max-h-96 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-4">{fixed.map(song => <div key={song.id} className="min-w-0">{renderSong(song)}{managing && editing && <button type="button" disabled={busy} aria-label={`取消送分歌曲${song.title}`} onClick={() => onSave(removeFixedQuizSong(record, song.id))} className="mt-1 px-2 py-1 text-xs text-white/40 hover:text-red-200 disabled:opacity-40">取消送分</button>}</div>)}</div> : <p className="py-6 text-center text-xs text-white/30">还没有送分歌曲{managing ? '，点击“管理歌曲”从歌库添加。' : '。'}</p>}
  </section>;
}
