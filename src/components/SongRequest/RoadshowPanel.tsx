import { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Cloud, Guitar, Lock, Plus, Save, Trash2, UsersRound, X } from 'lucide-react';
import { SONGS } from './songCatalog';
import type { Song } from './songCatalog';
import DailyPracticePanel from './DailyPracticePanel';
import {
  buildQuizParticipantRanking,
  countRecognitionAttemptsForSong,
  findSongAppearances,
  createRecognitionAttempt,
  groupRoadshowRecognitionSongs,
  paginateRoadshowSongs,
  parseRoadshowCache,
  ROADSHOW_CACHE_KEY,
  ROADSHOW_LOCATIONS,
  ROADSHOW_SESSION_KEY,
  preserveRecognitionParticipantNames,
  upsertRecognitionAttempt,
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
import { QUIZ_LEVELS, type QuizAssignments, type QuizLevel } from './songQuizLibrary';
import { saveSyncedNickname } from '../Welcome/nicknameSync';

interface Credentials {
  alias: string;
  password: string;
}

interface RoadshowPanelProps {
  defaultAlias?: string;
  songs?: Song[];
  records?: SongRecord[];
  syncStatus?: string;
  quizAssignments?: QuizAssignments;
  onRecordsChange?: (records: SongRecord[]) => void;
  onOpenSongDetail?: (song: Song) => void;
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
  location: '',
  weather: '',
  performanceSongs: [],
  recognitionSongs: [],
  recognitionAttempts: [],
  updatedAt: new Date().toISOString(),
});

const resolveRoadshowSong = (songs: Song[], roadshowSong: RoadshowSong): Song => (
  songs.find((song) => song.id === roadshowSong.catalogId)
  ?? songs.find((song) => song.title === roadshowSong.title && song.artist === roadshowSong.artist)
  ?? {
    id: roadshowSong.catalogId ?? roadshowSong.id,
    title: roadshowSong.title,
    artist: roadshowSong.artist,
    category: '路演歌曲',
    featured: false,
  }
);

const RoadshowPanel = ({
  defaultAlias = '',
  songs = SONGS,
  records: songRecords = [],
  syncStatus = '已同步',
  quizAssignments = {},
  onRecordsChange = () => undefined,
  onOpenSongDetail = () => undefined,
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

  const persistRecord = async (candidate: RoadshowRecord | null = editing) => {
    if (!credentials || !candidate || !candidate.title.trim()) return;
    setEditing(candidate);
    setBusy(true);
    try {
      const serverSaved = await saveRoadshow(credentials, {
        ...candidate,
        title: candidate.title.trim(),
        location: candidate.location?.trim() ?? '',
        weather: candidate.weather?.trim() ?? '',
      });
      const saved = preserveRecognitionParticipantNames(candidate, serverSaved);
      const next = [...records];
      const index = next.findIndex((item) => item.id === saved.id);
      if (index >= 0) next[index] = saved; else next.push(saved);
      next.sort((left, right) => right.date.localeCompare(left.date));
      setRecords(next);
      cacheRecords(next);
      setEditing(saved);
      setMessage('已保存到腾讯云');
      window.dispatchEvent(new Event('jieyou-quiz-ranking-updated'));
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
        <h2 className="mt-5 font-serif text-3xl font-black">私人记录</h2>
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
        quizAssignments={quizAssignments}
        onChange={setEditing}
        onBack={() => { setEditing(null); setMessage(''); }}
        onSave={() => void persistRecord()}
        onRecordAttempt={(record) => { void persistRecord(record); }}
        onOpenSongDetail={(song) => onOpenSongDetail(resolveRoadshowSong(songs, song))}
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
  quizAssignments: QuizAssignments;
  onChange: (record: RoadshowRecord) => void;
  onBack: () => void;
  onSave: () => void;
  onRecordAttempt: (record: RoadshowRecord) => void;
  onOpenSongDetail: (song: RoadshowSong) => void;
  onDelete: () => void;
  onLock: () => void;
}

const RoadshowEditor = ({ record, allRecords, busy, message, quizAssignments, onChange, onBack, onSave, onRecordAttempt, onOpenSongDetail, onDelete, onLock }: EditorProps) => {
  const updateList = (key: 'performanceSongs' | 'recognitionSongs', songs: RoadshowSong[]) => onChange({ ...record, [key]: songs });
  return (
    <section className="space-y-5">
      <div className="rounded-[1.75rem] border border-orange-200/15 bg-[#120b08]/85 p-5 backdrop-blur-xl sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="text-sm font-bold text-white/50 hover:text-white">← 返回路演列表</button>
          <button type="button" onClick={onLock} className="inline-flex items-center gap-2 text-xs font-bold text-white/40 hover:text-white"><Lock className="h-4 w-4" />锁定档案</button>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-3">
          <input aria-label="第几次路演" value={record.title} onChange={(event) => onChange({ ...record, title: event.target.value })} maxLength={60} className="h-12 min-w-0 rounded-xl border border-white/10 bg-black/35 px-4 font-serif text-xl font-black outline-none focus:border-orange-300/45" />
          <input aria-label="路演时间" type="date" value={record.date} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => onChange({ ...record, date: event.target.value })} className="h-12 min-w-0 cursor-pointer rounded-xl border border-white/10 bg-black/35 px-4 outline-none focus:border-orange-300/45" />
          <select aria-label="路演地点" value={record.location ?? ''} onChange={(event) => onChange({ ...record, location: event.target.value })} className="h-12 min-w-0 rounded-xl border border-white/10 bg-black/35 px-4 text-white outline-none focus:border-orange-300/45 [color-scheme:dark]">
            <option value="">路演地点（可选）</option>
            {ROADSHOW_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
          <input aria-label="天气" value={record.weather ?? ''} onChange={(event) => onChange({ ...record, weather: event.target.value })} maxLength={40} placeholder="天气（可选）" className="h-12 min-w-0 rounded-xl border border-white/10 bg-black/35 px-4 outline-none placeholder:text-white/25 focus:border-orange-300/45" />
        </div>
      </div>

      <SongListEditor title="路演歌曲" description="本次准备演唱的歌曲" songs={record.performanceSongs} allRecords={allRecords} recordId={record.id} onChange={(songs) => updateList('performanceSongs', songs)} />
      <RecognitionSongListEditor record={record} assignments={quizAssignments} allRecords={allRecords} busy={busy} onRecordAttempt={onRecordAttempt} onOpenSongDetail={onOpenSongDetail} />

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
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#09090c]/85 p-5 backdrop-blur-xl sm:p-7">
      <div className="flex items-end justify-between gap-4"><div><h3 className="font-serif text-2xl font-black">{title}</h3><p className="mt-1 text-xs text-white/35">{description}</p></div><strong className="text-xs text-white/30">{songs.length} 首</strong></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {songs.map((song) => {
          const appearances = findSongAppearances(allRecords, song, recordId);
          return <div key={song.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-300/10 text-orange-200"><Check className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{song.title}</strong><small className="block truncate text-white/35">{song.artist || '未填写歌手'}{appearances.length ? ` · 曾用于：${appearances.join('、')}` : ''}</small></span><button type="button" onClick={() => onChange(songs.filter((item) => item.id !== song.id))} aria-label={`移除${song.title}`} className="grid h-8 w-8 place-items-center rounded-full text-white/30 hover:bg-red-300/10 hover:text-red-200"><X className="h-4 w-4" /></button></div>;
        })}
        {!songs.length && <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-white/10 text-xs text-white/25 sm:col-span-2">还没有歌曲</div>}
      </div>
    </section>
  );
};

const RECOGNITION_LEVEL_STYLES: Record<QuizLevel, string> = {
  warmup: 'border-emerald-300/20 bg-emerald-400/[.045] text-emerald-100',
  standard: 'border-sky-300/20 bg-sky-400/[.045] text-sky-100',
  hard: 'border-violet-300/20 bg-violet-400/[.045] text-violet-100',
  hell: 'border-rose-300/20 bg-rose-400/[.045] text-rose-100',
};

const RecognitionSongListEditor = ({ record, assignments, allRecords, busy, onRecordAttempt, onOpenSongDetail }: {
  record: RoadshowRecord;
  assignments: QuizAssignments;
  allRecords: RoadshowRecord[];
  busy: boolean;
  onRecordAttempt: (record: RoadshowRecord) => void;
  onOpenSongDetail: (song: RoadshowSong) => void;
}) => {
  const songs = record.recognitionSongs;
  const [participating, setParticipating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participantInput, setParticipantInput] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [attemptIds, setAttemptIds] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [quizPages, setQuizPages] = useState<Record<QuizLevel, number>>({ warmup: 1, standard: 1, hard: 1, hell: 1 });
  const groups = groupRoadshowRecognitionSongs(songs, assignments);
  const selectedSongs = selectedSongIds.flatMap((songId) => {
    const song = songs.find((item) => item.id === songId);
    return song ? [song] : [];
  });
  const hasAnswer = (songId: string) => Object.prototype.hasOwnProperty.call(answers, songId);
  const roundComplete = selectedSongIds.length === 4 && selectedSongIds.every(hasAnswer);
  const participants = buildQuizParticipantRanking([record]);

  useEffect(() => {
    setParticipating(false);
    setJoining(false);
    setParticipantInput('');
    setParticipantName('');
    setSelectedSongIds([]);
    setAttemptIds({});
    setAnswers({});
    setQuizPages({ warmup: 1, standard: 1, hard: 1, hell: 1 });
  }, [record.id]);

  const resetRound = () => {
    setSelectedSongIds([]);
    setAttemptIds({});
    setAnswers({});
  };

  const toggleParticipation = () => {
    if (!participating) {
      setJoining(true);
      return;
    }
    setParticipating(false);
    setJoining(false);
    setParticipantInput('');
    setParticipantName('');
    resetRound();
  };

  const startParticipation = () => {
    const name = participantInput.trim();
    if (!name) return;
    if (typeof window !== 'undefined') saveSyncedNickname(window.localStorage, name);
    setParticipantName(name);
    setParticipating(true);
    setJoining(false);
    resetRound();
  };

  const finishRound = () => {
    setParticipating(false);
    setJoining(false);
    setParticipantInput('');
    setParticipantName('');
    resetRound();
  };

  const toggleSong = (song: RoadshowSong) => {
    if (!participating || hasAnswer(song.id)) return;
    setSelectedSongIds((current) => {
      if (current.includes(song.id)) return current.filter((songId) => songId !== song.id);
      return current.length < 4 ? [...current, song.id] : current;
    });
  };

  const answerSong = (song: RoadshowSong, correct: boolean) => {
    if (selectedSongIds.length !== 4 || busy || !participantName) return;
    const attempt = createRecognitionAttempt(song, correct, participantName, attemptIds[song.id]);
    setAttemptIds((current) => ({ ...current, [song.id]: attempt.id }));
    setAnswers((current) => ({ ...current, [song.id]: correct }));
    onRecordAttempt(upsertRecognitionAttempt(record, attempt));
  };

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#09090c]/85 p-5 backdrop-blur-xl sm:p-7">
      <div className="flex items-end justify-between gap-4">
        <div><h3 className="font-serif text-2xl font-black">听歌识曲</h3><p className="mt-1 text-xs text-white/35">互动游戏准备的题目歌曲</p></div>
        {joining ? (
          <form onSubmit={(event) => { event.preventDefault(); startParticipation(); }} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`participant-${record.id}`}>参与者用户名</label>
            <input id={`participant-${record.id}`} autoFocus maxLength={24} value={participantInput} onChange={(event) => setParticipantInput(event.target.value)} placeholder="输入用户名" className="h-10 w-36 rounded-full border border-white/10 bg-black/35 px-4 text-xs text-white outline-none placeholder:text-white/30 focus:border-orange-200/40 sm:w-44" />
            <button type="submit" disabled={!participantInput.trim()} className="h-10 rounded-full bg-orange-300 px-4 text-xs font-black text-black transition hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-35">开始答题</button>
            <button type="button" aria-label="取消参与" onClick={() => { setJoining(false); setParticipantInput(''); }} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/45 transition hover:text-white">×</button>
          </form>
        ) : (
          <button type="button" aria-pressed={participating} onClick={toggleParticipation} className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-black transition ${participating ? 'border-orange-200/45 bg-orange-300 text-black' : 'border-white/10 bg-white/[.045] text-white/65 hover:border-orange-200/30 hover:text-white'}`}>
            <UsersRound className="h-4 w-4" />{participating ? `退出参与 · ${participantName}` : <span>参与</span>}
          </button>
        )}
      </div>
      {participants.length > 0 && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto text-[10px] text-white/40">
          <span className="shrink-0 font-bold text-white/30">已参与 {participants.length}</span>
          {participants.map((participant) => <span key={participant.participantName.toLocaleLowerCase()} title={`${participant.participantName}：答题 ${participant.answerCount} 次，正确率 ${participant.accuracy}%`} className="shrink-0 rounded-full border border-white/10 bg-white/[.04] px-2.5 py-1"><b className="font-bold text-white/65">{participant.participantName}</b><small className="ml-1 text-white/30">· {participant.answerCount}题</small></span>)}
        </div>
      )}
      {participating && (
        <section className="mt-5 rounded-2xl border border-orange-200/15 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,.12),transparent_45%),rgba(0,0,0,.28)] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-black tracking-[.2em] text-orange-200/55">PLAYER ROUND</p><h4 className="mt-1 font-serif text-xl font-black">本轮判定</h4></div>
            <span className="text-xs font-bold text-white/45">已选 {selectedSongIds.length} / 4</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => {
              const song = selectedSongs[index];
              if (!song) return <div key={index} className="grid min-h-24 place-items-center rounded-xl border border-dashed border-white/10 bg-black/20 text-xs text-white/25">选择第 {index + 1} 首</div>;
              return (
                <article key={song.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-start gap-2"><b className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-300/15 text-xs text-orange-100">{index + 1}</b><span className="min-w-0"><strong className="block truncate text-sm">{song.title}</strong><small className="block truncate text-[10px] text-white/35">{song.artist || '未填写歌手'}</small></span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" aria-label={`将${song.title}标记为答错`} disabled={selectedSongIds.length !== 4 || busy} onClick={() => answerSong(song, false)} className={`h-9 rounded-lg border text-base transition disabled:cursor-not-allowed disabled:opacity-25 ${hasAnswer(song.id) && answers[song.id] === false ? 'border-rose-300/55 bg-rose-400/20' : 'border-white/10 bg-white/[.035] hover:bg-rose-400/10'}`}>❌</button>
                    <button type="button" aria-label={`将${song.title}标记为答对`} disabled={selectedSongIds.length !== 4 || busy} onClick={() => answerSong(song, true)} className={`h-9 rounded-lg border text-base transition disabled:cursor-not-allowed disabled:opacity-25 ${answers[song.id] === true ? 'border-emerald-300/55 bg-emerald-400/20' : 'border-white/10 bg-white/[.035] hover:bg-emerald-400/10'}`}>✅</button>
                  </div>
                </article>
              );
            })}
          </div>
          {roundComplete && <button type="button" onClick={finishRound} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-300/10 px-4 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/20"><UsersRound className="h-4 w-4" />下一位玩家</button>}
        </section>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUIZ_LEVELS.map((level) => {
          const paginated = paginateRoadshowSongs(groups[level.id], quizPages[level.id]);
          return (
          <section key={level.id} className={`flex min-h-36 flex-col rounded-2xl border p-3 ${RECOGNITION_LEVEL_STYLES[level.id]}`}>
            <header className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <span className="flex items-center gap-2"><b className="grid h-7 w-7 place-items-center rounded-full border border-current/30 bg-black/20 font-serif text-xs">{level.symbol}</b><strong className="text-sm">{level.label}</strong></span>
              <small className="text-white/35">{groups[level.id].length} 首</small>
            </header>
            <div className="space-y-2">
              {paginated.items.map((song) => {
                const appearances = findSongAppearances(allRecords, song, record.id);
                const attemptCount = countRecognitionAttemptsForSong(record, song);
                const selected = selectedSongIds.includes(song.id);
                return <button key={song.id} type="button" aria-label={participating ? `选择${song.title}` : `查看${song.title}详情和谱子`} aria-pressed={participating ? selected : undefined} disabled={participating && !selected && selectedSongIds.length === 4} onClick={() => participating ? toggleSong(song) : onOpenSongDetail(song)} className={`group flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition disabled:cursor-default ${selected ? 'border-orange-200/50 bg-orange-300/15 shadow-[0_0_20px_rgba(251,146,60,.08)]' : 'border-white/10 bg-black/25 enabled:hover:border-white/25'}`}><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white/90">{song.title}</strong><small className="block truncate text-[10px] text-white/35">{song.artist || '未填写歌手'}{appearances.length ? ` · 曾用于：${appearances.join('、')}` : ''}</small></span>{attemptCount > 0 && <span className="shrink-0 rounded-full border border-white/10 bg-white/[.055] px-2 py-1 text-[10px] font-black tabular-nums text-white/45">{attemptCount}次</span>}{selected && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-orange-300 text-[10px] font-black text-black">{selectedSongIds.indexOf(song.id) + 1}</span>}</button>;
              })}
              {!groups[level.id].length && <p className="py-5 text-center text-[10px] text-white/20">暂无歌曲</p>}
            </div>
            <footer className="mt-auto flex items-center justify-center gap-3 pt-3 text-[10px] font-bold text-white/45">
              <button type="button" aria-label={`${level.label}上一页`} disabled={paginated.page === 1} onClick={() => setQuizPages((current) => ({ ...current, [level.id]: paginated.page - 1 }))} className="grid h-7 w-7 place-items-center rounded-full border border-white/10 transition enabled:hover:border-white/25 enabled:hover:text-white disabled:opacity-20">‹</button>
              <span>{paginated.page} / {paginated.pageCount}</span>
              <button type="button" aria-label={`${level.label}下一页`} disabled={paginated.page === paginated.pageCount} onClick={() => setQuizPages((current) => ({ ...current, [level.id]: paginated.page + 1 }))} className="grid h-7 w-7 place-items-center rounded-full border border-white/10 transition enabled:hover:border-white/25 enabled:hover:text-white disabled:opacity-20">›</button>
            </footer>
          </section>
          );
        })}
      </div>
    </section>
  );
};

export default RoadshowPanel;
