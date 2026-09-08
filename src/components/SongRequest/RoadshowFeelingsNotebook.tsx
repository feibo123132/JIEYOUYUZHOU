import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Save, Search } from 'lucide-react';
import { pullFeelingsNotebook, saveFeelingsNotebook, type Credentials } from './songRequestCloud';
import { mergeNotebookPages, notebookCacheKey, readNotebookDraft, searchNotebook, type FeelingsNotebook, type NotebookDraft } from './feelingsNotebook';
import type { RoadshowRecord } from './roadshow';

const buttonStyle = 'inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-white/15 px-3 text-xs font-bold text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30';

export default function RoadshowFeelingsNotebook({ credentials, records }: { credentials: Credentials; records: RoadshowRecord[] }) {
  const [draft, setDraft] = useState<NotebookDraft>(() => {
    const cached = readNotebookDraft(localStorage, credentials.alias);
    if (cached) return cached;
    const pages = records.filter(record => record.feelings?.trim()).sort((a, b) => a.date.localeCompare(b.date))
      .map(record => ({ id: `legacy:${record.id}`, title: `${record.date} · ${record.title}`, text: record.feelings! }));
    if (!pages.length) pages.push({ id: 'page-1', title: '', text: '' });
    return { notebook: { version: 1, revision: 0, pages }, dirty: false, pageId: pages[0].id };
  });
  const draftRef = useRef(draft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('正在读取共享笔记本…');
  const [conflict, setConflict] = useState<FeelingsNotebook | null>(null);
  const [query, setQuery] = useState('');
  const [hitIndex, setHitIndex] = useState(-1);
  const markerRef = useRef<HTMLElement>(null);
  const { pages } = draft.notebook;
  const pageIndex = Math.max(0, pages.findIndex(page => page.id === draft.pageId));
  const page = pages[pageIndex];
  const hits = useMemo(() => searchNotebook(pages, query), [pages, query]);
  const activeHit = hits[hitIndex]?.pageId === page.id ? hits[hitIndex] : null;
  const busy = loading || saving;

  const remember = (next: NotebookDraft) => {
    draftRef.current = next;
    setDraft(next);
    try { localStorage.setItem(notebookCacheKey(credentials.alias), JSON.stringify(next)); }
    catch { setStatus('浏览器无法保存草稿，请及时保存到云端。'); }
  };

  useEffect(() => {
    let active = true;
    pullFeelingsNotebook(credentials).then(cloud => {
      if (!active) return;
      const local = draftRef.current;
      if (local.dirty) {
        if (local.notebook.revision === 0 && cloud.revision === 0) {
          const merged = mergeNotebookPages(cloud.pages, local.notebook.pages);
          if (merged.length <= 100) remember({ ...local, notebook: { ...cloud, pages: merged } });
          else setConflict(cloud);
          setStatus('已有感受和本地草稿均已保留，请检查后保存到云端。');
        } else if (local.notebook.revision !== cloud.revision) {
          setConflict(cloud);
          setStatus('另一台设备已有更新，本地草稿仍保留，请先合并。');
        } else setStatus('已恢复未保存的草稿');
      } else {
        // 首次迁移时保留尚未保存到原路演的本地感受。
        const extraPages = cloud.revision === 0 ? local.notebook.pages.filter(p => p.text.trim() && !cloud.pages.some(c => c.text === p.text))
          .map(p => ({ ...p, id: `draft:${crypto.randomUUID()}`, title: `${p.title} · 本地草稿`.slice(0, 100) })) : [];
        const notebook = { ...cloud, pages: [...cloud.pages, ...extraPages] };
        remember({ notebook, dirty: extraPages.length > 0, pageId: notebook.pages.some(p => p.id === local.pageId) ? local.pageId : notebook.pages[0].id });
        setStatus(cloud.revision === 0 ? '已有感受已汇集，点击保存即可同步共享笔记本。' : '已从云端同步');
      }
    }).catch(() => {
      if (active) setStatus('共享笔记本尚未连接，当前显示本地记录；新增内容可先保留为草稿。');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // 每次进入时同步，输入和翻页不重新拉取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials.alias, credentials.password]);

  useEffect(() => { markerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [page.id, hitIndex, query]);

  const changePage = (id: string) => { remember({ ...draftRef.current, pageId: id }); setHitIndex(-1); };
  const addPage = () => {
    if (busy || pages.length >= 100) return;
    const next = { id: `page:${crypto.randomUUID()}`, title: '', text: '' };
    remember({ notebook: { ...draft.notebook, pages: [...pages, next] }, dirty: true, pageId: next.id });
    setHitIndex(-1);
  };
  const editPage = (field: 'title' | 'text', value: string) => {
    remember({ ...draft, notebook: { ...draft.notebook, pages: pages.map(p => p.id === page.id ? { ...p, [field]: value } : p) }, dirty: true });
    setHitIndex(-1);
  };
  const locate = (index: number) => {
    const hit = hits[index];
    if (!hit) return;
    remember({ ...draftRef.current, pageId: hit.pageId });
    setHitIndex(index);
  };
  const save = async () => {
    if (busy || conflict) return;
    setSaving(true);
    try {
      const saved = await saveFeelingsNotebook(credentials, draft.notebook.revision, pages);
      remember({ notebook: saved, dirty: false, pageId: page.id });
      setStatus('所有页面已保存到云端，在任意一场路演中都能查看。');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'CONFLICT') {
        try { setConflict(await pullFeelingsNotebook(credentials)); } catch {}
        setStatus('云端已有较新记录，草稿已保留，请合并后再保存。');
      } else setStatus(code === 'INVALID_ACTION' ? '云端笔记本功能尚未部署，草稿已保留。' : '保存未成功，草稿已保留，请稍后重试。');
    } finally { setSaving(false); }
  };
  const mergeConflict = () => {
    if (!conflict) return;
    const merged = mergeNotebookPages(conflict.pages, pages);
    if (merged.length > 100) { setStatus('合并后超过 100 页，请先复制保留本地差异，再整理页面。'); return; }
    remember({ notebook: { ...conflict, pages: merged }, dirty: true, pageId: merged[conflict.pages.length]?.id ?? merged[0].id });
    setConflict(null);
    setHitIndex(-1);
    setStatus('云端与本地差异均已保留，请检查后保存。');
  };

  const resultStart = Math.floor(Math.max(0, hitIndex) / 20) * 20;
  return (
    <section className="rounded-[1.75rem] border border-orange-200/15 bg-[#120b08]/85 p-5 sm:p-7" aria-label="共享路演感受笔记本">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-serif text-2xl font-black">路演感受</h3><p className="mt-2 text-xs text-white/40">所有路演共用这本笔记。翻页继续记录，搜索即可定位往日片段。</p></div>
        <button type="button" className={buttonStyle} onClick={addPage} disabled={busy || pages.length >= 100}><Plus className="h-4 w-4" />新增一页</button>
      </div>
      <div className="relative mt-5">
        <Search className="absolute left-3 top-3 h-4 w-4 text-white/35" />
        <input aria-label="检索所有路演感受" value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setHitIndex(-1); }} onKeyDown={event => { if (event.key === 'Enter' && hits.length) { event.preventDefault(); locate((hitIndex + 1) % hits.length); } }} placeholder="检索所有页面的文字，按回车定位…" className="h-10 w-full rounded-xl border border-white/10 bg-black/35 pl-10 pr-4 text-sm outline-none focus:border-orange-300/45" />
      </div>
      {query.trim() && <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/55"><span role="status">{hits.length ? `共 ${hits.length} 处匹配${hitIndex >= 0 ? ` · 当前第 ${hitIndex + 1} 处` : ''}` : '没有找到匹配文字'}</span><div className="flex gap-2"><button type="button" className={buttonStyle} disabled={!hits.length || hitIndex <= 0} onClick={() => locate(hitIndex - 1)}>上一处</button><button type="button" className={buttonStyle} disabled={!hits.length || hitIndex === hits.length - 1} onClick={() => locate(hitIndex + 1)}>下一处</button></div></div>
        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">{hits.slice(resultStart, resultStart + 20).map((hit, i) => <button key={`${hit.pageId}:${hit.start}`} type="button" onClick={() => locate(resultStart + i)} className={`block w-full truncate rounded-lg px-2 py-2 text-left text-xs ${hitIndex === resultStart + i ? 'bg-orange-300/15 text-orange-200' : 'text-white/55 hover:bg-white/5'}`}>第 {hit.pageIndex + 1} 页 · {hit.preview}</button>)}</div>
      </div>}
      <input aria-label="本页标题" value={page.title} maxLength={100} disabled={busy} onChange={event => editPage('title', event.target.value)} placeholder={`第 ${pageIndex + 1} 页 · 添加标题或日期（可选）`} className="mt-5 h-10 w-full border-b border-white/10 bg-transparent text-sm font-bold outline-none focus:border-orange-300/45" />
      {activeHit ? <div className="relative mt-3">
        <div className="h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-orange-200/25 bg-black/35 p-4 text-sm leading-7 text-white/90" aria-label="检索定位结果">{page.text.slice(0, activeHit.start)}<mark ref={markerRef} className="rounded bg-orange-300 px-0.5 text-black">{page.text.slice(activeHit.start, activeHit.end)}</mark>{page.text.slice(activeHit.end)}</div>
        <button type="button" onClick={() => setHitIndex(-1)} className={`${buttonStyle} mt-2`}>编辑本页</button>
      </div> : <textarea aria-label="本页路演感受" value={page.text} maxLength={10000} disabled={busy} onChange={event => editPage('text', event.target.value)} placeholder="今天想记下什么？写满一页，也可以翻到新的一页继续。" className="mt-3 block h-80 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-7 text-white/90 outline-none placeholder:text-white/25 focus:border-orange-300/45 disabled:opacity-50" />}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><button type="button" aria-label="感受上一页" className={buttonStyle} disabled={busy || pageIndex === 0} onClick={() => changePage(pages[pageIndex - 1].id)}><ChevronLeft className="h-4 w-4" />上一页</button><span className="text-xs tabular-nums text-white/60">{pageIndex + 1} / {pages.length}</span><button type="button" aria-label="感受下一页" className={buttonStyle} disabled={busy || (pageIndex === pages.length - 1 && pages.length >= 100)} onClick={() => pageIndex < pages.length - 1 ? changePage(pages[pageIndex + 1].id) : addPage()}>下一页{pageIndex === pages.length - 1 ? '（新页）' : ''}<ChevronRight className="h-4 w-4" /></button></div>
        <span className="text-xs tabular-nums text-white/35">{page.text.length} / 10000{draft.dirty ? ' · 有未同步修改' : ''}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p role="status" className="text-xs text-orange-100/65">{status}</p>
        <div className="flex gap-2">{conflict && <button type="button" className={buttonStyle} onClick={mergeConflict}>保留两份并合并</button>}<button type="button" disabled={busy || Boolean(conflict)} onClick={() => void save()} className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-300 px-5 text-sm font-black text-black disabled:opacity-40"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存到云端'}</button></div>
      </div>
    </section>
  );
}
