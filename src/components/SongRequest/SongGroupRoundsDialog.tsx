import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, ChevronRight, Music2, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import type { Song } from './songCatalog';
import type { SongGroup } from './songGroups';
import type { RoadshowRecord, SongGroupRound } from './roadshow';
import { countCompletedSongGroupRounds, nextSongGroupRoundNumber, removeSongGroupRound, upsertSongGroupRound } from './songGroupRounds';

const control = 'rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs font-bold text-white/75 transition hover:border-teal-200/35 hover:text-teal-100 disabled:cursor-not-allowed disabled:opacity-35';

export default function SongGroupRoundsDialog({ group, songs, record, records, busy, onSave, onClose }: {
  group: SongGroup;
  songs: Song[];
  record: RoadshowRecord;
  records: RoadshowRecord[];
  busy: boolean;
  onSave: (next: RoadshowRecord) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SongGroupRound | null>(null);
  const [query, setQuery] = useState('');
  const [allCatalog, setAllCatalog] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const rounds = (record.funGroupRounds ?? []).filter(item => item.groupId === group.id).sort((a, b) => a.round - b.round);
  const history = useMemo(() => [...records.filter(item => item.id !== record.id), record], [records, record]);
  const completedCounts = useMemo(() => countCompletedSongGroupRounds(history), [history]);
  const attemptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of history) for (const attempt of item.recognitionAttempts ?? []) {
      if (attempt.catalogId) counts[attempt.catalogId] = (counts[attempt.catalogId] ?? 0) + 1;
    }
    return counts;
  }, [history]);
  const catalogById = useMemo(() => new Map(songs.map(song => [song.id, song])), [songs]);
  const choices = (allCatalog ? songs : group.songIds.map(id => catalogById.get(id)).filter((song): song is Song => Boolean(song)))
    .filter(song => `${song.title} ${song.artist}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => (completedCounts[left.id] ?? 0) - (completedCounts[right.id] ?? 0)
      || (attemptCounts[left.id] ?? 0) - (attemptCounts[right.id] ?? 0));
  const roundInUse = draft && (record.funGroupRounds ?? []).some(item => item.id !== draft.id && item.round === draft.round);
  const validDraft = Boolean(draft && Number.isInteger(draft.round) && draft.round > 0 && draft.round <= 9999
    && draft.songIds.length > 0 && draft.songIds.length <= 4 && !roundInUse);

  const close = () => {
    if (working || busy) return;
    if (draft && !window.confirm('放弃尚未保存的轮次编排吗？')) return;
    onClose();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const commit = async (next: RoadshowRecord, success: string): Promise<boolean> => {
    if (working || busy) return false;
    setWorking(true);
    setMessage('正在保存到云端…');
    try {
      const saved = await onSave(next);
      setMessage(saved ? success : '云端尚未保存，请检查路演档案提示后重试。');
      return saved;
    } catch {
      setMessage('保存失败，当前编排仍留在弹窗里，请重试。');
      return false;
    } finally { setWorking(false); }
  };

  const saveDraft = async () => {
    if (!draft || !validDraft) return;
    if (await commit(upsertSongGroupRound(record, draft), `第 ${draft.round} 轮已保存。`)) setDraft(null);
  };
  const toggleSung = async (round: SongGroupRound) => {
    const next = { ...round, sungAt: round.sungAt ? undefined : new Date().toISOString() };
    await commit(upsertSongGroupRound(record, next), next.sungAt ? `第 ${round.round} 轮已记入演唱次数。` : `已撤销第 ${round.round} 轮的演唱记录。`);
  };
  const deleteRound = async (round: SongGroupRound) => {
    if (!window.confirm(`删除第 ${round.round} 轮编排${round.sungAt ? '及其演唱记录' : ''}？`)) return;
    await commit(removeSongGroupRound(record, round.id), `第 ${round.round} 轮已删除。`);
  };
  const toggleChoice = (id: string) => {
    if (!draft) return;
    setDraft({ ...draft, songIds: draft.songIds.includes(id) ? draft.songIds.filter(item => item !== id)
      : draft.songIds.length < 4 ? [...draft.songIds, id] : draft.songIds });
  };
  const moveChoice = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const target = index + direction;
    if (target < 0 || target >= draft.songIds.length) return;
    const songIds = [...draft.songIds];
    [songIds[index], songIds[target]] = [songIds[target], songIds[index]];
    setDraft({ ...draft, songIds });
  };

  return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-label={`${group.name}轮次编排`} className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.6rem] border border-teal-200/25 bg-[#0b1214] text-white shadow-[0_30px_100px_rgba(0,0,0,.6)]">
      <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black tracking-[.2em] text-teal-200/60">FUN SONG ROUNDS · {record.title}</p><h2 className="mt-1 font-serif text-2xl font-black text-teal-50">{group.name}</h2><p className="mt-1 text-xs text-white/40">每轮最多 4 首；准备歌单不会计次，点“标记已唱”后才累计。</p></div>
        <button type="button" aria-label="关闭轮次编排" onClick={close} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/65 hover:bg-white/10"><X size={17} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {group.description && <div className="rounded-xl border border-teal-200/10 bg-teal-200/[.04] p-3"><p className="mb-1 text-[10px] font-bold tracking-wider text-teal-200/50">给游客的线索</p><p className="whitespace-pre-wrap text-xs leading-6 text-white/60">{group.description}</p></div>}
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-bold">轮次安排</h3><p className="mt-0.5 text-xs text-white/40">本场 {rounds.length} 轮 · 已唱 {rounds.filter(item => item.sungAt).length} 轮</p></div><button type="button" disabled={Boolean(draft || working || busy)} onClick={() => { setDraft({ id: crypto.randomUUID(), groupId: group.id, round: nextSongGroupRoundNumber(record), songIds: [] }); setQuery(''); setAllCatalog(false); setMessage(''); }} className="inline-flex h-10 items-center gap-2 rounded-full bg-teal-200 px-4 text-xs font-black text-[#09201e] hover:bg-teal-100 disabled:opacity-40"><Plus size={15} />新增轮次</button></div>
        {rounds.length ? <div className="grid gap-3 sm:grid-cols-2">{rounds.map(round => <article key={round.id} className={`rounded-2xl border p-4 ${round.sungAt ? 'border-emerald-300/25 bg-emerald-300/[.055]' : 'border-white/10 bg-white/[.025]'}`}>
          <div className="flex items-center justify-between gap-2"><strong className="font-serif text-lg">第 {round.round} 轮</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${round.sungAt ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/10 text-white/45'}`}>{round.sungAt ? '已唱' : '待唱'}</span></div>
          <ol className="mt-3 grid grid-cols-2 gap-1.5">{round.songIds.map((id, index) => <li key={id} className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs"><span className="mr-1 text-teal-200/55">{index + 1}.</span><span className="break-words">{catalogById.get(id)?.title ?? '已移出歌库'}</span></li>)}</ol>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={Boolean(working || busy || draft)} onClick={() => setDraft({ ...round, songIds: [...round.songIds] })} className={control}>调整组合</button><button type="button" disabled={Boolean(working || busy || draft)} onClick={() => void toggleSung(round)} className={control}>{round.sungAt ? <><RotateCcw size={13} className="mr-1 inline" />撤销已唱</> : <><Check size={13} className="mr-1 inline" />标记已唱</>}</button><button type="button" aria-label={`删除第${round.round}轮`} disabled={Boolean(working || busy || draft)} onClick={() => void deleteRound(round)} className="ml-auto rounded-lg px-2 text-rose-200/55 hover:bg-rose-300/10 hover:text-rose-100 disabled:opacity-30"><Trash2 size={15} /></button></div>
        </article>)}</div> : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/35">还没有编排轮次。可以先选 4 首，现场唱完再标记。</div>}
        {draft && <div className="rounded-2xl border border-teal-200/30 bg-teal-200/[.045] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-serif text-lg font-black">{rounds.some(item => item.id === draft.id) ? '调整轮次' : '新增轮次'}</h3><button type="button" onClick={() => setDraft(null)} className="text-xs text-white/45 hover:text-white">取消编排</button></div>
          <label className="mt-3 flex items-center gap-2 text-xs text-white/65">轮次编号 <input type="number" min="1" max="9999" value={draft.round} onChange={(event) => setDraft({ ...draft, round: Number(event.target.value) })} className="w-24 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-white outline-none focus:border-teal-200/50" /></label>
          {roundInUse && <p className="mt-1 text-xs text-amber-200">这个轮次编号已被本场其他组合使用。</p>}
          <p className="mt-4 text-xs font-bold text-teal-100">本轮曲目 <span className="font-normal text-white/40">{draft.songIds.length} / 4 · 按演唱顺序排列</span></p>
          <ol className="mt-2 grid gap-2 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => {
            const id = draft.songIds[index];
            return <li key={index} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-2 text-xs"><b className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-200/15 text-teal-100">{index + 1}</b>{id ? <><span className="min-w-0 flex-1 truncate">{catalogById.get(id)?.title ?? '已移出歌库'}</span><button type="button" aria-label={`${index + 1}号歌曲前移`} disabled={index === 0} onClick={() => moveChoice(index, -1)} className="p-1 text-white/45 disabled:opacity-20"><ArrowUp size={14} /></button><button type="button" aria-label={`${index + 1}号歌曲后移`} disabled={index === draft.songIds.length - 1} onClick={() => moveChoice(index, 1)} className="p-1 text-white/45 disabled:opacity-20"><ArrowDown size={14} /></button><button type="button" aria-label={`移除${catalogById.get(id)?.title ?? '歌曲'}`} onClick={() => toggleChoice(id)} className="p-1 text-rose-200/60"><X size={14} /></button></> : <span className="text-white/25">待选择</span>}</li>;
          })}</ol>
          <div className="mt-4 flex flex-wrap items-center gap-2"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌名或歌手" className="h-9 min-w-40 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 text-xs outline-none focus:border-teal-200/50" /><button type="button" aria-pressed={!allCatalog} onClick={() => setAllCatalog(false)} className={`${control} ${!allCatalog ? 'border-teal-200/45 text-teal-100' : ''}`}>本组歌曲</button><button type="button" aria-pressed={allCatalog} onClick={() => setAllCatalog(true)} className={`${control} ${allCatalog ? 'border-teal-200/45 text-teal-100' : ''}`}>全曲库</button></div>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/15 p-1"><div className="grid gap-1 sm:grid-cols-2">{choices.slice(0, 80).map(song => {
            const picked = draft.songIds.includes(song.id);
            return <button key={song.id} type="button" disabled={!picked && draft.songIds.length >= 4} onClick={() => toggleChoice(song.id)} className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition ${picked ? 'bg-teal-200/15 text-teal-50' : 'text-white/65 hover:bg-white/10 disabled:opacity-30'}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${picked ? 'border-teal-200 bg-teal-200 text-black' : 'border-white/25'}`}>{picked && <Check size={12} />}</span><span className="min-w-0 flex-1 truncate">{song.title}<small className="ml-1 text-white/30">{song.artist}</small></span><span className="shrink-0 text-[10px] text-white/35">已唱 {completedCounts[song.id] ?? 0}</span></button>;
          })}</div>{!choices.length && <p className="p-4 text-center text-xs text-white/35">没有匹配的歌曲</p>}</div>
          <div className="mt-4 flex items-center justify-end gap-2"><span className="mr-auto text-[11px] text-white/35">保存准备歌单后，唱完再标记已唱。</span><button type="button" disabled={!validDraft || busy || working} onClick={() => void saveDraft()} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-teal-200 px-4 text-xs font-black text-[#09201e] disabled:opacity-40"><Save size={14} />保存本轮</button></div>
        </div>}
        <div><h3 className="flex items-center gap-2 text-base font-bold"><Music2 size={16} className="text-teal-200" />歌曲使用记录</h3><p className="mt-1 text-xs text-white/40">“歌组已唱”只统计标记已唱的轮次；旧有听歌识曲答题次数单独展示。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{group.songIds.map(id => {
            const song = catalogById.get(id);
            return <div key={id} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs"><span className="min-w-0 flex-1 truncate font-bold text-white/80">{song?.title ?? '已移出歌库'}</span><span className="shrink-0 text-teal-100">已唱 {completedCounts[id] ?? 0}</span><span className="shrink-0 text-white/35">答题 {attemptCounts[id] ?? 0}</span></div>;
          })}</div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs sm:px-6"><span role="status" className="min-w-0 flex-1 text-teal-100/70">{message || '轮次随当前路演档案保存到云端。'}</span><button type="button" onClick={close} disabled={busy || working} className="inline-flex items-center gap-1 text-white/60 hover:text-white disabled:opacity-30">完成<ChevronRight size={14} /></button></footer>
    </section>
  </div>, document.body);
}
