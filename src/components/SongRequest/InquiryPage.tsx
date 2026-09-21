import { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, MessageCircle, PenLine, Plus, Trash2 } from 'lucide-react';
import { pullInquiries, saveInquiries, type Credentials, type InquiryEntry, type InquirySnapshot } from './songRequestCloud';

const topics = [
  { id: 'philosophy', title: '哲学人生', subtitle: '关于生活，也关于自己' },
  { id: 'poetry', title: '诗词上下句', subtitle: '在字句之间，寻一声回响' },
  { id: 'internet', title: '网络世界', subtitle: '记录屏幕另一端的好奇' },
  { id: 'memes', title: '梗指南', subtitle: '笑过之后，也想知道来由' },
] as const;

export default function InquiryPage({ session }: { session: Credentials }) {
  const [snapshot, setSnapshot] = useState<InquirySnapshot>({ revision: 0, entries: [] });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState<InquiryEntry | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    pullInquiries(session).then((value) => { if (active) { setSnapshot(value); setLoaded(true); setError(''); } })
      .catch(() => { if (active) setError('读取失败，请重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, retry]);
  const persist = async (entries: InquiryEntry[]) => {
    if (busy || !loaded) return;
    setBusy(true);
    setError('');
    try { setSnapshot(await saveInquiries(session, snapshot.revision, entries)); setDraft(null); }
    catch (err) { setError(err instanceof Error && err.message === 'CONFLICT' ? '另一处已更新内容。请先复制保留当前输入，再返回此页重新读取后编辑。' : '保存失败，当前输入已保留，请重试。'); }
    finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-4xl pb-12">
    <header className="mb-9 pt-4 sm:pt-8"><MessageCircle className="mb-4 h-6 w-6 text-orange-200/70" /><h1 className="font-serif text-4xl font-black sm:text-5xl">请教</h1><p className="mt-3 text-sm text-white/40">先留一个问题，再慢慢写下自己的理解。</p></header>
    {loading && <p role="status" className="mb-5 text-white/50">正在读取…</p>}
    {error && <p role="alert" className="mb-5 text-sm text-amber-200">{error}{!loaded && <button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 underline">重试</button>}</p>}
    <div className="space-y-4">{topics.map((topic) => {
      const entries = snapshot.entries.filter((entry) => entry.topic === topic.id);
      return <details key={topic.id} className="rounded-3xl border border-white/10 bg-black/25">
        <summary className="flex cursor-pointer list-none items-center gap-4 p-6 [&::-webkit-details-marker]:hidden"><BookOpen className="h-5 w-5 shrink-0 text-orange-200/60" /><span className="flex-1"><strong className="font-serif text-2xl">{topic.title}</strong><span className="mt-1 block text-xs text-white/35">{topic.subtitle}</span></span><span className="text-xs text-white/35">{entries.length}</span><ChevronDown className="h-4 w-4 text-white/40" /></summary>
        <div className="space-y-3 border-t border-white/5 p-4 sm:p-6">
          {entries.map((entry) => <details key={entry.id} className="rounded-2xl border border-white/10 bg-white/[.025]">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden"><span className="whitespace-pre-wrap break-words text-sm font-semibold">{entry.question}</span><ChevronDown className="mt-1 h-4 w-4 shrink-0 text-white/40" /></summary>
            <div className="px-4 pb-4">
              <details className="rounded-xl border border-orange-200/10 bg-orange-300/5"><summary className="cursor-pointer p-3 text-sm text-orange-200/80">我的见解</summary><p className="whitespace-pre-wrap break-words px-4 pb-4 text-sm leading-7 text-white/65">{entry.insight || '还没有写下见解。'}</p></details>
              <div className="mt-3 flex gap-4 text-xs text-white/45"><button type="button" disabled={busy} onClick={() => setDraft({ ...entry })} className="inline-flex items-center gap-1 hover:text-orange-100"><PenLine className="h-3.5 w-3.5" />编辑</button><button type="button" disabled={busy} onClick={() => { if (window.confirm('删除这个问题及其见解？')) void persist(snapshot.entries.filter((item) => item.id !== entry.id)); }} className="inline-flex items-center gap-1 hover:text-red-200"><Trash2 className="h-3.5 w-3.5" />删除</button></div>
            </div>
          </details>)}
          {!entries.length && <p className="py-2 text-sm text-white/35">还没有问题，留待你慢慢添上。</p>}
          {draft?.topic === topic.id ? <form className="space-y-3 rounded-2xl border border-orange-200/20 bg-black/30 p-4" onSubmit={(event) => { event.preventDefault(); if (!draft.question.trim()) return; void persist(snapshot.entries.some((entry) => entry.id === draft.id) ? snapshot.entries.map((entry) => entry.id === draft.id ? draft : entry) : [...snapshot.entries, draft]); }}>
            <label className="block text-xs text-orange-100/70">问题<textarea required maxLength={1000} disabled={busy} value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows={3} className="mt-2 block w-full rounded-xl border border-white/15 bg-black/25 p-3 text-sm text-white outline-none focus:border-orange-200/50" /></label>
            <label className="block text-xs text-orange-100/70">我的见解<textarea maxLength={10000} disabled={busy} value={draft.insight} onChange={(event) => setDraft({ ...draft, insight: event.target.value })} rows={6} placeholder="可以先空着，想好后再补充" className="mt-2 block w-full rounded-xl border border-white/15 bg-black/25 p-3 text-sm text-white outline-none focus:border-orange-200/50" /></label>
            <div className="flex gap-3"><button type="submit" disabled={busy || !draft.question.trim()} className="rounded-xl bg-orange-300 px-5 py-2 text-sm font-bold text-black disabled:opacity-40">{busy ? '保存中…' : '保存'}</button><button type="button" disabled={busy} onClick={() => setDraft(null)} className="px-3 text-sm text-white/50">取消</button></div>
          </form> : <button type="button" disabled={!loaded || busy || snapshot.entries.length >= 200} onClick={() => setDraft({ id: crypto.randomUUID(), topic: topic.id, question: '', insight: '' })} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-orange-200/20 px-4 py-3 text-sm text-orange-200/70 disabled:opacity-30"><Plus className="h-4 w-4" />添加问题</button>}
        </div>
      </details>;
    })}</div>
  </section>;
}
