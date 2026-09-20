import { useEffect, useRef, useState } from 'react';
import { Check, PenLine, Plus, Tag, X } from 'lucide-react';
import { isFeaturedSongManager } from './songRequest';
import { pullArtistTags, saveArtistTags, pullSongTags, saveSongTags, type Credentials } from './songRequestCloud';

export default function ArtistTagsDialog({ artist, songId, session, onClose, onSaved }: {
  artist: string; songId?: string; session: Credentials | null; onClose: () => void; onSaved?: (tags: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const canEdit = Boolean(session && isFeaturedSongManager(session.alias));
  const label = songId ? '歌曲标签' : '歌手标签';

  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    (songId ? pullSongTags(songId) : pullArtistTags(artist)).then((value) => { if (active) { setTags(value); setLoading(false); } })
      .catch(() => { if (active) { setError('标签读取失败，请关闭后重试。'); setLoading(false); } });
    return () => { active = false; };
  }, [artist, songId]);

  const value = draft.trim();
  const hasDraft = editingTag !== null || Boolean(value);
  const validDraft = Boolean(value) && !tags.some((tag) => tag === value && tag !== editingTag)
    && (editingTag !== null || tags.length < 30);
  const applyDraft = () => editingTag === null ? [...tags, value] : tags.map((tag) => tag === editingTag ? value : tag);
  const addTag = () => {
    if (!canEdit || saving || !validDraft) return;
    setTags(applyDraft());
    setDraft('');
    setEditingTag(null);
    setDirty(true);
  };
  const save = async () => {
    if (!canEdit || !session || saving || (hasDraft && !validDraft)) return;
    setSaving(true);
    try {
      const next = hasDraft ? applyDraft() : tags;
      const saved = await (songId ? saveSongTags(session, songId, next) : saveArtistTags(session, artist, next));
      setTags(saved);
      onSaved?.(saved);
      setDraft('');
      setEditingTag(null);
      setDirty(false);
      setError('');
    } catch { setError('保存失败，修改仍保留在弹窗中，请重试。'); }
    finally { setSaving(false); }
  };

  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}
    aria-labelledby="artist-tags-title"
    className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-[2rem] border border-orange-200/20 bg-[#160e0b] p-7 text-white shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm">
    <button type="button" disabled={saving} aria-label={`关闭${label}`} onClick={onClose} className="absolute right-5 top-5 rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
    <Tag className="mb-5 h-6 w-6 text-orange-200" />
    <h2 id="artist-tags-title" className="pr-8 font-serif text-3xl font-black">{artist}</h2>
    <p className="mt-2 text-xs tracking-widest text-orange-200/50">{label}</p>
    <div className="mt-6 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
      {tags.map((tag) => <span key={tag} className="inline-flex max-w-full items-center gap-2 rounded-full border border-orange-200/20 bg-orange-300/10 px-4 py-2 text-sm text-orange-100">
        <span className="break-all">{tag}</span>
        {canEdit && <button type="button" disabled={saving} aria-label={`编辑标签：${tag}`} title="编辑标签" onClick={() => { setEditingTag(tag); setDraft(tag); input.current?.focus(); }} className="shrink-0 text-orange-100/50 hover:text-white"><PenLine className="h-3.5 w-3.5" /></button>}
        {canEdit && <button type="button" disabled={saving} aria-label={`移除标签：${tag}`} onClick={() => { setTags((current) => current.filter((item) => item !== tag)); if (editingTag === tag) { setEditingTag(null); setDraft(''); } setDirty(true); }} className="shrink-0 text-orange-100/50 hover:text-white"><X className="h-4 w-4" /></button>}
      </span>)}
      {!tags.length && <p className="py-4 text-sm text-white/40">{loading ? '正在读取标签…' : error ? '暂时无法显示标签' : songId ? '这首歌曲还没有标签' : '这位歌手还没有标签'}</p>}
    </div>
    {canEdit && !loading && (!error || dirty || hasDraft) && <div className="mt-6 border-t border-white/10 pt-5">
      {editingTag !== null && <p className="mb-3 flex items-center justify-between text-xs text-orange-100/60">正在编辑标签<button type="button" disabled={saving} onClick={() => { setEditingTag(null); setDraft(''); }} className="hover:text-white">取消编辑</button></p>}
      <form onSubmit={(event) => { event.preventDefault(); addTag(); }} className="flex gap-2">
        <input ref={input} aria-label={editingTag !== null ? '修改标签' : '新标签'} placeholder="输入标签" maxLength={40} disabled={saving || (editingTag === null && tags.length >= 30)} value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm outline-none focus:border-orange-200/50" />
        <button type="submit" aria-label={editingTag !== null ? '确认修改' : '添加标签'} disabled={saving || !validDraft} className="rounded-xl border border-orange-200/20 p-3 text-orange-200 disabled:opacity-30">{editingTag !== null ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}</button>
      </form>
      {hasDraft && value && !validDraft && <p role="status" className="mt-2 text-xs text-amber-200">标签已存在或数量已达上限。</p>}
      <button type="button" onClick={() => void save()} disabled={saving || (!dirty && !hasDraft) || (hasDraft && !validDraft)} className="mt-4 w-full rounded-xl bg-orange-300 py-3 text-sm font-bold text-black disabled:opacity-40">{saving ? '正在保存…' : dirty || hasDraft ? '保存标签' : '已保存'}</button>
    </div>}
    {error && <p role="alert" className="mt-4 text-sm text-amber-200">{error}</p>}
  </dialog>;
}
