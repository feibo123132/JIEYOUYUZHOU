import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Link2, Pencil, Plus, Save, X } from 'lucide-react';
import type { Song } from './songCatalog';
import type { SongGroup, SongMedley } from './songGroups';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-teal-200/25 px-3 py-2 text-xs font-bold text-teal-100 transition hover:bg-teal-200/10 disabled:opacity-35';
const input = 'w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-200/45';

export function SongMedleyEditor({ group, medley, songs, busy, onChange, onSave, onCancel }: {
  group: SongGroup;
  medley: SongMedley;
  songs: Song[];
  busy: boolean;
  onChange: (medley: SongMedley) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const move = (index: number, direction: number) => {
    const songIds = [...medley.songIds];
    const target = index + direction;
    if (target < 0 || target >= songIds.length) return;
    [songIds[index], songIds[target]] = [songIds[target], songIds[index]];
    onChange({ ...medley, songIds });
  };
  return <form onSubmit={event => { event.preventDefault(); onSave(); }} className="mt-4 rounded-2xl border border-teal-200/25 bg-teal-200/[.045] p-4 sm:p-5">
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
      <div><h5 className="flex items-center gap-2 font-serif text-lg font-black text-teal-50"><Link2 size={18} />编排串烧链</h5><p className="mt-1 text-xs text-white/40">{group.name} · 选择适合连续演唱的歌曲，按高潮衔接顺序排列。</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-white/55">链条名称<input required maxLength={60} value={medley.name} onChange={event => onChange({ ...medley, name: event.target.value })} placeholder="例如：高潮串烧 / 雨天情绪线" className={`${input} mt-1`} /></label>
        <label className="block text-xs text-white/55">和弦走向<input maxLength={80} value={medley.chordProgression} onChange={event => onChange({ ...medley, chordProgression: event.target.value })} placeholder="例如：4536251" className={`${input} mt-1 font-mono`} /></label>
      </div>
      <label className="block text-xs text-white/55">衔接说明<textarea rows={2} maxLength={1000} value={medley.notes} onChange={event => onChange({ ...medley, notes: event.target.value })} placeholder="例如：统一选调，第二首直接进副歌，末尾留一小节间奏…" className={`${input} mt-1 resize-y`} /></label>
      <div><p className="mb-2 text-xs text-white/55">从本歌组选择 · 至少 2 首，同一首可加入不同串烧链</p><div className="flex flex-wrap gap-2">{group.songIds.map(id => {
        const song = songs.find(item => item.id === id);
        const selected = medley.songIds.includes(id);
        return <button key={id} type="button" aria-pressed={selected} disabled={!song && !selected} onClick={() => onChange({ ...medley, songIds: selected ? medley.songIds.filter(value => value !== id) : [...medley.songIds, id] })} className={`${button} ${selected ? 'border-teal-200/50 bg-teal-200/15' : 'text-white/50'}`}>{selected ? <Link2 size={12} /> : <Plus size={12} />}{song?.title ?? '歌库中已移除的歌曲'}</button>;
      })}</div></div>
      {medley.songIds.length > 0 && <ol className="space-y-2">{medley.songIds.map((id, index) => <li key={id} className="flex items-center gap-3 rounded-xl border border-teal-200/10 bg-black/25 px-3 py-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-200/10 font-mono text-xs text-teal-200">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-teal-50">{songs.find(song => song.id === id)?.title ?? '歌库中已移除的歌曲'}</span>
        <button type="button" disabled={index === 0} aria-label={`第${index + 1}首前移`} onClick={() => move(index, -1)} className="rounded-lg p-2 text-teal-100 hover:bg-white/10 disabled:opacity-25"><ArrowUp size={15} /></button>
        <button type="button" disabled={index === medley.songIds.length - 1} aria-label={`第${index + 1}首后移`} onClick={() => move(index, 1)} className="rounded-lg p-2 text-teal-100 hover:bg-white/10 disabled:opacity-25"><ArrowDown size={15} /></button>
        <button type="button" aria-label={`移除第${index + 1}首`} onClick={() => onChange({ ...medley, songIds: medley.songIds.filter(value => value !== id) })} className="rounded-lg p-2 text-white/40 hover:bg-white/10"><X size={15} /></button>
      </li>)}</ol>}
      {medley.lyrics && <p className="text-xs text-amber-100/65">这条链已有歌词，更改歌曲或顺序后，请在歌词板同步调整段落。</p>}
      <div className="flex flex-wrap items-center gap-2"><button type="submit" disabled={!medley.name.trim() || medley.songIds.length < 2} className={`${button} bg-teal-200/10`}><Save size={14} />{busy ? '保存中…' : '保存串烧链'}</button><button type="button" onClick={onCancel} className={button}>取消</button><span className="text-xs text-white/35">已串联 {medley.songIds.length} 首 · 保存后可填写整条链的歌词</span></div>
    </fieldset>
  </form>;
}

export function SongMedleyLyrics({ group, medley, songs, managing, busy, saveStatus, onSave, onClose, onDirtyChange }: {
  group: SongGroup;
  medley: SongMedley;
  songs: Song[];
  managing: boolean;
  busy: boolean;
  saveStatus?: string;
  onSave: (lyrics: string) => Promise<boolean>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [lyrics, setLyrics] = useState(medley.lyrics);
  const [editing, setEditing] = useState(!medley.lyrics.trim());
  const [fontSize, setFontSize] = useState(18);
  const outline = medley.songIds.map(id => `《${songs.find(song => song.id === id)?.title ?? '歌库中已移除的歌曲'}》\n`).join('\n');
  useEffect(() => { onDirtyChange(managing && editing && lyrics !== medley.lyrics); }, [lyrics, medley.lyrics, managing, editing, onDirtyChange]);
  const save = async () => {
    if (await onSave(lyrics)) {
      setLyrics(lyrics.trim());
      setEditing(false);
      onDirtyChange(false);
    }
  };
  return <section aria-label={`${medley.name}串烧歌词`} className="mt-4 scroll-mt-6 rounded-2xl border border-teal-200/25 bg-[#0c1614] p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-teal-200/20 bg-teal-200/10 text-teal-100"><FileText size={20} /></span><div><p className="text-[10px] font-bold tracking-[.16em] text-teal-200/50">{group.name} / {medley.name}</p><h5 className="mt-1 font-serif text-xl font-black text-teal-50">串烧歌词板</h5><p className="mt-1 text-xs text-white/40">一次展开，连续演唱。支持歌曲分段、和弦标记和衔接提示。</p></div></div>
      <button type="button" disabled={busy} aria-label="关闭串烧歌词板" onClick={onClose} className="rounded-full p-2 text-white/40 transition hover:bg-white/10 hover:text-white disabled:opacity-35"><X size={18} /></button>
    </header>
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs leading-6 text-teal-100/70">{medley.chordProgression && <span className="mr-1 rounded-full border border-teal-200/20 bg-teal-200/10 px-3 py-1 font-mono tracking-wider text-teal-100">{medley.chordProgression}</span>}{medley.songIds.map((id, index) => <span key={id} className="inline-flex max-w-full items-center gap-2">{index > 0 && <Link2 size={13} className="shrink-0 text-teal-200/35" />}<span className="break-words">{index + 1}. {songs.find(song => song.id === id)?.title ?? '歌库中已移除的歌曲'}</span></span>)}</div>
    {medley.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border-l-2 border-teal-200/30 bg-teal-200/[.04] px-3 py-2 text-xs leading-6 text-white/55">{medley.notes}</p>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 text-xs text-white/45"><span className="mr-1">歌词字号</span><button type="button" aria-label="缩小歌词字号" disabled={fontSize <= 14} onClick={() => setFontSize(value => value - 2)} className="rounded-lg px-2.5 py-2 hover:bg-white/10 disabled:opacity-25">A−</button><span className="w-6 text-center font-mono">{fontSize}</span><button type="button" aria-label="放大歌词字号" disabled={fontSize >= 30} onClick={() => setFontSize(value => value + 2)} className="rounded-lg px-2.5 py-2 hover:bg-white/10 disabled:opacity-25">A+</button></div>
      {managing && <div className="flex flex-wrap gap-2">{editing ? <><button type="button" disabled={busy} onClick={() => { setLyrics(medley.lyrics); setEditing(false); }} className={button}>取消编辑</button><button type="button" disabled={busy} onClick={() => void save()} className={`${button} border-teal-200 bg-teal-200 !text-[#0c1614] hover:bg-teal-100`}><Save size={14} />{busy ? '保存中…' : '保存歌词'}</button></> : <button type="button" disabled={busy} onClick={() => { setLyrics(medley.lyrics); setEditing(true); }} className={button}><Pencil size={14} />编辑歌词</button>}</div>}
    </div>
    {managing && editing ? <>
      <textarea aria-label="整条串烧链的歌词" value={lyrics} onChange={event => setLyrics(event.target.value)} disabled={busy} maxLength={12000} placeholder={`${outline}\n按演唱顺序粘贴每首歌要唱的段落，可以在段落间加入衔接提示…`} style={{ fontSize, lineHeight: 1.9 }} className="mt-3 min-h-72 w-full resize-y rounded-2xl border border-white/10 bg-black/35 p-4 text-white/85 outline-none transition placeholder:text-white/20 focus:border-teal-200/45 disabled:opacity-60 sm:p-5" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/35">{!lyrics.trim() ? <button type="button" disabled={busy} onClick={() => setLyrics(outline)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-teal-100/65 hover:bg-white/5 disabled:opacity-35"><Plus size={12} />填入歌名分段</button> : <span>按此处顺序连续显示，请只保留需要演唱的段落。</span>}<span>{lyrics.length} / 12000 · {lyrics !== medley.lyrics ? '有未保存修改' : '与当前歌词一致'}</span></div>
    </> : medley.lyrics.trim() ? <div style={{ fontSize, lineHeight: 1.9 }} className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/35 p-4 font-sans text-white/85 sm:p-6">{medley.lyrics}</div> : <div className="mt-3 rounded-2xl border border-dashed border-teal-200/15 bg-black/20 p-8 text-center text-sm text-white/35">还没有串烧歌词{managing ? '，点击“编辑歌词”粘贴各首高潮段落。' : '，等待管理员补充。'}</div>}
    {saveStatus && <p role="status" className="mt-3 text-xs text-teal-100/70">{saveStatus}</p>}
    <p className="mt-3 text-[10px] text-teal-100/40">整条链单独保存 · 所有路演共用</p>
  </section>;
}
