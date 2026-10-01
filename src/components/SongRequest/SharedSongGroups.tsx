import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Layers3, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Song } from './songCatalog';
import { initializeSongGroupMedleys, type SongGroup, type SongGroupsSnapshot, type SongMedley } from './songGroups';
import { SongMedleyEditor, SongMedleyLyrics } from './SongMedleyPanel';
import SongGroupRoundsDialog from './SongGroupRoundsDialog';
import { pullSongGroups, saveSongGroups } from './songRequestCloud';
import { readBrowserSongRecordSession } from './songRecords';
import type { RoadshowRecord } from './roadshow';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-teal-200/25 px-3 py-2 text-xs font-bold text-teal-100 transition hover:bg-teal-200/10 disabled:opacity-35';
const input = 'w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-200/45';

export default function SharedSongGroups({ catalogSongs, managing, onOpenSong, record, records, roundsBusy, onSaveRounds }: {
  catalogSongs: Song[];
  managing: boolean;
  onOpenSong: (song: Song) => void;
  record: RoadshowRecord;
  records: RoadshowRecord[];
  roundsBusy: boolean;
  onSaveRounds: (record: RoadshowRecord) => Promise<boolean>;
}) {
  const [snapshot, setSnapshot] = useState<SongGroupsSnapshot | null>(null);
  const [draft, setDraft] = useState<SongGroup | null>(null);
  const [medleyDraft, setMedleyDraft] = useState<{ groupId: string; group: SongGroup; medley: SongMedley } | null>(null);
  const [activeMedley, setActiveMedley] = useState<{ groupId: string; medleyId: string; group: SongGroup; medley: SongMedley } | null>(null);
  const [lyricsDirty, setLyricsDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [activeRoundsGroupId, setActiveRoundsGroupId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<{ groupId: string; songId: string } | null>(null);
  const lyricsBoard = useRef<HTMLDivElement>(null);
  const groups = (snapshot?.groups ?? []).map(group => initializeSongGroupMedleys(group, catalogSongs));
  const formOpen = Boolean(draft || medleyDraft);
  const activeGroup = groups.find(group => group.id === activeMedley?.groupId) ?? activeMedley?.group;
  const selectedMedley = activeGroup?.medleys?.find(medley => medley.id === activeMedley?.medleyId) ?? activeMedley?.medley;
  const activeMedleyKey = activeMedley ? `${activeMedley.groupId}/${activeMedley.medleyId}` : '';
  const medleyDraftGroup = groups.find(group => group.id === medleyDraft?.groupId) ?? medleyDraft?.group;
  const pageCount = Math.max(1, Math.ceil((snapshot?.groups.length ?? 0) / 6));
  const currentPage = Math.min(page, pageCount);
  const visibleGroups = groups.slice((currentPage - 1) * 6, currentPage * 6);
  useEffect(() => { setPage(value => Math.min(value, pageCount)); }, [pageCount]);
  const saving = useRef(false);
  useEffect(() => {
    if (!activeMedleyKey) return;
    const frame = requestAnimationFrame(() => lyricsBoard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [activeMedleyKey]);
  useEffect(() => {
    let active = true;
    setStatus('正在加载共享歌组…');
    pullSongGroups().then(value => { if (active) { setSnapshot(value); setStatus(''); } })
      .catch(() => { if (active) setStatus('共享歌组加载失败，请重试；若功能刚更新，请先部署 songRequestSync 云函数。'); });
    return () => { active = false; };
  }, [reload]);

  const persist = async (nextGroups: SongGroup[]): Promise<boolean> => {
    if (!snapshot || saving.current || !managing) return false;
    const credentials = readBrowserSongRecordSession();
    if (!credentials) { setStatus('请先解锁管理员档案，再保存共享歌组。'); return false; }
    saving.current = true;
    setBusy(true);
    try {
      const saved = await saveSongGroups(credentials, { ...snapshot, groups: nextGroups });
      if (nextGroups.some(group => group.medleys !== undefined && !Array.isArray(saved.groups.find(item => item.id === group.id)?.medleys))) {
        setSnapshot(current => current ? { ...current, revision: saved.revision } : saved);
        throw new Error('MEDLEYS_UNSUPPORTED');
      }
      setSnapshot(saved);
      if (draft && !snapshot.groups.some(group => group.id === draft.id)) setPage(Math.max(1, Math.ceil(saved.groups.length / 6)));
      setDraft(null);
      setMedleyDraft(null);
      setStatus('已同步，所有路演共用。');
      return true;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'CONFLICT') {
        try { setSnapshot(await pullSongGroups()); } catch {
          setStatus('其他设备已修改歌组，但最新列表加载失败。草稿已保留，请检查网络后重试。');
          return false;
        }
        setStatus('其他设备已修改歌组，未覆盖云端内容。草稿已保留，请核对最新列表后重新保存。');
      } else setStatus(code === 'MEDLEYS_UNSUPPORTED'
        ? '云函数尚未支持串烧链，请更新 songRequestSync 后重试。草稿已保留。'
        : code === 'AUTH_FAILED' || code === 'NOT_REGISTERED'
        ? '请使用歌库管理员的档案保存共享歌组。草稿已保留。'
        : '保存失败，草稿已保留，请重试并确认云函数已更新。');
      return false;
    } finally { saving.current = false; setBusy(false); }
  };
  const moveSong = (groupId: string, songId: string, targetIndex: number) => {
    if (!managing || !editing || !snapshot || saving.current || formOpen) return;
    const group = groups.find(item => item.id === groupId);
    if (!group) return;
    const from = group.songIds.indexOf(songId);
    if (from < 0 || targetIndex < 0 || targetIndex >= group.songIds.length || from === targetIndex) return;
    const songIds = [...group.songIds];
    songIds.splice(from, 1);
    songIds.splice(targetIndex, 0, songId);
    void persist(groups.map(item => item.id === groupId ? { ...item, songIds } : item));
  };
  const closeLyrics = () => {
    if (lyricsDirty && !window.confirm('串烧歌词有未保存的修改，确定放弃这些修改？')) return false;
    setActiveMedley(null);
    setLyricsDirty(false);
    return true;
  };
  const openLyrics = (groupId: string, medleyId: string) => {
    if (activeMedley?.groupId !== groupId || activeMedley.medleyId !== medleyId) {
      if (!closeLyrics()) return;
      const group = groups.find(item => item.id === groupId);
      const medley = group?.medleys?.find(item => item.id === medleyId);
      if (!group || !medley) return;
      setActiveMedley({ groupId, medleyId, group, medley });
    }
    requestAnimationFrame(() => lyricsBoard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const editMedley = (group: SongGroup, medley?: SongMedley) => {
    if (!closeLyrics()) return;
    setMedleyDraft({ groupId: group.id, group, medley: medley
      ? { ...medley, songIds: [...medley.songIds] }
      : { id: crypto.randomUUID(), name: '', chordProgression: '', notes: '', songIds: [], lyrics: '' } });
  };
  const keyword = query.trim().toLocaleLowerCase();
  const results = keyword ? catalogSongs.filter(song => `${song.title} ${song.artist}`.toLocaleLowerCase().includes(keyword)).slice(0, 20) : [];

  return <section className="mt-5 rounded-2xl border border-teal-200/20 bg-teal-300/[.035] p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="flex items-center gap-2 font-serif text-lg font-black text-teal-100"><Layers3 size={18} />趣味歌组<small className="font-sans text-xs font-normal text-white/40">所有路演共用</small></h4><p className="mt-1 text-xs text-white/40">收集歌曲的巧妙联系，用串烧链连接能连续演唱的高潮段落。</p></div>
      {managing && <div className="flex items-center gap-2"><button type="button" disabled={!snapshot || busy || formOpen || snapshot.groups.length >= 50} onClick={() => { if (!closeLyrics()) return; setDraft({ id: crypto.randomUUID(), name: '', description: '', songIds: [] }); setQuery(''); }} className={button}><Plus size={14} />新建</button><button type="button" aria-pressed={editing} disabled={busy || formOpen} onClick={() => setEditing(value => !value)} className={`${button} ${editing ? 'bg-teal-200/15 border-teal-200/50' : ''}`}><Pencil size={14} />{editing ? '完成' : '编辑'}</button></div>}
    </header>
    {status && <p role="status" className="mt-3 text-xs text-teal-100/70">{status}</p>}
    {!snapshot && <button type="button" onClick={() => setReload(value => value + 1)} className={`${button} mt-3`}>重新加载</button>}
    {managing && draft && <form onSubmit={event => { event.preventDefault(); if (draft.name.trim() && draft.songIds.length && snapshot) void persist(groups.some(group => group.id === draft.id) ? groups.map(group => group.id === draft.id ? draft : group) : [...groups, draft]); }} className="mt-4 rounded-xl border border-teal-200/15 bg-black/25 p-4">
      <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
        <label className="block text-xs text-white/55">歌组名称<input required maxLength={60} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="例如：如果系列 / 串串歌曲" className={`${input} mt-1`} /></label>
        <label className="block text-xs text-white/55">设定说明<textarea maxLength={1000} rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="例如：这几首歌可以用相同的和弦走势弹奏…" className={`${input} mt-1 resize-y`} /></label>
        <div className="flex flex-wrap gap-2">{draft.songIds.map(id => {
          const song = catalogSongs.find(item => item.id === id);
          const linked = draft.medleys?.some(medley => medley.songIds.includes(id));
          return <button key={id} type="button" disabled={linked} title={linked ? '请先编辑串烧链，移除该曲后再从歌组删除' : undefined} aria-label={`从歌组移除${song?.title ?? id}`} onClick={() => setDraft({ ...draft, songIds: draft.songIds.filter(value => value !== id) })} className={button}>{song?.title ?? '歌库中已移除的歌曲'}{linked ? <Link2 size={12} /> : <X size={12} />}</button>;
        })}</div>
        {draft.medleys?.length > 0 && <p className="text-xs text-white/35">链内歌曲已标记连接符号；需要移除时，请先编辑相应串烧链。</p>}
        <input aria-label="搜索歌组歌曲" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索歌名或歌手，从歌库选择歌曲" className={input} />
        {keyword && <div className="max-h-52 space-y-1 overflow-y-auto">{results.map(song => <button key={song.id} type="button" disabled={draft.songIds.includes(song.id) || draft.songIds.length >= 50} onClick={() => setDraft({ ...draft, songIds: [...draft.songIds, song.id] })} className="flex w-full items-center justify-between gap-3 rounded-lg bg-black/25 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 disabled:opacity-35"><span>{song.title}<small className="ml-2 text-white/35">{song.artist}</small></span><span className="shrink-0 text-xs text-teal-200">{draft.songIds.includes(song.id) ? '已选择' : '添加'}</span></button>)}{!results.length && <p className="text-xs text-white/35">没有匹配的歌曲。</p>}</div>}
        <div className="flex flex-wrap items-center gap-2"><button type="submit" disabled={!snapshot || !draft.name.trim() || !draft.songIds.length} className={`${button} bg-teal-200/10`}>{busy ? '保存中…' : '保存歌组'}</button><button type="button" onClick={() => setDraft(null)} className={button}>取消</button><span className="text-xs text-white/35">已选 {draft.songIds.length}/50 首 · 不影响其他板块</span></div>
      </fieldset>
    </form>}
    {managing && medleyDraft && medleyDraftGroup && <SongMedleyEditor group={medleyDraftGroup} medley={medleyDraft.medley} songs={catalogSongs} busy={busy}
      onChange={medley => setMedleyDraft({ ...medleyDraft, medley })}
      onCancel={() => setMedleyDraft(null)}
      onSave={() => {
        const { groupId, medley } = medleyDraft;
        if (!medley.name.trim() || medley.songIds.length < 2) return;
        if (!groups.some(group => group.id === groupId)) { setStatus('该歌组已在其他设备删除，串烧草稿已保留，请先复制需要的内容。'); return; }
        void persist(groups.map(group => group.id === groupId ? { ...group, medleys: group.medleys?.some(item => item.id === medley.id)
          ? group.medleys.map(item => item.id === medley.id ? medley : item) : [...(group.medleys ?? []), medley] } : group)).then(saved => {
            if (saved) setActiveMedley({ groupId, medleyId: medley.id, group: medleyDraftGroup, medley });
          });
      }} />}
    <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">{visibleGroups.map(group => {
      const medleys = group.medleys ?? [];
      const linkedIds = new Set(medleys.flatMap(medley => medley.songIds));
      const displaySongIds = managing && editing ? group.songIds : group.songIds.filter(id => !linkedIds.has(id));
      return <article key={group.id} className={`min-w-0 rounded-xl border border-white/10 bg-black/25 p-4 ${!editing ? 'cursor-pointer transition hover:border-teal-200/35 hover:bg-teal-200/[.045]' : ''}`}
        onClick={(event) => { if (!editing && !(event.target as HTMLElement).closest('button,input,textarea,select,a')) setActiveRoundsGroupId(group.id); }}>
      <header className="flex flex-wrap items-center justify-between gap-2"><h5 className="min-w-0 flex-1 break-words font-bold text-teal-50">{group.name}<small className="ml-2 text-xs font-normal text-white/35">{group.songIds.length} 首</small></h5><button type="button" onClick={() => setActiveRoundsGroupId(group.id)} aria-label={`打开${group.name}轮次编排`} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-teal-100/55 hover:bg-teal-200/10 hover:text-teal-100">编排轮次<ChevronRight size={13} /></button>{managing && editing && <div className="flex shrink-0 gap-2"><button type="button" disabled={busy || formOpen} aria-label={`编辑${group.name}`} onClick={() => { if (!closeLyrics()) return; setDraft({ ...group, songIds: [...group.songIds] }); setQuery(''); }} className="p-1 text-white/40 hover:text-teal-100 disabled:opacity-30"><Pencil size={15} /></button><button type="button" disabled={busy || formOpen} aria-label={`删除${group.name}`} onClick={() => { if (window.confirm(`删除“${group.name}”歌组及其串烧歌词？所有路演中都会移除该组，但不会删除歌曲。`) && (activeMedley?.groupId !== group.id || closeLyrics())) void persist(groups.filter(item => item.id !== group.id)); }} className="p-1 text-white/40 hover:text-red-200 disabled:opacity-30"><Trash2 size={15} /></button></div>}</header>
      {group.description && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-white/45">{group.description}</p>}
      {medleys.length > 0 && <div className="mt-3 space-y-3">{medleys.map(medley => {
        const selected = activeMedley?.groupId === group.id && activeMedley.medleyId === medley.id;
        return <div key={medley.id} className={`rounded-xl border p-3 transition ${selected ? 'border-teal-200/45 bg-teal-200/[.09]' : 'border-teal-200/20 bg-teal-200/[.045]'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h6 className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold text-teal-100"><Link2 size={14} /><span className="break-words">{medley.name}</span>{medley.chordProgression && <span className="break-all rounded-md border border-teal-200/15 bg-black/20 px-2 py-0.5 font-mono tracking-wider text-teal-200/80">{medley.chordProgression}</span>}</h6>{managing && editing && <div className="flex gap-2"><button type="button" aria-label={`编辑${medley.name}串烧链`} disabled={busy || formOpen} onClick={() => editMedley(group, medley)} className="p-1 text-teal-100/55 hover:text-teal-100 disabled:opacity-30"><Pencil size={14} /></button><button type="button" aria-label={`删除${medley.name}串烧链`} disabled={busy || formOpen} onClick={() => { if (window.confirm(`删除“${medley.name}”串烧链及其歌词？歌曲仍保留在歌组中。`) && (!selected || closeLyrics())) void persist(groups.map(item => item.id === group.id ? { ...item, medleys: medleys.filter(chain => chain.id !== medley.id) } : item)); }} className="p-1 text-white/40 hover:text-red-200 disabled:opacity-30"><Trash2 size={14} /></button></div>}</div>
          <ol aria-label={`${medley.name}演唱顺序`} className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">{medley.songIds.map((id, index) => {
            const song = catalogSongs.find(item => item.id === id);
            return <li key={id} className="inline-flex max-w-full items-center gap-1">{index > 0 && <Link2 size={16} className="shrink-0 text-teal-200/35" />}<button type="button" disabled={!song} title={song?.artist} onClick={() => song && onOpenSong(song)} className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-teal-200/30 bg-black/20 py-1.5 pl-1.5 pr-3 text-xs font-bold text-teal-50 transition hover:bg-teal-200/10 disabled:opacity-35"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-200/15 font-mono text-[10px] text-teal-200">{index + 1}</span><span className="truncate">{song?.title ?? '歌库中已移除的歌曲'}</span></button></li>;
          })}</ol>
          {medley.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-white/40">{medley.notes}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-teal-200/10 pt-2.5"><span className="text-[10px] text-teal-100/40">{medley.songIds.length} 首连续演唱 · {medley.lyrics.trim() ? '已备歌词' : '待补歌词'}</span><button type="button" aria-expanded={selected} disabled={busy || formOpen} onClick={() => openLyrics(group.id, medley.id)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold text-teal-100 transition hover:bg-teal-200/10 disabled:opacity-35"><FileText size={13} />串烧歌词<ChevronRight size={13} /></button></div>
        </div>;
      })}</div>}
      {displaySongIds.length > 0 && medleys.length > 0 && <p className="mt-3 text-[10px] text-white/35">{managing && editing ? '歌组排序 · 串烧顺序单独编排' : '待串联'}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{displaySongIds.map((id, index) => {
        const song = catalogSongs.find(item => item.id === id);
        if (managing && editing) return <span key={id}
          draggable={!busy && !formOpen}
          onDragStart={(event) => { setDragged({ groupId: group.id, songId: id }); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }}
          onDragEnd={() => setDragged(null)}
          onDragOver={(event) => { if (!busy && !formOpen && dragged?.groupId === group.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
          onDrop={(event) => { event.preventDefault(); if (dragged?.groupId === group.id) moveSong(group.id, dragged.songId, index); setDragged(null); }}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border border-teal-200/25 px-2 py-1 text-xs font-bold text-teal-100 ${!busy && !formOpen ? 'cursor-grab active:cursor-grabbing' : 'opacity-50'} ${dragged?.groupId === group.id && dragged.songId === id ? 'bg-teal-200/20' : ''}`}>
          <button type="button" aria-label={`${song?.title ?? id}前移`} disabled={busy || formOpen || index === 0} onClick={() => moveSong(group.id, id, index - 1)} className="rounded-full p-1.5 hover:bg-teal-200/10 disabled:opacity-25"><ChevronLeft size={14} /></button>
          <span className="truncate">{song?.title ?? '歌库中已移除的歌曲'}</span>
          <button type="button" aria-label={`${song?.title ?? id}后移`} disabled={busy || formOpen || index === group.songIds.length - 1} onClick={() => moveSong(group.id, id, index + 1)} className="rounded-full p-1.5 hover:bg-teal-200/10 disabled:opacity-25"><ChevronRight size={14} /></button>
        </span>;
        return <button key={id} type="button" disabled={!song} title={song?.artist} onClick={() => song && onOpenSong(song)} className={`${button} max-w-full text-left disabled:opacity-35`}><span className="truncate">{song?.title ?? '歌库中已移除的歌曲'}</span></button>;
      })}</div>
      {managing && editing && group.songIds.length >= 2 && <button type="button" disabled={busy || formOpen || medleys.length >= 10} onClick={() => editMedley(group)} className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs text-teal-100/60 transition hover:bg-teal-200/10 hover:text-teal-100 disabled:opacity-30"><Plus size={13} />{medleys.length ? '新增串烧链' : '编排串烧链'}</button>}
    </article>;
    })}</div>
    {activeGroup && selectedMedley && <div ref={lyricsBoard} className="scroll-mt-6"><SongMedleyLyrics key={`${activeGroup.id}/${selectedMedley.id}`} group={activeGroup} medley={selectedMedley} songs={catalogSongs} managing={managing} busy={busy || formOpen} saveStatus={status}
      onDirtyChange={setLyricsDirty} onClose={() => { closeLyrics(); }}
      onSave={async lyrics => {
        if (!groups.some(group => group.id === activeGroup.id && group.medleys?.some(medley => medley.id === selectedMedley.id))) {
          setStatus('这条链已在其他设备删除，歌词草稿已保留，请先复制需要的内容。');
          return false;
        }
        return persist(groups.map(group => group.id === activeGroup.id ? { ...group, medleys: group.medleys!.map(medley => medley.id === selectedMedley.id ? { ...medley, lyrics } : medley) } : group));
      }} /></div>}
    {pageCount > 1 && <nav aria-label="趣味歌组分页" className="mt-5 flex items-center justify-center gap-3 text-xs text-white/45">
      <button type="button" aria-label="上一页歌组" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 hover:bg-white/10 disabled:opacity-25"><ChevronLeft size={14} /></button>
      <span aria-live="polite">{currentPage} / {pageCount}</span>
      <button type="button" aria-label="下一页歌组" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 hover:bg-white/10 disabled:opacity-25"><ChevronRight size={14} /></button>
    </nav>}
    {snapshot && !snapshot.groups.length && !draft && <p className="py-5 text-center text-xs text-white/35">还没有歌组，试试创建“如果”系列，或记录一组相同和弦的串烧歌曲。</p>}
    {activeRoundsGroupId && groups.find(group => group.id === activeRoundsGroupId) && <SongGroupRoundsDialog group={groups.find(group => group.id === activeRoundsGroupId)!} songs={catalogSongs} record={record} records={records} busy={roundsBusy} onSave={onSaveRounds} onClose={() => setActiveRoundsGroupId(null)} />}
  </section>;
}
