import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Cloud, Guitar, Lock, Plus, Save, Trash2, X } from 'lucide-react';
import { SONGS } from './songCatalog';
import type { Song } from './songCatalog';
import DailyPracticePanel from './DailyPracticePanel';
import {
  createManualRoadshowSong,
  createRoadshowSong,
  findSongAppearances,
  parseRoadshowCache,
  ROADSHOW_CACHE_KEY,
  ROADSHOW_SESSION_KEY,
  type RoadshowRecord,
  type RoadshowSong,
} from './roadshow';
import {
  deleteRoadshow,
  mapRoadshowSyncError,
  pullRoadshows,
  registerRoadshowWorkspace,
  saveRoadshow,
} from './songRequestCloud';
import {
  clearSongRecordCache,
  readSongRecordSession,
  SONG_REQUEST_SESSION_EVENT,
  type SongRecord,
} from './songRecords';

interface Credentials {
  alias: string;
  password: string;
}

interface RoadshowPanelProps {
  defaultAlias?: string;
  songs?: Song[];
  records?: SongRecord[];
  syncStatus?: string;
  onRecordsChange?: (records: SongRecord[]) => void;
}

type ArchiveView = 'practice' | 'roadshows';

const readSession = (): Credentials | null => {
  return readSongRecordSession(sessionStorage);
};

const cacheRecords = (records: RoadshowRecord[]) => {
  try { localStorage.setItem(ROADSHOW_CACHE_KEY, JSON.stringify({ version: 1, records })); } catch {}
};

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const emptyRecord = (index: number): RoadshowRecord => ({
  id: `roadshow-${Date.now().toString(36)}`,
  title: `第${index}次路演`,
  date: today(),
  performanceSongs: [],
  recognitionSongs: [],
  updatedAt: new Date().toISOString(),
});

const RoadshowPanel = ({
  defaultAlias = '',
  songs = SONGS,
  records: songRecords = [],
  syncStatus = '已同步',
  onRecordsChange = () => undefined,
}: RoadshowPanelProps) => {
  const [credentials, setCredentials] = useState<Credentials | null>(() => readSession());
  const [alias, setAlias] = useState(() => readSession()?.alias || defaultAlias);
  const [password, setPassword] = useState(() => readSession()?.password || '');
  const [records, setRecords] = useState<RoadshowRecord[]>(() => {
    try { return parseRoadshowCache(localStorage.getItem(ROADSHOW_CACHE_KEY)); } catch { return []; }
  });
  const [editing, setEditing] = useState<RoadshowRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [archiveView, setArchiveView] = useState<ArchiveView>('practice');

  useEffect(() => {
    if (!credentials) return;
    let active = true;
    setBusy(true);
    pullRoadshows(credentials)
      .then((cloudRecords) => {
        if (!active) return;
        setRecords(cloudRecords);
        cacheRecords(cloudRecords);
        setMessage('已从腾讯云同步');
      })
      .catch((error) => { if (active) setMessage(mapRoadshowSyncError(error)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [credentials]);

  const authenticate = async (mode: 'login' | 'register') => {
    const next = { alias: alias.trim(), password };
    if (!next.alias || next.password.length < 6) {
      setMessage('请输入别称和至少 6 位管理口令。');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const cloudRecords = mode === 'register'
        ? await registerRoadshowWorkspace(next)
        : await pullRoadshows(next);
      sessionStorage.setItem(ROADSHOW_SESSION_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(SONG_REQUEST_SESSION_EVENT));
      setCredentials(next);
      setRecords(cloudRecords);
      cacheRecords(cloudRecords);
    } catch (error) {
      setMessage(mapRoadshowSyncError(error));
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    if (credentials) clearSongRecordCache(localStorage, credentials.alias);
    sessionStorage.removeItem(ROADSHOW_SESSION_KEY);
    window.dispatchEvent(new Event(SONG_REQUEST_SESSION_EVENT));
    setCredentials(null);
    setPassword('');
    setEditing(null);
    setRecords([]);
    setMessage('我的档案已锁定');
  };

  const persistRecord = async () => {
    if (!credentials || !editing || !editing.title.trim()) return;
    setBusy(true);
    try {
      const saved = await saveRoadshow(credentials, { ...editing, title: editing.title.trim() });
      const next = [...records];
      const index = next.findIndex((item) => item.id === saved.id);
      if (index >= 0) next[index] = saved; else next.push(saved);
      next.sort((left, right) => right.date.localeCompare(left.date));
      setRecords(next);
      cacheRecords(next);
      setEditing(saved);
      setMessage('已保存到腾讯云');
    } catch (error) {
      setMessage(mapRoadshowSyncError(error));
    } finally { setBusy(false); }
  };

  const removeRecord = async (record: RoadshowRecord) => {
    if (!credentials || !window.confirm(`确定删除“${record.title}”吗？`)) return;
    setBusy(true);
    try {
      await deleteRoadshow(credentials, record.id);
      const next = records.filter((item) => item.id !== record.id);
      setRecords(next);
      cacheRecords(next);
      setEditing(null);
      setMessage('已从云端删除');
    } catch (error) { setMessage(mapRoadshowSyncError(error)); }
    finally { setBusy(false); }
  };

  if (!credentials) {
    return (
      <section className="mx-auto max-w-xl rounded-[2rem] border border-orange-200/15 bg-[#120b08]/85 p-6 shadow-[0_28px_90px_rgba(0,0,0,.35)] backdrop-blur-2xl sm:p-9">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-orange-200/20 bg-orange-300/10 text-orange-200"><Lock className="h-6 w-6" /></div>
        <h2 className="mt-5 font-serif text-3xl font-black">仅属于你的私人档案</h2>
        <p className="mt-2 text-sm leading-7 text-white/45">用别称和管理口令进入。日常练习和路演档案通过腾讯云在电脑、手机之间同步。</p>
        <div className="mt-6 space-y-3">
          <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="你的别称" maxLength={30} className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 outline-none focus:border-orange-300/45" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="管理口令（至少 6 位）" type="password" maxLength={64} className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 outline-none focus:border-orange-300/45" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => void authenticate('login')} className="h-12 rounded-xl bg-orange-400 font-black text-black transition hover:bg-orange-300 disabled:opacity-50">进入我的档案</button>
          <button type="button" disabled={busy} onClick={() => void authenticate('register')} className="h-12 rounded-xl border border-white/15 bg-white/5 font-bold text-white/75 transition hover:bg-white/10 disabled:opacity-50">首次启用</button>
        </div>
        {message && <p className="mt-4 text-sm text-amber-200/80" role="status">{message}</p>}
      </section>
    );
  }

  if (editing) {
    return (
      <RoadshowEditor
        record={editing}
        allRecords={records}
        busy={busy}
        message={message}
        onChange={setEditing}
        onBack={() => { setEditing(null); setMessage(''); }}
        onSave={() => void persistRecord()}
        onDelete={() => void removeRecord(editing)}
        onLock={lock}
      />
    );
  }

  return (
    <section className="archive-panel">
      <header className="archive-header">
        <div>
          <p className="text-[10px] font-black tracking-[.28em] text-orange-300/60">PRIVATE · CLOUD SYNC</p>
          <h2>我的档案</h2>
          <p>{credentials.alias} 的私人记录</p>
        </div>
        <button type="button" onClick={lock} className="archive-lock"><Lock size={15} />锁定档案</button>
      </header>

      <nav className="archive-tabs" aria-label="档案分类">
        <button type="button" className={archiveView === 'practice' ? 'active' : ''} onClick={() => setArchiveView('practice')}><Guitar size={16} />日常练习</button>
        <button type="button" className={archiveView === 'roadshows' ? 'active' : ''} onClick={() => setArchiveView('roadshows')}><CalendarDays size={16} />路演档案</button>
      </nav>

      {archiveView === 'practice' ? (
        <DailyPracticePanel
          songs={songs}
          records={songRecords}
          credentials={credentials}
          syncStatus={syncStatus}
          onRecordsChange={onRecordsChange}
        />
      ) : (
        <section className="roadshow-archive-section">
          <div className="archive-section-heading">
            <div><span className="eyebrow">ROADSHOW ARCHIVE</span><h2>路演档案</h2><p>记录每一场准备过和唱过的歌。</p></div>
            <button type="button" onClick={() => setEditing(emptyRecord(records.length + 1))}><Plus size={16} />创建路演</button>
          </div>
          {message && <p className="archive-cloud-message" role="status"><Cloud size={15} />{message}</p>}
          {records.length ? (
            <div className="roadshow-record-grid">
              {records.map((record) => (
                <button key={record.id} type="button" onClick={() => setEditing(record)} className="roadshow-record-card">
                  <span><CalendarDays size={20} /></span>
                  <span><strong>{record.title}</strong><small>{record.date} · 演唱 {record.performanceSongs.length} · 听歌识曲 {record.recognitionSongs.length}</small></span>
                  <ChevronRight size={19} />
                </button>
              ))}
            </div>
          ) : (
            <div className="roadshow-empty"><div><CalendarDays size={36} /><p>还没有路演记录</p><small>从第一次路演开始记录。</small></div></div>
          )}
        </section>
      )}
    </section>
  );
};

interface EditorProps {
  record: RoadshowRecord;
  allRecords: RoadshowRecord[];
  busy: boolean;
  message: string;
  onChange: (record: RoadshowRecord) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  onLock: () => void;
}

const RoadshowEditor = ({ record, allRecords, busy, message, onChange, onBack, onSave, onDelete, onLock }: EditorProps) => {
  const updateList = (key: 'performanceSongs' | 'recognitionSongs', songs: RoadshowSong[]) => onChange({ ...record, [key]: songs });
  return (
    <section className="space-y-5">
      <div className="rounded-[1.75rem] border border-orange-200/15 bg-[#120b08]/85 p-5 backdrop-blur-xl sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="text-sm font-bold text-white/50 hover:text-white">← 返回路演列表</button>
          <button type="button" onClick={onLock} className="inline-flex items-center gap-2 text-xs font-bold text-white/40 hover:text-white"><Lock className="h-4 w-4" />锁定档案</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_12rem]">
          <input value={record.title} onChange={(event) => onChange({ ...record, title: event.target.value })} maxLength={60} className="h-12 rounded-xl border border-white/10 bg-black/35 px-4 font-serif text-xl font-black outline-none focus:border-orange-300/45" />
          <input type="date" value={record.date} onChange={(event) => onChange({ ...record, date: event.target.value })} className="h-12 rounded-xl border border-white/10 bg-black/35 px-4 outline-none focus:border-orange-300/45" />
        </div>
      </div>

      <SongListEditor title="路演歌曲" description="本次准备演唱的歌曲" songs={record.performanceSongs} allRecords={allRecords} recordId={record.id} onChange={(songs) => updateList('performanceSongs', songs)} />
      <SongListEditor title="听歌识曲" description="互动游戏准备的题目歌曲" songs={record.recognitionSongs} allRecords={allRecords} recordId={record.id} onChange={(songs) => updateList('recognitionSongs', songs)} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
        <button type="button" disabled={busy} onClick={onDelete} className="inline-flex items-center gap-2 text-sm font-bold text-red-300/70 hover:text-red-200 disabled:opacity-40"><Trash2 className="h-4 w-4" />删除这场路演</button>
        <div className="flex items-center gap-3">{message && <span className="text-xs text-emerald-200/70">{message}</span>}<button type="button" disabled={busy || !record.title.trim()} onClick={onSave} className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-5 text-sm font-black text-black disabled:opacity-40"><Save className="h-4 w-4" />保存到云端</button></div>
      </div>
    </section>
  );
};

interface SongListEditorProps {
  title: string;
  description: string;
  songs: RoadshowSong[];
  allRecords: RoadshowRecord[];
  recordId: string;
  onChange: (songs: RoadshowSong[]) => void;
}

const SongListEditor = ({ title, description, songs, allRecords, recordId, onChange }: SongListEditorProps) => {
  const [catalogId, setCatalogId] = useState(SONGS[0]?.id || '');
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const selected = useMemo(() => SONGS.find((song) => song.id === catalogId), [catalogId]);

  const addCatalog = () => {
    if (!selected || songs.some((song) => song.catalogId === selected.id)) return;
    onChange([...songs, createRoadshowSong(selected)]);
  };
  const addManual = () => {
    if (!manualTitle.trim()) return;
    onChange([...songs, createManualRoadshowSong(manualTitle, manualArtist)]);
    setManualTitle(''); setManualArtist('');
  };

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#09090c]/85 p-5 backdrop-blur-xl sm:p-7">
      <div><h3 className="font-serif text-2xl font-black">{title}</h3><p className="mt-1 text-xs text-white/35">{description}</p></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[.03] p-4"><p className="mb-3 text-xs font-bold text-orange-200/65">从曲库添加</p><div className="flex gap-2"><select value={catalogId} onChange={(event) => setCatalogId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111] px-3 text-sm outline-none">{SONGS.map((song) => <option key={song.id} value={song.id}>{song.title} · {song.artist}</option>)}</select><button type="button" onClick={addCatalog} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-orange-400 text-black"><Plus className="h-4 w-4" /></button></div></div>
        <div className="rounded-2xl border border-white/8 bg-white/[.03] p-4"><p className="mb-3 text-xs font-bold text-orange-200/65">手动添加曲库外歌曲</p><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="歌名" maxLength={100} className="h-10 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none" /><input value={manualArtist} onChange={(event) => setManualArtist(event.target.value)} placeholder="歌手（可选）" maxLength={100} className="h-10 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none" /><button type="button" onClick={addManual} className="grid h-10 w-10 place-items-center rounded-lg bg-orange-400 text-black"><Plus className="h-4 w-4" /></button></div></div>
      </div>

      <div className="mt-4 space-y-2">
        {songs.map((song) => {
          const appearances = findSongAppearances(allRecords, song, recordId);
          return <div key={song.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/25 p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-300/10 text-orange-200"><Check className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{song.title}</strong><small className="block truncate text-white/35">{song.artist || '未填写歌手'}{appearances.length ? ` · 曾用于：${appearances.join('、')}` : ''}</small></span><button type="button" onClick={() => onChange(songs.filter((item) => item.id !== song.id))} aria-label={`移除${song.title}`} className="grid h-8 w-8 place-items-center rounded-full text-white/30 hover:bg-red-300/10 hover:text-red-200"><X className="h-4 w-4" /></button></div>;
        })}
        {!songs.length && <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-white/10 text-xs text-white/25">还没有添加歌曲</div>}
      </div>
    </section>
  );
};

export default RoadshowPanel;
