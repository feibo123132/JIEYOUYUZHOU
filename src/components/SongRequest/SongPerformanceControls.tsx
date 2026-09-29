import { useEffect, useRef, useState } from 'react';
import { Disc3, Guitar } from 'lucide-react';
import type { Song } from './songCatalog';
import { ROADSHOW_LOCATIONS, type RoadshowRecord } from './roadshow';
import type { SongRecordSession } from './songRecords';
import {
  judgeCloudSongQuizPlay, pullCloudSongQuizPlay, recordCloudLatestRoadshowSing, startCloudSongQuizPlay, undoCloudSongQuizPlay,
  type CloudRoadshowSingState, type CloudSongQuizState, type SongQuizStats,
} from './songRequestCloud';

export default function SongPerformanceControls({ song, session, latestRoadshow, singState, ready, onRoadshowRecorded }: {
  song: Song;
  session: SongRecordSession;
  latestRoadshow: RoadshowRecord | null;
  singState: CloudRoadshowSingState;
  ready: boolean;
  onRoadshowRecorded: (state: CloudRoadshowSingState) => void;
}) {
  const [quizState, setQuizState] = useState<CloudSongQuizState | null>(null);
  const event = quizState?.event;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const startId = useRef<string | null>(null);
  const singId = useRef<string | null>(null);
  const singMinusId = useRef<string | null>(null);
  const venue = ROADSHOW_LOCATIONS.find(location => location === latestRoadshow?.location);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setQuizState(null);
    setMessage('');
    startId.current = null;
    singId.current = null;
    singMinusId.current = null;
    pullCloudSongQuizPlay(session, song.id).then(value => { if (active) setQuizState(value); })
      .catch(() => { if (active) setMessage('识曲记录暂时未连接，请刷新后重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.alias, session.password, song.id]);

  const act = async (kind: 'sing' | 'sing-minus' | 'quiz' | 'quiz-minus' | 'correct' | 'wrong') => {
    if (locked.current) return;
    locked.current = true;
    setBusy(kind);
    setMessage('');
    try {
      if (kind === 'sing' || kind === 'sing-minus') {
        const requestId = kind === 'sing' ? singId : singMinusId;
        requestId.current ??= `sing-play-${crypto.randomUUID()}`;
        const saved = await recordCloudLatestRoadshowSing(session, song.id, requestId.current, kind === 'sing' ? 1 : -1);
        requestId.current = null;
        onRoadshowRecorded(saved);
        setMessage(`${saved.location} · ${kind === 'sing' ? '已增加一次' : '已减少一次'}，路演演唱 ${(saved.location ? saved.roadshowSingCountsByLocation?.[saved.location]?.[song.id] : 0) ?? 0} 次。`);
      } else if (kind === 'quiz-minus') {
        if (!event) return;
        const saved = await undoCloudSongQuizPlay(session, event.id);
        setQuizState(saved);
        setMessage(`${saved.location} · 已撤回一次识曲演唱及其判定。`);
        window.dispatchEvent(new Event('jieyou-quiz-ranking-updated'));
      } else {
        let saved: CloudSongQuizState;
        if (kind === 'quiz') {
          startId.current ??= `quiz-play-${crypto.randomUUID()}`;
          saved = await startCloudSongQuizPlay(session, song, startId.current);
          startId.current = null;
        } else {
          if (!event) return;
          saved = await judgeCloudSongQuizPlay(session, event.id, kind === 'correct');
        }
        setQuizState(saved);
        setMessage(kind === 'quiz' ? `${saved.event?.location} · 已记录识曲演唱，请点击 ✅ 或 ❌ 判定。` : kind === 'correct' ? '已记录答对。' : '已记录答错。');
        window.dispatchEvent(new Event('jieyou-quiz-ranking-updated'));
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setMessage(code === 'NO_LATEST_ROADSHOW' ? '请先创建路演，并设置最新一次路演的地点。'
        : code === 'INVALID_ACTION' ? '云端尚未更新此功能，记录未保存。'
        : '记录未确认保存，请检查网络后重试。');
    } finally {
      locked.current = false;
      setBusy('');
    }
  };
  const button = 'inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-35';
  const unavailable = !venue || Boolean(busy);
  const venueSingCount = venue ? singState.roadshowSingCountsByLocation?.[venue]?.[song.id] ?? 0 : 0;
  const statisticsText = (stats: SongQuizStats) => `演唱 ${stats.playCount} 次 · 答题 ${stats.answerCount} 次 · 答对 ${stats.correctCount} 次 · 正确率 ${stats.accuracy === null ? '—' : `${stats.accuracy}%`}`;
  return <div className="mt-4 rounded-2xl border border-orange-200/10 bg-orange-300/[.035] p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="路演演唱次数" className="inline-flex items-center gap-1.5">
        <button type="button" disabled={unavailable || !ready} onClick={() => void act('sing')} title={venue ? `按最新路演地点 ${venue} 记录一次` : '请先设置最新路演的地点'} className={`${button} border-orange-200/25 bg-orange-300/10 text-orange-100 hover:bg-orange-300/20`}><Guitar className="h-4 w-4" />{busy === 'sing' ? '记录中…' : '路演演唱 +1'}</button>
        <button type="button" aria-label="路演演唱减少一次" disabled={unavailable || !ready || venueSingCount <= 0} onClick={() => void act('sing-minus')} title={venue ? `减少 ${venue} 的一次路演演唱` : '请先设置最新路演的地点'} className={`${button} border-orange-200/20 bg-black/25 text-orange-100/80 hover:bg-orange-300/10`}>{busy === 'sing-minus' ? '撤回中…' : '−1'}</button>
      </div>
      <div role="group" aria-label="听歌识曲演唱次数" className="inline-flex items-center gap-1.5">
        <button type="button" disabled={unavailable || loading || Boolean(event && event.correct === undefined)} onClick={() => void act('quiz')} title={event?.correct === undefined && event ? '请先判定这一次识曲结果' : venue ? `按最新路演地点 ${venue} 记录一次` : '请先设置最新路演的地点'} className={`${button} border-sky-200/25 bg-sky-300/10 text-sky-100 hover:bg-sky-300/20`}><Disc3 className="h-4 w-4" />{busy === 'quiz' ? '记录中…' : '听歌识曲 +1'}</button>
        <button type="button" aria-label="听歌识曲撤回一次" disabled={!event || loading || Boolean(busy)} onClick={() => void act('quiz-minus')} title={event ? `撤回 ${event.location} 最近一次识曲演唱及判定` : '还没有可撤回的识曲演唱'} className={`${button} border-sky-200/20 bg-black/25 text-sky-100/80 hover:bg-sky-300/10`}>{busy === 'quiz-minus' ? '撤回中…' : '−1'}</button>
      </div>
      <div role="group" aria-label="本次听歌识曲判定" className="inline-flex gap-2">
        <button type="button" aria-label="本次识曲答对" aria-pressed={event?.correct === true} disabled={!event || loading || Boolean(busy)} onClick={() => void act('correct')} className={`${button} w-11 px-0 text-lg ${event?.correct === true ? 'border-emerald-300/55 bg-emerald-300/20' : 'border-white/10 bg-black/25 hover:border-emerald-200/40'}`}>✅</button>
        <button type="button" aria-label="本次识曲答错" aria-pressed={event?.correct === false} disabled={!event || loading || Boolean(busy)} onClick={() => void act('wrong')} className={`${button} w-11 px-0 text-lg ${event?.correct === false ? 'border-rose-300/55 bg-rose-300/20' : 'border-white/10 bg-black/25 hover:border-rose-200/40'}`}>❌</button>
      </div>
      <span className="text-xs text-white/45">{venue ? `最新路演 · ${venue}` : '尚未设置最新路演地点'}</span>
    </div>
    {ready && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45">{ROADSHOW_LOCATIONS.map(location => <span key={location}>{location} · 路演演唱 {singState.roadshowSingCountsByLocation?.[location]?.[song.id] ?? 0} 次</span>)}</div>}
    {quizState?.stats && <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px] text-sky-100/65" aria-label="听歌识曲统计" aria-live="polite">
      <p className="font-bold text-sky-100/85">听歌识曲总计 · {statisticsText(quizState.stats)}</p>
      {ROADSHOW_LOCATIONS.map(location => <p key={location} className={location === venue ? 'text-sky-100/85' : ''}>{location} · {statisticsText(quizState.statsByLocation[location])}</p>)}
    </div>}
    {event && <p className="mt-2 text-[11px] text-sky-100/60">最近一次识曲 · {event.location} · {event.correct === undefined ? '待判定' : event.correct ? '✅ 答对' : '❌ 答错'}</p>}
    {message && <p role="status" className="mt-2 text-xs text-orange-100/80">{message}</p>}
  </div>;
}
