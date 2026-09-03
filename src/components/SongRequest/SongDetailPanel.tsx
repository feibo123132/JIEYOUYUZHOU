import { useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Cloud, Disc3, Guitar, Lock, MessageCircle, Music4, Save, Target, Trash2, Upload } from 'lucide-react';
import type { Song } from './songCatalog';
import { findSongRoadshowHistory, type RoadshowRecord } from './roadshow';
import { QUIZ_LEVELS, type QuizLevel } from './songQuizLibrary';
import ScoreViewer from './ScoreViewer';
import {
  appendSongScorePages, compressScoreImage, getSongScoreDisplayPages, moveSongScorePage,
  removeSongScorePage, SCORE_PAGE_LIMIT, SCORE_PAGES_TOTAL_LIMIT, type SongScore,
} from './songScores';
import {
  averageMatchScore,
  getMatchQuality,
  getPracticeReflection,
  isValidSongRecord,
  parseMatchScoreInput,
  sortSongRecords,
  type PracticeRecord,
  type SongRecord,
  type SongRecordSession,
  type SongRoadshowRecord,
} from './songRecords';
import { deleteSongRecord, mapSongRecordSyncError, saveSongRecord } from './songRequestCloud';

interface SongDetailPanelProps {
  song: Song;
  records: SongRecord[];
  roadshows?: RoadshowRecord[];
  session: SongRecordSession | null;
  syncStatus?: string;
  quizLevel?: QuizLevel;
  quizCounts: Record<QuizLevel, number>;
  canManageQuiz: boolean;
  quizBusy?: boolean;
  score?: SongScore | null;
  scoreBusy?: boolean;
  scoreSyncStatus?: string;
  onQuizLevelChange: (level: QuizLevel) => void;
  onRecordsChange: (records: SongRecord[]) => void;
  onScoreChange: (songId: string, score: SongScore | null) => void;
  onOpenPrivateSpace: () => void;
}

type JournalKind = 'practice' | 'roadshow' | 'score';

const localDateTime = (value: string | Date = new Date()) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const recordId = (kind: SongRecord['kind']) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const inputClass = 'h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none transition focus:border-orange-300/45';
const dateTimeInputClass = `${inputClass} cursor-pointer [color-scheme:dark]`;
const areaClass = 'min-h-28 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-6 outline-none transition placeholder:text-white/20 focus:border-orange-300/45';
const qualityTextClass = {
  white: 'text-white',
  green: 'text-emerald-400',
  lightBlue: 'text-sky-300',
  darkBlue: 'text-blue-600',
  purple: 'text-purple-400',
  gold: 'text-amber-300',
} as const;
const quizLevelTone: Record<QuizLevel, string> = {
  warmup: 'border-emerald-300/35 bg-emerald-300/15 text-emerald-100',
  standard: 'border-sky-300/35 bg-sky-300/15 text-sky-100',
  hard: 'border-violet-300/35 bg-violet-300/15 text-violet-100',
  hell: 'border-rose-300/35 bg-rose-300/15 text-rose-100',
};
const displayTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));
const displayRoadshowDate = (value: string) => value.replace(/-/g, '/');

const SongDetailPanel = ({
  song, records, roadshows = [], session, syncStatus = '', quizLevel, quizCounts,
  canManageQuiz, quizBusy = false, score = null, scoreBusy = false, scoreSyncStatus = '', onQuizLevelChange, onRecordsChange,
  onScoreChange, onOpenPrivateSpace,
}: SongDetailPanelProps) => {
  const songRecords = useMemo(() => sortSongRecords(records.filter((record) => record.songId === song.id)), [records, song.id]);
  const practices = songRecords.filter((record): record is PracticeRecord => record.kind === 'practice');
  const roadshowNotes = songRecords.filter((record): record is SongRoadshowRecord => record.kind === 'roadshow');
  const roadshowHistory = useMemo(() => findSongRoadshowHistory(roadshows, song), [roadshows, song]);
  const averageScore = averageMatchScore(practices);
  const [activeJournal, setActiveJournal] = useState<JournalKind>('practice');
  const [practiceAt, setPracticeAt] = useState(localDateTime);
  const [matchScore, setMatchScore] = useState<number | ''>(80);
  const [feelings, setFeelings] = useState('');
  const [singingReflection, setSingingReflection] = useState('');
  const [roadshowAt, setRoadshowAt] = useState(localDateTime);
  const [audienceName, setAudienceName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [editingRecord, setEditingRecord] = useState<SongRecord | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [quizMenuOpen, setQuizMenuOpen] = useState(false);
  const [scoreViewerOpen, setScoreViewerOpen] = useState(false);
  const [scoreBusyLocal, setScoreBusyLocal] = useState('');
  const scoreFileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const matchQuality = getMatchQuality(Number(matchScore));
  const currentQuizLevel = QUIZ_LEVELS.find((level) => level.id === quizLevel);

  if (!session) {
    return (
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-orange-200/15 bg-[#120b08]/90 p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:p-10">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-orange-200/20 bg-orange-300/10 text-orange-200"><Lock className="h-7 w-7" /></span>
        <p className="mt-6 text-[10px] font-black tracking-[.28em] text-orange-300/60">PRIVATE SONG JOURNAL</p>
        <h2 className="mt-2 font-serif text-3xl font-black">请先进入路演档案解锁</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-white/45">练习与路演反馈只属于你。解锁后会通过腾讯云在电脑和手机之间同步。</p>
        <button type="button" onClick={onOpenPrivateSpace} className="mt-7 h-11 rounded-full bg-orange-400 px-6 text-sm font-black text-black transition hover:bg-orange-300">前往私有空间</button>
      </section>
    );
  }

  const commitSaved = (saved: SongRecord) => {
    const next = sortSongRecords([...records.filter((record) => record.id !== saved.id), saved]);
    onRecordsChange(next);
  };

  const beginEdit = (record: SongRecord) => {
    setActiveJournal(record.kind);
    setEditingRecord(record);
    setMessage('正在编辑这条记录');
    if (record.kind === 'practice') {
      setPracticeAt(localDateTime(record.occurredAt));
      setMatchScore(record.matchScore);
      setFeelings(record.feelings);
      setSingingReflection(getPracticeReflection(record));
    } else {
      setRoadshowAt(localDateTime(record.occurredAt));
      setAudienceName(record.audienceName);
      setFeedback(record.feedback);
    }
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const submitPractice = async () => {
    if (!Number.isFinite(Date.parse(practiceAt))) { setMessage('请选择有效的练习时间。'); return; }
    const now = new Date().toISOString();
    const record: PracticeRecord = {
      id: editingRecord?.kind === 'practice' ? editingRecord.id : recordId('practice'), kind: 'practice', songId: song.id, songTitle: song.title, songArtist: song.artist,
      occurredAt: new Date(practiceAt).toISOString(), matchScore: Number(matchScore),
      feelings: feelings.trim(), problems: singingReflection.trim(), improvements: '', updatedAt: now,
    };
    if (!isValidSongRecord(record)) {
      setMessage('请填写有效的时间和 70–100 分。');
      return;
    }
    setBusy('practice'); setMessage('');
    try {
      commitSaved(await saveSongRecord(session, record));
      const wasEditing = editingRecord?.kind === 'practice';
      setEditingRecord(null);
      setFeelings(''); setSingingReflection('');
      setMessage(wasEditing ? '练习记录修改已同步' : '练习记录已同步');
    } catch (error) { setMessage(mapSongRecordSyncError(error)); }
    finally { setBusy(''); }
  };

  const submitRoadshow = async () => {
    if (!Number.isFinite(Date.parse(roadshowAt))) { setMessage('请选择有效的路演时间。'); return; }
    const now = new Date().toISOString();
    const record: SongRoadshowRecord = {
      id: editingRecord?.kind === 'roadshow' ? editingRecord.id : recordId('roadshow'), kind: 'roadshow', songId: song.id, songTitle: song.title, songArtist: song.artist,
      occurredAt: new Date(roadshowAt).toISOString(), audienceName: audienceName.trim(), feedback: feedback.trim(), updatedAt: now,
    };
    if (!isValidSongRecord(record)) {
      setMessage('请选择有效时间，并填写现场反馈与观察。');
      return;
    }
    setBusy('roadshow'); setMessage('');
    try {
      commitSaved(await saveSongRecord(session, record));
      const wasEditing = editingRecord?.kind === 'roadshow';
      setEditingRecord(null);
      setAudienceName(''); setFeedback('');
      setMessage(wasEditing ? '路演记录修改已同步' : '路演记录已同步');
    } catch (error) { setMessage(mapSongRecordSyncError(error)); }
    finally { setBusy(''); }
  };

  const removeRecord = async (record: SongRecord) => {
    if (!window.confirm('确定删除这条记录吗？')) return;
    setBusy(record.id); setMessage('');
    try {
      await deleteSongRecord(session, record.id);
      onRecordsChange(records.filter((item) => item.id !== record.id));
      setMessage('记录已从云端删除');
    } catch (error) { setMessage(mapSongRecordSyncError(error)); }
    finally { setBusy(''); }
  };

  const scorePages = getSongScoreDisplayPages(score);
  const scorePending = Boolean(score?.pendingSync);
  const scoreWorking = scoreBusyLocal || (scoreBusy ? '正在同步谱子到云端…' : scoreSyncStatus);

  const addScorePages = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = SCORE_PAGE_LIMIT - scorePages.length;
    if (remaining <= 0) { setMessage(`每首歌最多保存 ${SCORE_PAGE_LIMIT} 页谱子`); return; }
    const picked = [...files].slice(0, remaining);
    setScoreBusyLocal('正在处理谱子图片…');
    try {
      const added: string[] = [];
      for (const file of picked) added.push(await compressScoreImage(file));
      const next = appendSongScorePages(song, score, added);
      const localPagesSize = next.pages.filter((page) => page.startsWith('data:image/')).join('').length;
      if (localPagesSize > SCORE_PAGES_TOTAL_LIMIT) {
        setMessage('谱子总大小超出云端限制，请删减页数或分段上传更小的图');
        return;
      }
      onScoreChange(song.id, next);
      setMessage('图片已处理，正在同步到云端');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '谱子图片处理失败');
    } finally {
      setScoreBusyLocal('');
      if (scoreFileRef.current) scoreFileRef.current.value = '';
    }
  };

  const removeScorePage = (index: number) => {
    if (!score) return;
    const next = removeSongScorePage(score, index);
    if (next.pages.length) onScoreChange(song.id, next);
    else onScoreChange(song.id, null);
  };

  const moveScorePage = (index: number, delta: -1 | 1) => {
    if (!score) return;
    onScoreChange(song.id, moveSongScorePage(score, index, delta));
  };

  const removeAllScorePages = () => {
    if (!scorePages.length || !window.confirm('确定删除这首歌的全部谱子吗？')) return;
    onScoreChange(song.id, null);
  };

  return (
    <section className="space-y-6">
      <div className="relative w-full rounded-[2rem] border border-orange-200/15 bg-[linear-gradient(125deg,rgba(67,29,13,.72),rgba(8,8,13,.9)_58%)] p-6 shadow-[0_28px_90px_rgba(0,0,0,.34)] sm:p-9">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]"><div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-orange-400/10 blur-3xl" /></div>
        <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p data-journal-eyebrow className="text-[10px] font-black tracking-[.22em] text-orange-200/65">MY SONG JOURNAL</p>
            <h1 className="mt-2 font-serif text-4xl font-black tracking-[-.04em] sm:text-6xl">{song.title}</h1>
            <div data-journal-description className="mt-3 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm leading-7 text-white/45">{song.hotComment || `${song.artist} · ${song.category}`}</p>
              {(syncStatus || message) && <p className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-black tracking-[.12em] text-orange-100/55" role="status"><Cloud className="h-2.5 w-2.5" />{message || syncStatus}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
            <div className="grid min-w-64 grid-cols-3 gap-2">
              {(canManageQuiz || currentQuizLevel) && (
                <span className="relative">
                  <button
                    data-detail-quiz-trigger
                    type="button"
                    className="flex h-full min-h-[4.75rem] w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-3 text-center transition hover:border-sky-200/35 active:scale-95 disabled:opacity-45"
                    aria-label="听歌识曲等级"
                    aria-expanded={canManageQuiz ? quizMenuOpen : undefined}
                    title={currentQuizLevel ? `听歌识曲 · ${currentQuizLevel.label}` : '加入听歌识曲'}
                    disabled={!canManageQuiz || quizBusy}
                    onClick={() => setQuizMenuOpen((open) => !open)}
                  >
                    <strong className="block font-serif text-xl text-orange-100">{currentQuizLevel?.symbol ?? <Disc3 className="h-5 w-5" />}</strong>
                    <small className="mt-1 block text-[10px] tracking-[.14em] text-white/30">{currentQuizLevel?.label ?? '识曲'}</small>
                  </button>
                  {canManageQuiz && quizMenuOpen && (
                    <span data-detail-quiz-popover role="menu" aria-label={`${song.title}听歌识曲等级`} className="absolute right-0 top-full z-30 mt-2 grid w-56 gap-1 rounded-2xl border border-white/15 bg-[#100d16]/95 p-2 shadow-2xl backdrop-blur-xl">
                      <small className="px-2 pb-1 pt-1 text-[9px] font-black tracking-[.16em] text-white/30">听歌识曲</small>
                      <span className="grid grid-cols-2 gap-1">
                        {QUIZ_LEVELS.map((level) => (
                          <button
                            key={level.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={quizLevel === level.id}
                            disabled={quizBusy}
                            onClick={() => { setQuizMenuOpen(false); onQuizLevelChange(level.id); }}
                            className={`flex h-9 items-center gap-2 rounded-xl px-2 text-left text-xs font-bold transition hover:bg-white/10 disabled:opacity-40 ${quizLevel === level.id ? quizLevelTone[level.id] : 'text-white/55'}`}
                          >
                            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${quizLevelTone[level.id]}`}>{level.symbol}</span>
                            <span>{level.label}</span>
                            <small className="ml-auto tabular-nums text-[10px] opacity-55">{quizCounts[level.id]}</small>
                          </button>
                        ))}
                      </span>
                      <small className="px-2 pt-1 text-[9px] leading-4 text-white/30">再次点击当前等级可移出</small>
                    </span>
                  )}
                </span>
              )}
              {activeJournal === 'practice' ? <>
                <Stat label="练习" value={`${practices.length} 次`} />
                <Stat label="匹配度" value={averageScore === null ? '—' : `${averageScore}`} />
              </> : activeJournal === 'roadshow' ? <>
                <Stat label="路演" value={`${roadshowHistory.length} 次`} />
                <Stat label="次数" value={roadshowHistory.length ? `${roadshowHistory.length} 次` : '—'} />
              </> : <>
                <Stat label="谱页" value={`${scorePages.length} 页`} />
                <Stat label="状态" value={scorePages.length ? (scorePending ? '待同步' : '已同步') : '待上传'} />
              </>}
            </div>
            <div data-journal-toolbar className="flex w-full flex-wrap items-center justify-end gap-3">
              <div role="group" aria-label="切换记录类型" className="inline-flex rounded-2xl border border-white/10 bg-black/25 p-1">
                <button type="button" aria-pressed={activeJournal === 'practice'} onClick={() => setActiveJournal('practice')} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${activeJournal === 'practice' ? 'bg-orange-300 text-black shadow-[0_8px_25px_rgba(251,146,60,.2)]' : 'text-white/40 hover:text-white/75'}`}><Guitar className="h-4 w-4" />练习</button>
                <button type="button" aria-pressed={activeJournal === 'roadshow'} onClick={() => setActiveJournal('roadshow')} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${activeJournal === 'roadshow' ? 'bg-orange-300 text-black shadow-[0_8px_25px_rgba(251,146,60,.2)]' : 'text-white/40 hover:text-white/75'}`}><MessageCircle className="h-4 w-4" />路演</button>
                <button type="button" aria-pressed={activeJournal === 'score'} onClick={() => setActiveJournal('score')} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${activeJournal === 'score' ? 'bg-orange-300 text-black shadow-[0_8px_25px_rgba(251,146,60,.2)]' : 'text-white/40 hover:text-white/75'}`}><Music4 className="h-4 w-4" />谱子</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeJournal === 'score' && (
      <section data-song-score-panel className="rounded-[1.75rem] border border-white/10 bg-[#09090d]/80 p-5 backdrop-blur-xl sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-200/15 bg-orange-300/10 text-orange-200"><Music4 className="h-5 w-5" /></span>
            <div>
              <h2 className="font-serif text-2xl font-black">专属谱子</h2>
              <p className="mt-1 text-xs leading-5 text-white/35">把谱子拍下来传到这里（支持拼好的长图），演唱时打开翻谱器一键翻页。</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scorePages.length > 0 && (
              <button
                type="button"
                onClick={() => setScoreViewerOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-5 text-sm font-black text-black transition hover:bg-orange-300"
              >
                <Music4 className="h-4 w-4" />打开翻谱器
              </button>
            )}
            <label
              className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-5 text-sm font-black transition ${scorePages.length ? 'border-white/10 bg-black/25 text-white/70 hover:border-orange-200/30 hover:text-white' : 'border-orange-300/45 bg-orange-300 text-black hover:bg-orange-300/90'}`}
            >
              <Upload className="h-4 w-4" />{scorePages.length ? '添加页面' : '上传谱子'}
              <input
                ref={scoreFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => void addScorePages(event.target.files)}
              />
            </label>
          </div>
        </div>
        {(scoreWorking || scorePending) && <p aria-live="polite" className="mt-3 text-[11px] font-bold text-orange-100/55">{scoreWorking || '仅保存在本机，等待同步'}</p>}
        {scorePages.length ? (
          <>
            <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {scorePages.map((page, index) => (
                <li key={`${index}-${page.slice(-24)}`} className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <img src={page} alt={`${song.title} 谱子第 ${index + 1} 页`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black tabular-nums text-white/85">{index + 1}</span>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-5">
                    <button type="button" aria-label={`第 ${index + 1} 页上移`} disabled={index === 0} onClick={() => moveScorePage(index, -1)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/75 transition hover:bg-white/25 hover:text-white disabled:opacity-25"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label={`第 ${index + 1} 页下移`} disabled={index === scorePages.length - 1} onClick={() => moveScorePage(index, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/75 transition hover:bg-white/25 hover:text-white disabled:opacity-25"><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label={`删除第 ${index + 1} 页`} onClick={() => removeScorePage(index)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-rose-200/85 transition hover:bg-rose-400/30 hover:text-rose-100"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/35">
              <span>共 {scorePages.length} 页 · 会自动压缩并同步到云端，iPad 上打开即可看谱</span>
              <button type="button" onClick={removeAllScorePages} className="font-bold text-rose-200/60 transition hover:text-rose-200">删除全部</button>
            </p>
          </>
        ) : (
          <p className="mt-5 grid min-h-24 place-items-center rounded-2xl border border-dashed border-white/10 text-xs leading-6 text-white/25">
            还没有上传谱子<br />支持多选图片，会按顺序排成一本「谱书」
          </p>
        )}
      </section>
      )}

      {scoreViewerOpen && scorePages.length > 0 && (
        <ScoreViewer
          songId={song.id}
          songTitle={song.title}
          songArtist={song.artist}
          pages={scorePages}
          onClose={() => setScoreViewerOpen(false)}
        />
      )}

      {activeJournal !== 'score' && (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
        <div ref={formRef}>
        <JournalColumn icon={activeJournal === 'practice' ? <Guitar className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />} title={activeJournal === 'practice' ? '练习记录' : '路演记录'} subtitle={activeJournal === 'practice' ? '每一次慢练，都是下一次从容的伏笔。' : '把现场真实的回声，留给下一次演唱。'}>
          {activeJournal === 'practice' ? <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(90px,.8fr)_minmax(90px,.8fr)]">
              <Field label="练习时间"><input type="datetime-local" value={practiceAt} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setPracticeAt(event.target.value)} className={dateTimeInputClass} /></Field>
              <Field label="匹配度（70–100）"><input type="number" min="70" max="100" value={matchScore} onChange={(event) => setMatchScore(parseMatchScoreInput(event.target.value))} className={inputClass} /></Field>
              <Field label="品质"><div aria-readonly="true" className={`${inputClass} flex items-center font-black ${matchQuality ? qualityTextClass[matchQuality.tone] : 'text-white/25'}`}>{matchQuality?.label ?? '—'}</div></Field>
            </div>
            <Field label="练习感受"><textarea value={feelings} onChange={(event) => setFeelings(event.target.value)} placeholder="音色、情绪、舒适程度……" className={areaClass} /></Field>
            <button type="button" disabled={Boolean(busy)} onClick={() => void submitPractice()} className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-5 text-sm font-black text-black transition hover:bg-orange-300 disabled:opacity-40"><Save className="h-4 w-4" />{editingRecord?.kind === 'practice' ? '保存修改' : '保存练习记录'}</button>
          </> : <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="路演时间"><input type="datetime-local" value={roadshowAt} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setRoadshowAt(event.target.value)} className={dateTimeInputClass} /></Field>
              <Field label="观众称呼（可选）"><input value={audienceName} onChange={(event) => setAudienceName(event.target.value)} maxLength={100} placeholder="例如：穿蓝衣服的女生" className={inputClass} /></Field>
            </div>
            <Field label="现场反馈与观察"><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={4000} placeholder="Ta 怎么评价？现场发生了什么？我听见了什么？" className={`${areaClass} min-h-40`} /></Field>
            <button type="button" disabled={Boolean(busy)} onClick={() => void submitRoadshow()} className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-5 text-sm font-black text-black transition hover:bg-orange-300 disabled:opacity-40"><Save className="h-4 w-4" />{editingRecord?.kind === 'roadshow' ? '保存修改' : '保存路演记录'}</button>
          </>}
        </JournalColumn>
        </div>

        <JournalColumn icon={activeJournal === 'practice' ? <Target className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />} title={`${activeJournal === 'practice' ? '练习记录' : '路演记录'}数据`} subtitle={activeJournal === 'practice' ? '每一次练习都按时间沉淀在这里。' : '路演档案与每一次现场反馈都沉淀在这里。'}>
          {activeJournal === 'practice' ? (
            <RecordTimeline records={practices} busy={busy} editingId={editingRecord?.id ?? ''} onEdit={beginEdit} onDelete={removeRecord} />
          ) : <>
            <RoadshowArchiveTimeline records={roadshowHistory} />
            <RecordTimeline label="现场反馈" emptyText="还没有现场反馈" records={roadshowNotes} busy={busy} editingId={editingRecord?.id ?? ''} onEdit={beginEdit} onDelete={removeRecord} />
          </>}
        </JournalColumn>
      </div>
      )}
    </section>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
    <strong className="block truncate font-serif text-xl text-orange-100">{value}</strong>
    <small className="mt-1 block truncate text-[10px] tracking-[.14em] text-white/30">{label}</small>
  </div>
);
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="mb-2 block text-xs font-bold text-white/45">{label}</span>{children}</label>;
const JournalColumn = ({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) => <section className="rounded-[1.75rem] border border-white/10 bg-[#09090d]/80 p-5 backdrop-blur-xl sm:p-7"><div className="mb-6 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-200/15 bg-orange-300/10 text-orange-200">{icon}</span><div><h2 className="font-serif text-2xl font-black">{title}</h2><p className="mt-1 text-xs leading-5 text-white/35">{subtitle}</p></div></div><div className="space-y-4">{children}</div></section>;

const RoadshowArchiveTimeline = ({ records }: { records: RoadshowRecord[] }) => (
  <div className="border-t border-white/10 pt-5">
    <div className="mb-4 flex items-center justify-between gap-3"><p className="text-[10px] font-black tracking-[.2em] text-orange-200/55">参与路演</p><strong className="text-xs text-white/35">{records.length} 次</strong></div>
    {records.length ? <ol className="grid gap-2 sm:grid-cols-2">{records.map((record) => (
      <li key={record.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-3.5">
        <span className="grid h-10 min-w-16 shrink-0 place-items-center rounded-xl border border-orange-200/15 bg-orange-300/[.07] px-2 font-serif text-xs font-black text-orange-100">{displayRoadshowDate(record.date).slice(5)}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white/85">{record.title}</strong><small className="mt-1 block text-[10px] text-white/30">{displayRoadshowDate(record.date)} · 已编入路演歌曲</small></span>
      </li>
    ))}</ol> : <div className="grid min-h-24 place-items-center rounded-2xl border border-dashed border-white/10 text-xs text-white/25">尚未参与路演</div>}
  </div>
);

const RecordTimeline = ({ records, busy, editingId, onEdit, onDelete, label = 'HISTORY', emptyText = '还没有记录' }: { records: SongRecord[]; busy: string; editingId: string; onEdit: (record: SongRecord) => void; onDelete: (record: SongRecord) => void; label?: string; emptyText?: string }) => (
  <div className="border-t border-white/10 pt-5">
    <p className="mb-3 text-[10px] font-black tracking-[.24em] text-white/25">{label} · {records.length}</p>
    <div className="space-y-3">{records.map((record) => (
      <article key={record.id} title="双击编辑" onDoubleClick={() => onEdit(record)} className={`group cursor-pointer rounded-2xl border bg-white/[.025] p-4 transition ${editingId === record.id ? 'border-orange-300/45 bg-orange-300/[.045]' : 'border-white/10 hover:border-orange-200/25'}`}>
        <div className="flex items-start gap-3"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-300/10 text-orange-200">{record.kind === 'practice' ? <Target className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-xs text-white/35">{displayTime(record.occurredAt)}</p>{record.kind === 'practice' ? <PracticeRecordDetails record={record} /> : <><p className="mt-2 text-sm font-bold text-orange-100">{record.audienceName || '现场观众'}</p><RecordText label="反馈" text={record.feedback} /></>}</div><button type="button" disabled={busy === record.id} onDoubleClick={(event) => event.stopPropagation()} onClick={() => onDelete(record)} aria-label="删除记录" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/20 transition hover:bg-red-300/10 hover:text-red-200 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>
      </article>
    ))}{!records.length && <div className="grid min-h-24 place-items-center rounded-2xl border border-dashed border-white/10 text-xs text-white/25">{emptyText}</div>}</div>
  </div>
);

const PracticeRecordDetails = ({ record }: { record: PracticeRecord }) => {
  const reflection = getPracticeReflection(record);
  return <><p className="mt-2 text-sm font-bold text-orange-100">匹配度 {record.matchScore}</p>{record.feelings && <RecordText label="感受" text={record.feelings} />}{reflection && <RecordText label="弹唱感想" text={reflection} />}</>;
};

const RecordText = ({ label, text }: { label: string; text: string }) => <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/50"><span className="mr-2 text-[10px] font-black tracking-wider text-white/25">{label}</span>{text}</p>;

export default SongDetailPanel;
