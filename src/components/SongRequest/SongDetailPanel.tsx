import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Cloud, Guitar, Lock, MessageCircle, Save, Target, Trash2 } from 'lucide-react';
import type { Song } from './songCatalog';
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
  session: SongRecordSession | null;
  syncStatus?: string;
  onRecordsChange: (records: SongRecord[]) => void;
  onOpenPrivateSpace: () => void;
}

type JournalKind = 'practice' | 'roadshow';

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
const displayTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

const SongDetailPanel = ({ song, records, session, syncStatus = '', onRecordsChange, onOpenPrivateSpace }: SongDetailPanelProps) => {
  const songRecords = useMemo(() => sortSongRecords(records.filter((record) => record.songId === song.id)), [records, song.id]);
  const practices = songRecords.filter((record): record is PracticeRecord => record.kind === 'practice');
  const roadshows = songRecords.filter((record): record is SongRoadshowRecord => record.kind === 'roadshow');
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
  const formRef = useRef<HTMLDivElement>(null);
  const matchQuality = getMatchQuality(Number(matchScore));

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

  return (
    <section className="space-y-6">
      <div className="relative w-full overflow-hidden rounded-[2rem] border border-orange-200/15 bg-[linear-gradient(125deg,rgba(67,29,13,.72),rgba(8,8,13,.9)_58%)] p-6 shadow-[0_28px_90px_rgba(0,0,0,.34)] sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-start">
          <div>
            <div data-journal-eyebrow className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-[10px] font-black tracking-[.3em] text-orange-300/65">MY SONG JOURNAL · {song.artist}</p>
              {(syncStatus || message) && <p className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[.12em] text-orange-100/55" role="status"><Cloud className="h-2.5 w-2.5" />{message || syncStatus}</p>}
            </div>
            <h1 className="mt-3 font-serif text-4xl font-black tracking-[-.04em] sm:text-6xl">{song.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/45">{song.hotComment || `${song.artist} · ${song.category}`}</p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
            <div className="grid min-w-48 grid-cols-2 gap-2">
              <Stat label="练习" value={`${practices.length} 次`} />
              <Stat label="匹配度" value={averageScore === null ? '—' : `${averageScore}`} />
            </div>
            <div data-journal-toolbar className="flex w-full flex-wrap items-center justify-end gap-3">
              <div role="group" aria-label="切换记录类型" className="inline-flex rounded-2xl border border-white/10 bg-black/25 p-1">
                <button type="button" aria-pressed={activeJournal === 'practice'} onClick={() => setActiveJournal('practice')} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${activeJournal === 'practice' ? 'bg-orange-300 text-black shadow-[0_8px_25px_rgba(251,146,60,.2)]' : 'text-white/40 hover:text-white/75'}`}><Guitar className="h-4 w-4" />练习</button>
                <button type="button" aria-pressed={activeJournal === 'roadshow'} onClick={() => setActiveJournal('roadshow')} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${activeJournal === 'roadshow' ? 'bg-orange-300 text-black shadow-[0_8px_25px_rgba(251,146,60,.2)]' : 'text-white/40 hover:text-white/75'}`}><MessageCircle className="h-4 w-4" />路演</button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
            <Field label="弹唱感想"><textarea value={singingReflection} onChange={(event) => setSingingReflection(event.target.value)} placeholder="哪里卡住、为什么，以及下次怎样调整……" className={`${areaClass} min-h-36`} /></Field>
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

        <JournalColumn icon={activeJournal === 'practice' ? <Target className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />} title={`${activeJournal === 'practice' ? '练习记录' : '路演记录'}数据`} subtitle={activeJournal === 'practice' ? '每一次练习都按时间沉淀在这里。' : '每一次现场反馈都按时间沉淀在这里。'}>
          <RecordTimeline records={activeJournal === 'practice' ? practices : roadshows} busy={busy} editingId={editingRecord?.id ?? ''} onEdit={beginEdit} onDelete={removeRecord} />
        </JournalColumn>
      </div>
    </section>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center"><strong className="block font-serif text-xl text-orange-100">{value}</strong><small className="mt-1 block text-[10px] tracking-[.14em] text-white/30">{label}</small></div>;
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="mb-2 block text-xs font-bold text-white/45">{label}</span>{children}</label>;
const JournalColumn = ({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) => <section className="rounded-[1.75rem] border border-white/10 bg-[#09090d]/80 p-5 backdrop-blur-xl sm:p-7"><div className="mb-6 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-200/15 bg-orange-300/10 text-orange-200">{icon}</span><div><h2 className="font-serif text-2xl font-black">{title}</h2><p className="mt-1 text-xs leading-5 text-white/35">{subtitle}</p></div></div><div className="space-y-4">{children}</div></section>;

const RecordTimeline = ({ records, busy, editingId, onEdit, onDelete }: { records: SongRecord[]; busy: string; editingId: string; onEdit: (record: SongRecord) => void; onDelete: (record: SongRecord) => void }) => (
  <div className="border-t border-white/8 pt-5">
    <p className="mb-3 text-[10px] font-black tracking-[.24em] text-white/25">HISTORY · {records.length}</p>
    <div className="space-y-3">{records.map((record) => (
      <article key={record.id} title="双击编辑" onDoubleClick={() => onEdit(record)} className={`group cursor-pointer rounded-2xl border bg-white/[.025] p-4 transition ${editingId === record.id ? 'border-orange-300/45 bg-orange-300/[.045]' : 'border-white/8 hover:border-orange-200/25'}`}>
        <div className="flex items-start gap-3"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-300/10 text-orange-200">{record.kind === 'practice' ? <Target className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-xs text-white/35">{displayTime(record.occurredAt)}</p>{record.kind === 'practice' ? <PracticeRecordDetails record={record} /> : <><p className="mt-2 text-sm font-bold text-orange-100">{record.audienceName || '现场观众'}</p><RecordText label="反馈" text={record.feedback} /></>}</div><button type="button" disabled={busy === record.id} onDoubleClick={(event) => event.stopPropagation()} onClick={() => onDelete(record)} aria-label="删除记录" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/20 transition hover:bg-red-300/10 hover:text-red-200 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>
      </article>
    ))}{!records.length && <div className="grid min-h-24 place-items-center rounded-2xl border border-dashed border-white/10 text-xs text-white/25">还没有记录</div>}</div>
  </div>
);

const PracticeRecordDetails = ({ record }: { record: PracticeRecord }) => {
  const reflection = getPracticeReflection(record);
  return <><p className="mt-2 text-sm font-bold text-orange-100">匹配度 {record.matchScore}</p>{record.feelings && <RecordText label="感受" text={record.feelings} />}{reflection && <RecordText label="弹唱感想" text={reflection} />}</>;
};

const RecordText = ({ label, text }: { label: string; text: string }) => <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/50"><span className="mr-2 text-[10px] font-black tracking-wider text-white/25">{label}</span>{text}</p>;

export default SongDetailPanel;
