import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Disc3, Headphones, LockKeyhole, Pause, Play, Radio, RotateCcw, Search, Send, Users, X } from 'lucide-react';
import { callListeningGame, pullCurrentListeningGame, type Credentials } from './songRequestCloud';
import { gameErrorMessage, isGameRoomId, type ListeningGameRoom } from './listeningGame';
import { QUIZ_LEVELS, type QuizAssignments } from './songQuizLibrary';
import type { Song } from './songCatalog';

const actionStyle = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35';
const primaryStyle = `${actionStyle} border-orange-200/40 bg-orange-200 text-[#25180e] hover:bg-orange-100`;
const secondaryStyle = `${actionStyle} border-white/15 bg-white/[.04] text-white/75 hover:border-white/30 hover:text-white`;
const phaseText = { waiting: '等候开场', listening: '正在演奏 · 可先选歌', open: '已开放提交', revealed: '本轮答案已公布', ended: '本场游戏已结束' };

export default function ListeningGamePage({ session, manager, songs, assignments, initialRoomId, onBack, onLogin }: {
  session: Credentials | null; manager: boolean; songs: Song[]; assignments: QuizAssignments;
  initialRoomId: string | null; onBack: () => void; onLogin?: () => void;
}) {
  const credentials = manager ? session : null;
  const [roomId, setRoomId] = useState<string | null>(() => isGameRoomId(initialRoomId) ? initialRoomId : null);
  const [room, setRoom] = useState<ListeningGameRoom | null>(null);
  const [selection, setSelection] = useState({ roundId: '', songId: '' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [choosingNext, setChoosingNext] = useState(false);
  const [retry, setRetry] = useState(0);
  const [missingRoom, setMissingRoom] = useState(false);
  const mutationVersionRef = useRef(0);
  const applyRoom = (next: ListeningGameRoom | null) => {
    setRoom(previous => previous && next && previous.id === next.id && previous.revision > next.revision ? previous : next);
    setConnected(true);
    setLoaded(true);
    setMissingRoom(false);
  };

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    const refresh = async () => {
      if (!active || inFlight) return;
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(refresh, 3000); return; }
      inFlight = true;
      const version = mutationVersionRef.current;
      try {
        const next = roomId ? await callListeningGame('pull', { roomId }, credentials) : await pullCurrentListeningGame(credentials);
        if (active && version === mutationVersionRef.current) { applyRoom(next); setError(''); }
      } catch (cause) {
        if (active && version === mutationVersionRef.current) {
          setConnected(false);
          setLoaded(true);
          setError(gameErrorMessage(cause));
          if (cause instanceof Error && cause.message === 'GAME_NOT_FOUND') setMissingRoom(true);
        }
      } finally {
        inFlight = false;
        if (active) timer = setTimeout(refresh, manager ? 3000 : 2000);
      }
    };
    void refresh();
    const onVisible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', onVisible); };
  }, [roomId, credentials, manager, retry]);

  useEffect(() => {
    if (!room?.roundId) return;
    let saved = '';
    try { saved = sessionStorage.getItem(`jieyou-game-choice:${room.id}:${room.roundId}`) ?? ''; } catch {}
    setSelection({ roundId: room.roundId, songId: saved });
  }, [room?.id, room?.roundId]);

  const act = async (action: 'create' | 'start' | 'open' | 'lock' | 'reveal' | 'end' | 'submit', songId?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    ++mutationVersionRef.current;
    setBusy(true); setError('');
    try {
      const next = await callListeningGame(action, action === 'create' ? {} : { roomId: room!.id, roundId: room?.roundId ?? null, ...(songId ? { songId } : {}) }, action === 'submit' ? null : credentials);
      ++mutationVersionRef.current;
      applyRoom(next);
      if (action === 'create') setRoomId(null);
      if (action === 'start') { setChoosingNext(false); setQuery(''); }
    } catch (cause) {
      setError(gameErrorMessage(cause));
      setConnected(false);
      setRetry(value => value + 1);
    } finally { busyRef.current = false; setBusy(false); }
  };

  const library = songs.filter(song => assignments[song.id]);
  const filtered = library.filter(song => `${song.title} ${song.artist}`.toLowerCase().includes(query.trim().toLowerCase()));
  const answer = room?.options.find(song => song.id === room.answerSongId);
  const submitted = room?.submission;
  const selectedId = submitted?.songId ?? (selection.roundId === room?.roundId ? selection.songId : '');
  const revealed = room?.phase === 'revealed' || room?.phase === 'ended';
  const choosingSong = manager && (room?.phase === 'waiting' || (room?.phase === 'revealed' && choosingNext));
  const selectOption = (songId: string) => {
    if (!room?.roundId || submitted || revealed) return;
    setSelection({ roundId: room.roundId, songId });
    try { sessionStorage.setItem(`jieyou-game-choice:${room.id}:${room.roundId}`, songId); } catch {}
  };

  return <main className="relative z-20 min-h-screen bg-[radial-gradient(ellipse_at_20%_0%,rgba(194,114,55,.13),transparent_55%)] px-3 py-3 text-white sm:px-8 sm:py-6">
    <div className="mx-auto max-w-6xl">
      <header className="mb-3 flex items-center justify-between gap-3 sm:mb-5">
        <button type="button" onClick={onBack} className={secondaryStyle}><ArrowLeft className="h-4 w-4" />{manager ? '听歌识曲' : '点歌台'}</button>
        <div className="flex items-center gap-4"><span className="flex items-center gap-2 text-xs text-white/45"><span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-300' : 'bg-white/30'}`} />{manager ? '管理员控制台' : '现场猜歌'}</span>{!manager && onLogin && <button type="button" onClick={onLogin} className="min-h-10 text-xs text-white/55 transition hover:text-white">管理员登录</button>}</div>
      </header>

      {error && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200/20 bg-red-950/25 px-5 py-4 text-sm text-red-100"><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)} className="inline-flex min-h-9 items-center gap-2 text-xs font-bold"><RotateCcw className="h-3.5 w-3.5" />重新连接</button></div>}

      {!room && loaded ? <section className="grid min-h-80 place-items-center rounded-[2rem] border border-orange-200/15 bg-black/30 px-6 py-12 text-center">
        <div><Headphones className="mx-auto mb-6 h-12 w-12 text-orange-200/70" /><h2 className="font-serif text-2xl font-bold">{manager ? '把路演变成一场猜歌游戏' : '你已到场，好歌即将开始。'}</h2><p className="mx-auto mb-8 mt-4 max-w-sm text-sm leading-7 text-white/45">{manager ? '创建现场游戏后，扫描现有实体二维码的游客会自动加入。选定歌曲，准备开始演奏。' : '等待管理员开始现场游戏，题目会自动出现在这里，无需重新扫码。'}</p>{manager && <button type="button" onClick={() => void act('create')} disabled={busy} className={primaryStyle}><Play className="h-4 w-4" />{busy ? '创建中…' : '创建现场游戏'}</button>}{!manager && missingRoom && <button type="button" onClick={() => setRoomId(null)} className={secondaryStyle}>加入当前游戏</button>}</div>
      </section> : !room ? <div role="status" className="grid min-h-80 place-items-center text-sm text-white/50">正在连接现场游戏…</div> : <div className="grid items-start gap-6">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/35 sm:rounded-[2rem]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[.07] px-3 py-3 sm:px-7 sm:py-5">
            <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs font-bold text-orange-100 sm:text-sm"><Radio className={`h-4 w-4 ${room.phase === 'open' ? 'text-emerald-300' : 'text-orange-200/65'}`} />{phaseText[room.phase]}</span>
            <span className="flex items-center gap-2 text-xs text-white/45 sm:gap-4"><span className="tabular-nums">第 {room.roundNumber || 1} 轮</span><span className="inline-flex items-center gap-1.5 tabular-nums"><Users className="h-3.5 w-3.5" />{room.submissionCount} 人已提交</span></span>
          </div>
          <div className="p-3 sm:p-7">
            {manager && answer && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200/15 bg-orange-200/[.05] px-5 py-4"><div><p className="text-[10px] font-bold tracking-widest text-orange-100/45">{revealed ? '本轮正确答案' : '本轮演奏 · 仅管理员可见'}</p><h2 className="mt-2 text-xl font-black">{answer.title}</h2></div><Headphones className="h-7 w-7 text-orange-200/50" /></div>}
            {choosingSong ? <div>
              <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-serif text-2xl font-bold">{room.roundNumber ? '选择下一首演奏歌曲' : '选择本轮演奏歌曲'}</h2><span className="shrink-0 text-xs text-white/35">题库 {library.length} 首</span></div>
              <label className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3"><Search className="h-4 w-4 shrink-0 text-white/35" /><input aria-label="搜索本轮演奏歌曲" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索歌曲" className="w-full bg-transparent text-sm outline-none placeholder:text-white/30" /></label>
              <p className="mb-4 text-xs leading-6 text-white/40">点击歌曲即开始演奏轮次；自动加入 9 首题库歌曲作为干扰项。</p>
              <div className="grid max-h-[28rem] grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2">{filtered.map(song => <button key={song.id} type="button" disabled={busy || !connected || library.length < 10} onClick={() => void act('start', song.id)} className="group flex min-h-16 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.025] px-4 py-3 text-left transition hover:border-orange-200/35 hover:bg-orange-200/[.07] disabled:cursor-not-allowed disabled:opacity-35"><span className="min-w-0"><span className="block truncate text-sm font-bold">{song.title}</span></span><span className="shrink-0 text-[10px] text-orange-100/40">{QUIZ_LEVELS.find(level => level.id === assignments[song.id])?.label}</span></button>)}</div>
              {!filtered.length && <p className="py-8 text-center text-sm text-white/40">{library.length ? '没有匹配的歌曲' : '正在读取听歌识曲题库，请稍候。'}</p>}
              {library.length > 0 && library.length < 10 && <p className="mt-4 text-sm text-orange-200">题库至少需要 10 首歌曲，才能生成完整选项。</p>}
            </div> : room.phase === 'waiting' ? <div className="py-16 text-center"><Disc3 className="mx-auto h-12 w-12 text-orange-200/40" /><h2 className="mt-6 font-serif text-2xl font-bold">你已到场，好歌即将开始。</h2><p className="mt-3 text-sm text-white/40">等待管理员选定演奏歌曲，页面会自动更新。</p></div> : <>
              {!manager && revealed && answer && <div className="mb-6 text-center"><p className="text-xs text-orange-200/60">本轮正确答案</p><h2 className="mt-3 font-serif text-3xl font-black">{answer.title}</h2><p className={`mt-4 text-sm font-bold ${submitted?.songId === answer.id ? 'text-emerald-200' : 'text-white/60'}`}>{submitted ? submitted.songId === answer.id ? '猜对了！这段旋律你记得。' : '差一点，下首歌再试试。' : '本轮你还没有提交答案。'}</p></div>}
              <div role={manager ? 'group' : 'radiogroup'} aria-label="本轮歌曲选项" className="grid grid-cols-2 gap-2 sm:gap-2.5">{room.options.map((song, index) => {
                const selected = selectedId === song.id;
                const correct = revealed && room.answerSongId === song.id;
                return <button key={song.id} type="button" role={manager ? undefined : 'radio'} aria-checked={manager ? undefined : selected} disabled={manager || Boolean(submitted) || revealed || busy} onClick={() => selectOption(song.id)} className={`relative flex min-h-[3.25rem] items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-200 disabled:cursor-default sm:min-h-16 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3 ${correct ? 'border-emerald-200/50 bg-emerald-200/10' : selected ? 'border-orange-200/60 bg-orange-200/10' : 'border-white/10 bg-white/[.025] enabled:hover:border-white/25 enabled:hover:bg-white/[.05]'}`}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold sm:h-8 sm:w-8 sm:text-xs ${correct ? 'border-emerald-200/30 text-emerald-200' : selected ? 'border-orange-200/40 text-orange-100' : 'border-white/10 text-white/30'}`}>{correct || selected ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : String.fromCharCode(65 + index)}</span>
                  <span className="min-w-0 flex-1 break-words text-[13px] font-bold leading-5 sm:text-sm">{song.title}</span>
                  {(manager || revealed) && <span className="shrink-0 text-[10px] tabular-nums text-white/40 sm:text-xs">{room.counts?.[song.id] ?? 0} 人</span>}
                </button>;
              })}</div>
              {manager ? <div className="mt-7 flex flex-wrap gap-3 border-t border-white/10 pt-6">
                {room.phase === 'listening' && <button type="button" disabled={busy || !connected} onClick={() => void act('open')} className={primaryStyle}><Send className="h-4 w-4" />开放提交</button>}
                {room.phase === 'open' && <button type="button" disabled={busy || !connected} onClick={() => void act('lock')} className={secondaryStyle}><Pause className="h-4 w-4" />暂停提交</button>}
                {['listening', 'open'].includes(room.phase) && <button type="button" disabled={busy || !connected} onClick={() => void act('reveal')} className={secondaryStyle}><Check className="h-4 w-4" />结束本轮并公布答案</button>}
                {room.phase === 'revealed' && <><button type="button" disabled={busy || !connected} onClick={() => setChoosingNext(true)} className={primaryStyle}><Play className="h-4 w-4" />选择下一首</button><button type="button" disabled={busy || !connected} onClick={() => void act('end')} className={secondaryStyle}><X className="h-4 w-4" />结束本场</button></>}
                {room.phase === 'ended' && <button type="button" disabled={busy} onClick={() => void act('create')} className={primaryStyle}><Play className="h-4 w-4" />创建新游戏</button>}
                {busy && <span role="status" className="self-center text-xs text-white/40">正在同步…</span>}
              </div> : <div className="mt-4 border-t border-white/10 pt-3 sm:mt-7 sm:pt-6">
                {submitted && !revealed ? <p role="status" className="flex items-center justify-center gap-2 py-3 text-sm text-emerald-200"><Check className="h-4 w-4" />答案已提交，等待管理员公布结果。</p> : !revealed ? <><button type="button" disabled={busy || !connected || room.phase !== 'open' || !selectedId} onClick={() => void act('submit', selectedId)} className={`${primaryStyle} w-full`}>{room.phase === 'open' ? <Send className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}{busy ? '正在提交…' : room.phase === 'open' ? '提交答案' : '等待管理员开放提交'}</button><p className="mt-2 text-center text-[11px] leading-5 text-white/40 sm:mt-3 sm:text-xs sm:leading-6">{room.phase === 'open' ? '每轮只能提交一次，确认后不能修改。' : '现在可以自由选择和修改，开放后再确认提交。'}</p></> : <p role="status" className="text-center text-sm leading-6 text-white/40">{room.phase === 'ended' ? '谢谢参与，我们下一场路演见。' : '等待下一首歌，页面会自动更新。'}</p>}
              </div>}
            </>}
          </div>
        </section>
      </div>}
    </div>
  </main>;
}
