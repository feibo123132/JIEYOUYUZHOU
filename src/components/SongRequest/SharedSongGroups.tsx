import { useEffect, useRef, useState } from 'react';
import { Layers3, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Song } from './songCatalog';
import type { SongGroup, SongGroupsSnapshot } from './songGroups';
import { pullSongGroups, saveSongGroups } from './songRequestCloud';
import { readSongRecordSession } from './songRecords';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-teal-200/25 px-3 py-2 text-xs font-bold text-teal-100 transition hover:bg-teal-200/10 disabled:opacity-35';
const input = 'w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-200/45';

export default function SharedSongGroups({ catalogSongs, managing, onOpenSong }: {
  catalogSongs: Song[];
  managing: boolean;
  onOpenSong: (song: Song) => void;
}) {
  const [snapshot, setSnapshot] = useState<SongGroupsSnapshot | null>(null);
  const [draft, setDraft] = useState<SongGroup | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    setStatus('正在加载共享歌组…');
    pullSongGroups().then(value => { if (active) { setSnapshot(value); setStatus(''); } })
      .catch(() => { if (active) setStatus('共享歌组加载失败，请重试；若功能刚更新，请先部署 songRequestSync 云函数。'); });
    return () => { active = false; };
  }, [reload]);

  const persist = async (groups: SongGroup[]) => {
    if (!snapshot || saving.current) return;
    const credentials = readSongRecordSession(sessionStorage);
    if (!credentials) { setStatus('请先解锁管理员档案，再保存共享歌组。'); return; }
    saving.current = true;
    setBusy(true);
    try {
      const saved = await saveSongGroups(credentials, { ...snapshot, groups });
      setSnapshot(saved);
      setDraft(null);
      setStatus('已同步，所有路演共用。');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'CONFLICT') {
        try { setSnapshot(await pullSongGroups()); } catch { setSnapshot(null); }
        setStatus('其他设备已修改歌组，未覆盖云端内容。草稿已保留，请核对最新列表后重新保存。');
      } else setStatus(code === 'AUTH_FAILED' || code === 'NOT_REGISTERED'
        ? '请使用歌库管理员的档案保存共享歌组。草稿已保留。'
        : '保存失败，草稿已保留，请重试并确认云函数已更新。');
    } finally { saving.current = false; setBusy(false); }
  };
  const keyword = query.trim().toLocaleLowerCase();
  const results = keyword ? catalogSongs.filter(song => `${song.title} ${song.artist}`.toLocaleLowerCase().includes(keyword)).slice(0, 20) : [];

  return <section className="mt-5 rounded-2xl border border-teal-200/20 bg-teal-300/[.035] p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="flex items-center gap-2 font-serif text-lg font-black text-teal-100"><Layers3 size={18} />趣味歌组<small className="font-sans text-xs font-normal text-white/40">所有路演共用</small></h4><p className="mt-1 text-xs text-white/40">同名系列、和弦串烧，收藏歌曲之间的巧妙联系。</p></div>
      {managing && <button type="button" disabled={!snapshot || busy || Boolean(draft) || snapshot.groups.length >= 50} onClick={() => { setDraft({ id: crypto.randomUUID(), name: '', description: '', songIds: [] }); setQuery(''); }} className={button}><Plus size={14} />新建歌组</button>}
    </header>
    {status && <p role="status" className="mt-3 text-xs text-teal-100/70">{status}</p>}
    {!snapshot && <button type="button" onClick={() => setReload(value => value + 1)} className={`${button} mt-3`}>重新加载</button>}
    {managing && draft && <form onSubmit={event => { event.preventDefault(); if (draft.name.trim() && draft.songIds.length && snapshot) void persist(snapshot.groups.some(group => group.id === draft.id) ? snapshot.groups.map(group => group.id === draft.id ? draft : group) : [...snapshot.groups, draft]); }} className="mt-4 rounded-xl border border-teal-200/15 bg-black/25 p-4">
      <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
        <label className="block text-xs text-white/55">歌组名称<input required maxLength={60} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="例如：如果系列 / 串串歌曲" className={`${input} mt-1`} /></label>
        <label className="block text-xs text-white/55">设定说明<textarea maxLength={1000} rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="例如：这几首歌可以用相同的和弦走势弹奏…" className={`${input} mt-1 resize-y`} /></label>
        <div className="flex flex-wrap gap-2">{draft.songIds.map(id => {
          const song = catalogSongs.find(item => item.id === id);
          return <button key={id} type="button" aria-label={`从歌组移除${song?.title ?? id}`} onClick={() => setDraft({ ...draft, songIds: draft.songIds.filter(value => value !== id) })} className={button}>{song?.title ?? '歌库中已移除的歌曲'}<X size={12} /></button>;
        })}</div>
        <input aria-label="搜索歌组歌曲" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索歌名或歌手，从歌库选择歌曲" className={input} />
        {keyword && <div className="max-h-52 space-y-1 overflow-y-auto">{results.map(song => <button key={song.id} type="button" disabled={draft.songIds.includes(song.id) || draft.songIds.length >= 50} onClick={() => setDraft({ ...draft, songIds: [...draft.songIds, song.id] })} className="flex w-full items-center justify-between gap-3 rounded-lg bg-black/25 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 disabled:opacity-35"><span>{song.title}<small className="ml-2 text-white/35">{song.artist}</small></span><span className="shrink-0 text-xs text-teal-200">{draft.songIds.includes(song.id) ? '已选择' : '添加'}</span></button>)}{!results.length && <p className="text-xs text-white/35">没有匹配的歌曲。</p>}</div>}
        <div className="flex flex-wrap items-center gap-2"><button type="submit" disabled={!snapshot || !draft.name.trim() || !draft.songIds.length} className={`${button} bg-teal-200/10`}>{busy ? '保存中…' : '保存歌组'}</button><button type="button" onClick={() => setDraft(null)} className={button}>取消</button><span className="text-xs text-white/35">已选 {draft.songIds.length}/50 首 · 不影响其他板块</span></div>
      </fieldset>
    </form>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{snapshot?.groups.map(group => <article key={group.id} className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-4">
      <header className="flex items-center justify-between gap-2"><h5 className="min-w-0 break-words font-bold text-teal-50">{group.name}<small className="ml-2 text-xs font-normal text-white/35">{group.songIds.length} 首</small></h5>{managing && <div className="flex shrink-0 gap-2"><button type="button" disabled={busy || Boolean(draft)} aria-label={`编辑${group.name}`} onClick={() => { setDraft({ ...group, songIds: [...group.songIds] }); setQuery(''); }} className="p-1 text-white/40 hover:text-teal-100 disabled:opacity-30"><Pencil size={15} /></button><button type="button" disabled={busy || Boolean(draft)} aria-label={`删除${group.name}`} onClick={() => { if (window.confirm(`删除“${group.name}”歌组？所有路演中都会移除该组，但不会删除歌曲。`)) void persist(snapshot.groups.filter(item => item.id !== group.id)); }} className="p-1 text-white/40 hover:text-red-200 disabled:opacity-30"><Trash2 size={15} /></button></div>}</header>
      {group.description && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-white/45">{group.description}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{group.songIds.map(id => {
        const song = catalogSongs.find(item => item.id === id);
        return <button key={id} type="button" disabled={!song} title={song?.artist} onClick={() => song && onOpenSong(song)} className={`${button} max-w-full text-left disabled:opacity-35`}><span className="truncate">{song?.title ?? '歌库中已移除的歌曲'}</span></button>;
      })}</div>
    </article>)}</div>
    {snapshot && !snapshot.groups.length && !draft && <p className="py-5 text-center text-xs text-white/35">还没有歌组，试试创建“如果”系列，或记录一组相同和弦的串烧歌曲。</p>}
  </section>;
}
