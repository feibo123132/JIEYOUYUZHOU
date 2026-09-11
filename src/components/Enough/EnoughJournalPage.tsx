import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Leaf, Lock, Plus, RefreshCw } from 'lucide-react';
import { pullEnoughJournal, saveEnoughJournal, registerRoadshowWorkspace, mapRoadshowSyncError, type Credentials } from '../SongRequest/songRequestCloud';
import { readSongRecordSession, SONG_REQUEST_SESSION_EVENT } from '../SongRequest/songRecords';
import { ROADSHOW_SESSION_KEY } from '../SongRequest/roadshow';
import { desireStatuses, isOwned, newEntry, type JournalEntry, type JournalSnapshot } from './journalModel';
import './enoughJournal.css';

const readSession = () => { try { return readSongRecordSession(sessionStorage); } catch { return null; } };
const explain = (error: unknown) => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'INVALID_ACTION') return '云端尚未启用此刻已足，请部署更新后的 songRequestSync 云函数。';
  if (code === 'INVALID_JOURNAL' || code === 'PAYLOAD_TOO_LARGE') return '记录格式或容量超出限制。每段最多 1000 字，共可保存 200 条记录（总容量 600 KB）。';
  return mapRoadshowSyncError(error);
};

export default function EnoughJournal({ onBack }: { onBack: () => void }) {
  const [credentials, setCredentials] = useState<Credentials | null>(readSession);
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [invitation, setInvitation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const update = () => setCredentials(readSession());
    window.addEventListener(SONG_REQUEST_SESSION_EVENT, update);
    return () => window.removeEventListener(SONG_REQUEST_SESSION_EVENT, update);
  }, []);
  const login = async (register: boolean) => {
    if (!alias.trim() || password.length < 6) { setMessage('请填写账号和至少 6 位管理口令。'); return; }
    setBusy(true); setMessage('');
    const next = { alias: alias.trim(), password };
    try {
      if (register) await registerRoadshowWorkspace(next, invitation);
      await pullEnoughJournal(next);
      sessionStorage.setItem(ROADSHOW_SESSION_KEY, JSON.stringify(next));
      setCredentials(next); setPassword(''); setInvitation('');
      window.dispatchEvent(new Event(SONG_REQUEST_SESSION_EVENT));
    } catch (error) { setMessage(explain(error)); }
    finally { setBusy(false); }
  };
  const lock = () => {
    sessionStorage.removeItem(ROADSHOW_SESSION_KEY);
    setCredentials(null); setMessage('私人记录已锁定。');
    window.dispatchEvent(new Event(SONG_REQUEST_SESSION_EVENT));
  };
  return <main className="enough-page">
    {credentials ? <PrivateJournal key={`${credentials.alias}:${credentials.password}`} credentials={credentials} onBack={onBack} onLock={lock} /> : <>
      <button className="enough-quiet" onClick={onBack}><ArrowLeft size={15} />宇宙</button>
      <section className="enough-login enough-paper">
        <Leaf size={32} className="enough-accent" /><p className="enough-eyebrow">ENOUGH, HERE & NOW</p>
        <h1>此刻已足</h1><p className="enough-muted">看见已经拥有的，听懂仍然想要的。</p>
        <p className="enough-muted">这是只属于你的记录。使用与“我的档案”相同的账号进入，新账号需站主邀请码。</p>
        <form onSubmit={event => { event.preventDefault(); void login(false); }}>
          <label>账号<input autoComplete="username" maxLength={30} required value={alias} onChange={e => setAlias(e.target.value)} /></label>
          <label>管理口令<input autoComplete="current-password" type="password" minLength={6} maxLength={64} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>邀请码 · 仅首次启用需要<input autoComplete="off" maxLength={32} value={invitation} onChange={e => setInvitation(e.target.value)} /></label>
          <div className="enough-actions"><button className="enough-primary" disabled={busy}>进入我的记录</button><button type="button" className="enough-quiet" disabled={busy} onClick={() => void login(true)}>首次启用</button></div>
        </form>
        <p role="status" className="enough-notice">{message}</p>
      </section>
    </>}
  </main>;
}

function PrivateJournal({ credentials, onBack, onLock }: { credentials: Credentials; onBack: () => void; onLock: () => void }) {
  const [journal, setJournal] = useState<JournalSnapshot>({ revision: 0, entries: [] });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [message, setMessage] = useState('正在读取私人记录……');
  const [tab, setTab] = useState<'owned' | 'desires' | 'review'>('owned');
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState<JournalEntry | null>(null);
  const [existing, setExisting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    operation.current = true; setBusy(true);
    void pullEnoughJournal(credentials).then(data => { if (active) { setJournal(data); setReady(true); setMessage('仅自己可见 · 已同步'); } }).catch(error => { if (active) setMessage(explain(error)); }).finally(() => { if (active) { operation.current = false; setBusy(false); } });
    return () => { active = false; };
  }, [credentials]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  const abandon = () => !draft || window.confirm('当前内容尚未保存，确定离开编辑吗？');
  const refresh = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true);
    try { setJournal(await pullEnoughJournal(credentials)); setReady(true); setMessage(draft ? '已读取最新记录，当前编辑内容仍保留。' : '仅自己可见 · 已同步'); }
    catch (error) { setMessage(explain(error)); }
    finally { operation.current = false; setBusy(false); }
  };
  const persist = async (entries: JournalEntry[]) => {
    if (!ready || operation.current) return;
    operation.current = true; setBusy(true);
    try {
      setJournal(await saveEnoughJournal(credentials, journal.revision, entries));
      setDraft(null); setMessage('已保存到云端 · 仅自己可见');
    } catch (error) {
      if (error instanceof Error && error.message === 'CONFLICT') {
        try {
          setJournal(await pullEnoughJournal(credentials));
          setMessage('其他设备已更新记录，已加载最新内容。你的编辑仍保留，请核对后再次保存。');
        } catch { setReady(false); setMessage('检测到其他设备更新，但读取失败。编辑已保留，请刷新后核对再保存。'); }
      } else setMessage(explain(error));
    } finally { operation.current = false; setBusy(false); }
  };
  const open = (entry: JournalEntry, isExisting: boolean) => {
    if (!abandon()) return;
    setDraft({ ...entry }); setExisting(isExisting);
    if (!isExisting) { setTab(entry.kind === 'possession' ? 'owned' : 'desires'); setCategory(''); }
    requestAnimationFrame(() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); formRef.current?.querySelector('input')?.focus({ preventScroll: true }); });
  };
  const save = () => {
    if (!draft?.title.trim()) return;
    if (existing && !journal.entries.some(item => item.id === draft.id)) { setMessage('这条记录已在其他设备删除，不能覆盖。请复制需要保留的文字后取消编辑。'); return; }
    const entry = { ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() };
    const entries = [...journal.entries.filter(item => item.id !== entry.id), entry];
    // Remove links if an owned desire becomes unfulfilled again.
    void persist(entries.map(item => item.linkedId === entry.id && !isOwned(entry) ? { ...item, linkedId: '' } : item));
  };
  const remove = (entry: JournalEntry) => {
    if (!window.confirm(`删除“${entry.title}”？云端也会同步删除。`)) return;
    void persist(journal.entries.filter(item => item.id !== entry.id).map(item => item.linkedId === entry.id ? { ...item, linkedId: '' } : item));
  };
  const entries = journal.entries.filter(entry => (tab === 'owned' ? isOwned(entry) : entry.kind === 'desire' && (tab === 'review' || entry.status === 'wanting' || entry.status === 'paused')) && (!category || entry.category === category)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const owned = journal.entries.filter(isOwned);
  const update = (field: keyof JournalEntry, value: string) => setDraft(current => current ? { ...current, [field]: value } : null);
  return <>
    <header className="enough-top"><button disabled={busy} className="enough-quiet" onClick={() => { if (abandon()) onBack(); }}><ArrowLeft size={15} />宇宙</button><button disabled={busy} className="enough-quiet" onClick={() => { if (abandon()) onLock(); }}><Lock size={14} />锁定记录</button></header>
    <section className="enough-hero">
      <p className="enough-eyebrow">ENOUGH, HERE & NOW · 私人手记</p><h1>此刻<span>已足</span><i>。</i></h1>
      <p className="enough-lead">看见已经拥有的，<br className="sm:hidden" />听懂仍然想要的。</p>
      <p className="enough-muted">不急着拥有更多，也不必责备自己的渴望。</p>
      <div className="enough-actions"><button disabled={!ready || busy} className="enough-primary" onClick={() => open(newEntry('possession'), false)}><Plus size={16} />记下一份拥有</button><button disabled={!ready || busy} className="enough-secondary" onClick={() => open(newEntry('desire'), false)}><Plus size={16} />觉察一个想要</button></div>
      <Leaf className="enough-hero-leaf" strokeWidth={0.5} aria-hidden="true" />
    </section>
    <div className="enough-sync"><p role="status">{message}</p><button disabled={busy} className="enough-quiet" onClick={() => void refresh()}><RefreshCw size={14} />刷新</button></div>
    {draft && <div ref={formRef} className="enough-paper enough-editor">
      <p className="enough-eyebrow">{existing ? '重新读一读自己' : '留下一点此刻的感受'}</p><h2>{draft.kind === 'possession' ? '记下一份拥有' : '觉察一个想要'}</h2>
      <form onSubmit={event => { event.preventDefault(); save(); }}><fieldset disabled={busy}>
        <label>{draft.kind === 'possession' ? '我已经拥有' : '我此刻想要'}<input required maxLength={100} value={draft.title} onChange={e => update('title', e.target.value)} placeholder="一件物品、一段关系、一种能力，或一点自由……" /></label>
        <label>分类 · 可选<select value={draft.category} onChange={e => update('category', e.target.value)}><option value="">不分类</option>{['物品', '关系', '能力', '生活条件', '体验', '其他'].map(value => <option key={value}>{value}</option>)}</select></label>
        {draft.kind === 'desire' && <>
          <label>刚才发生了什么，让我想要它？<textarea maxLength={1000} value={draft.trigger} onChange={e => update('trigger', e.target.value)} placeholder="可以写下，也可以先留白。" /></label>
          <label>我真正期待得到的是什么？<textarea maxLength={1000} value={draft.need} onChange={e => update('need', e.target.value)} placeholder="方便、陪伴、自由，还是被认可……" /></label>
          <label>已有的什么，可以回应这个需要？<select value={draft.linkedId} onChange={e => update('linkedId', e.target.value)}><option value="">暂不关联</option>{owned.filter(item => item.id !== draft.id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>现在的心意<select value={draft.status} onChange={e => update('status', e.target.value)}>{Object.entries(desireStatuses).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          {draft.status === 'owned' && <p className="enough-muted">保存后也会出现在“我已拥有”，当初的期待会一并保留。</p>}
          <label>回头看，它实际带给我的感受<textarea maxLength={1000} value={draft.reflection} onChange={e => update('reflection', e.target.value)} placeholder="我的感受变化了，还是仍和当初一样？" /></label>
        </>}
        {isOwned(draft) && <label>它给我的生活带来了什么？<textarea maxLength={1000} value={draft.benefit} onChange={e => update('benefit', e.target.value)} placeholder="它也许很平常，却一直在照顾我的生活。" /></label>}
        <div className="enough-actions"><button className="enough-primary" disabled={!ready || !draft.title.trim()}>{busy ? '正在保存……' : '保存这份记录'}</button><button type="button" className="enough-quiet" onClick={() => { if (abandon()) setDraft(null); }}>取消</button></div>
      </fieldset></form>
    </div>}
    <nav className="enough-tabs" aria-label="记录分类">{([['owned', '我已拥有'], ['desires', '我正想要'], ['review', '回头看看']] as const).map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setCategory(''); }}>{label}</button>)}</nav>
    <div className="enough-list-heading"><p>{tab === 'owned' ? '那些平常的，正在支撑我的生活。' : tab === 'desires' ? '每一个想要背后，都有一个值得听见的需要。' : '当初的期待，和今天的答案。'}</p><label className="enough-filter">分类<select aria-label="筛选分类" value={category} onChange={e => setCategory(e.target.value)}><option value="">全部</option>{['物品', '关系', '能力', '生活条件', '体验', '其他'].map(value => <option key={value}>{value}</option>)}</select></label></div>
    {!ready ? <div className="enough-empty">{message}<br />可点击上方“刷新”重试，或锁定后重新登录。</div> : entries.length === 0 ? <div className="enough-empty"><Leaf size={30} /><h2>{category ? '这个分类还没有记录' : tab === 'owned' ? '也许，就从一件平常的小事开始。' : tab === 'desires' ? '想要，并不需要被责备。' : '给愿望一些时间，也给自己一点空间。'}</h2><p>{tab === 'owned' ? '一张安稳的床、一位朋友，或今天还能好好吃饭。' : '用上方“觉察一个想要”留下此刻的心意，以后再来看看。'}</p></div> : <div className="enough-grid">{entries.map(entry => <article key={entry.id} className="enough-paper enough-entry">
      <div className="enough-entry-meta"><span>{entry.category || '生活的一部分'}</span><span>{entry.kind === 'desire' ? desireStatuses[entry.status] : '已在身边'}</span></div><h2>{entry.title}</h2>
      {tab === 'review' ? <><small>当初的期待</small><p>{entry.need || '当时没有写下，也没有关系。'}</p><small>如今的感受</small><p>{entry.reflection || '还在慢慢体会。'}</p></> : <p>{isOwned(entry) ? entry.benefit || '它给我的生活带来了什么？' : entry.need || entry.trigger || '我想听听，这个渴望在说什么。'}</p>}
      {entry.linkedId && <p className="enough-linked">已经在身边：{owned.find(item => item.id === entry.linkedId)?.title}</p>}
      <footer><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('zh-CN')}</time><div><button disabled={busy} onClick={() => open(entry, true)}>{tab === 'review' ? '记下变化' : '展开 / 编辑'}</button>{entry.kind === 'desire' && entry.status !== 'owned' && <button disabled={busy} onClick={() => open({ ...entry, status: 'owned' }, true)}>已拥有</button>}<button disabled={busy || Boolean(draft)} onClick={() => remove(entry)}>删除</button></div></footer>
    </article>)}</div>}
    <p className="enough-ending">拥有不必被计数，渴望也不必被评分。</p>
  </>;
}
