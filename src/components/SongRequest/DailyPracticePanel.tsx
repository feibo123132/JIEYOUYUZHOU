import { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Cloud,
  Edit3,
  Guitar,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type { Song } from './songCatalog';
import {
  groupPracticeRecordsByCalendar,
  getMatchQuality,
  localDateKey,
  parseMatchScoreInput,
  sortSongRecords,
  type PracticeRecord,
  type SongRecord,
} from './songRecords';
import {
  saveSongRecords,
  type Credentials,
} from './songRequestCloud';

interface DailyPracticePanelProps {
  songs: Song[];
  records: SongRecord[];
  credentials: Credentials;
  syncStatus?: string;
  onRecordsChange: (records: SongRecord[]) => void;
}

interface PracticeDraft {
  key: string;
  recordId?: string;
  song: Song;
  score: number | '';
  feelings: string;
  reflection: string;
}

const PRACTICE_SCROLL_THRESHOLD = 8;

const scrollRegionProps = (baseClass: string, recordCount: number, label: string) => {
  const scrollable = recordCount > PRACTICE_SCROLL_THRESHOLD;
  return {
    className: `${baseClass}${scrollable ? ' practice-scroll-region' : ''}`,
    ...(scrollable ? { tabIndex: 0, 'aria-label': label } : {}),
  };
};

const pad = (value: number) => String(value).padStart(2, '0');

const currentTime = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const qualityOf = (score: number) => {
  const quality = getMatchQuality(score) ?? { label: '—', tone: 'white' as const };
  return { label: quality.label, className: `practice-quality ${quality.tone}` };
};

const dateTimeParts = (value: string) => {
  const date = new Date(value);
  return {
    date: localDateKey(date),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
};

const monthLabel = (key: string) => {
  const [year, month] = key.split('-');
  return `${year}年${Number(month)}月`;
};

const dayLabel = (key: string) => {
  const date = new Date(`${key}T12:00:00`);
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日 · 周${'日一二三四五六'[date.getDay()]}`;
};

const makeDraft = (song: Song, record?: PracticeRecord): PracticeDraft => ({
  key: record?.id ?? `${song.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  recordId: record?.id,
  song,
  score: record?.matchScore ?? 80,
  feelings: record?.feelings ?? '',
  reflection: record?.problems || record?.improvements
    ? [record.problems, record.improvements].filter(Boolean).join('\n')
    : '',
});

export default function DailyPracticePanel({
  songs,
  records,
  credentials,
  syncStatus,
  onRecordsChange,
}: DailyPracticePanelProps) {
  const today = localDateKey(new Date());
  const [practiceDate, setPracticeDate] = useState(today);
  const [practiceTime, setPracticeTime] = useState(currentTime);
  const [query, setQuery] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const [drafts, setDrafts] = useState<PracticeDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  const groupedRecords = useMemo(
    () => groupPracticeRecordsByCalendar(records),
    [records],
  );

  const visibleSongs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return songs
      .filter((song) => !keyword || `${song.title} ${song.artist}`.toLowerCase().includes(keyword))
      .slice(0, 24);
  }, [query, songs]);

  const selectedIds = useMemo(() => new Set(drafts.map((draft) => draft.song.id)), [drafts]);

  const toggleSong = (song: Song) => {
    setMessage('');
    setDrafts((current) => {
      const selected = current.some((draft) => draft.song.id === song.id && !draft.recordId);
      if (selected) return current.filter((draft) => !(draft.song.id === song.id && !draft.recordId));
      if (current.length >= 50) {
        setMessage('每次最多保存 50 首歌曲。');
        return current;
      }
      return [...current, makeDraft(song)];
    });
  };

  const addManualSong = () => {
    const title = manualTitle.trim();
    if (!title) {
      setMessage('请先填写歌曲名。');
      return;
    }
    if (drafts.length >= 50) {
      setMessage('每次最多保存 50 首歌曲。');
      return;
    }
    const artist = manualArtist.trim() || '未知歌手';
    const song: Song = {
      id: `manual-practice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      artist,
      category: '曲库外歌曲',
      featured: false,
    };
    setDrafts((current) => [...current, makeDraft(song)]);
    setManualTitle('');
    setManualArtist('');
    setMessage('');
  };

  const updateDraft = (key: string, patch: Partial<PracticeDraft>) => {
    setDrafts((current) => current.map((draft) => (
      draft.key === key ? { ...draft, ...patch } : draft
    )));
  };

  const saveBatch = async () => {
    if (!drafts.length) {
      setMessage('请先选择今天练习的歌曲。');
      return;
    }
    const invalid = drafts.some((draft) => (
      draft.score === '' || draft.score < 70 || draft.score > 100
    ));
    if (invalid) {
      setMessage('匹配度须为 70–100 的整数。');
      return;
    }

    const occurredAt = new Date(`${practiceDate}T${practiceTime}:00`).toISOString();
    const updatedAt = new Date().toISOString();
    const payload: PracticeRecord[] = drafts.map((draft, index) => ({
      id: draft.recordId ?? `practice-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'practice',
      songId: draft.song.id,
      songTitle: draft.song.title,
      songArtist: draft.song.artist,
      occurredAt,
      matchScore: Number(draft.score),
      feelings: draft.feelings.trim(),
      problems: draft.reflection.trim(),
      improvements: '',
      updatedAt,
    }));

    setBusy(true);
    setMessage('正在同步……');
    try {
      const saved = await saveSongRecords(credentials, payload);
      const savedIds = new Set(saved.map((record) => record.id));
      onRecordsChange(sortSongRecords([
        ...records.filter((record) => !savedIds.has(record.id)),
        ...saved,
      ]));
      setDrafts([]);
      setMessage(`已同步 ${saved.length} 首练习记录。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '云端暂时没有回应，当前内容尚未同步。');
    } finally {
      setBusy(false);
    }
  };

  const editRecord = (record: PracticeRecord) => {
    const song = songs.find((candidate) => candidate.id === record.songId) ?? {
      id: record.songId,
      title: record.songTitle,
      artist: record.songArtist,
      category: '历史歌曲',
      featured: false,
    };
    const parts = dateTimeParts(record.occurredAt);
    setPracticeDate(parts.date);
    setPracticeTime(parts.time);
    setDrafts([makeDraft(song, record)]);
    setMessage(`正在编辑《${record.songTitle}》。`);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <section className="daily-practice-panel">
      <div className="archive-section-heading">
        <div>
          <span className="eyebrow">DAILY PRACTICE</span>
          <h2>日常练习</h2>
          <p>一天批量记十几首，也只占一小格。</p>
        </div>
        <span className="practice-sync-status"><Cloud size={13} />{syncStatus || '已同步'}</span>
      </div>

      <div className="daily-practice-layout">
        <div className="practice-batch-editor" ref={editorRef}>
          <div className="practice-card-title">
            <span className="practice-card-icon"><Guitar size={19} /></span>
            <div><h3>记录今日练习</h3><p>选歌、评分，一次保存。</p></div>
          </div>

          <div className="practice-date-row">
            <label>练习日期<input type="date" value={practiceDate} onChange={(event) => setPracticeDate(event.target.value)} /></label>
            <label>练习时间<input type="time" value={practiceTime} onChange={(event) => setPracticeTime(event.target.value)} /></label>
          </div>

          <label className="practice-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌曲或歌手" />
          </label>

          <div className="practice-song-picker">
            {visibleSongs.map((song) => {
              const selected = selectedIds.has(song.id);
              return (
                <button type="button" className={selected ? 'selected' : ''} key={song.id} onClick={() => toggleSong(song)}>
                  <span><strong>{song.title}</strong><small>{song.artist}</small></span>
                  {selected ? <Check size={15} /> : <Plus size={15} />}
                </button>
              );
            })}
          </div>

          <details className="manual-song-entry">
            <summary><Plus size={15} />手动添加曲库外歌曲</summary>
            <div>
              <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="歌曲名" />
              <input value={manualArtist} onChange={(event) => setManualArtist(event.target.value)} placeholder="歌手（可选）" />
              <button type="button" onClick={addManualSong}>加入清单</button>
            </div>
          </details>

          <div className="practice-draft-list">
            {drafts.map((draft) => {
              const quality = qualityOf(Number(draft.score || 70));
              return (
                <article className="practice-draft" key={draft.key}>
                  <div className="practice-draft-main">
                    <span><strong>{draft.song.title}</strong><small>{draft.song.artist}</small></span>
                    <label>匹配度
                      <input
                        inputMode="numeric"
                        value={draft.score}
                        onChange={(event) => updateDraft(draft.key, { score: parseMatchScoreInput(event.target.value) })}
                        onBlur={() => {
                          if (draft.score === '') updateDraft(draft.key, { score: 70 });
                        }}
                      />
                    </label>
                    <span className={quality.className}>{quality.label}</span>
                    <button type="button" aria-label="移除歌曲" onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}><Trash2 size={15} /></button>
                  </div>
                  <details>
                    <summary>补充文字（可选）<ChevronDown size={14} /></summary>
                    <textarea value={draft.feelings} onChange={(event) => updateDraft(draft.key, { feelings: event.target.value })} placeholder="练习感受" />
                    <textarea value={draft.reflection} onChange={(event) => updateDraft(draft.key, { reflection: event.target.value })} placeholder="弹唱感想：问题、原因和下次调整" />
                  </details>
                </article>
              );
            })}
          </div>

          <div className="practice-save-row">
            <span>{drafts.length ? `已选 ${drafts.length} 首` : '尚未选歌'}</span>
            <button type="button" disabled={busy} onClick={saveBatch}><Save size={16} />{busy ? '保存中' : '批量保存'}</button>
          </div>
          {message && <p className="practice-message">{message}</p>}
        </div>

        <aside className="practice-history">
          <div className="practice-card-title">
            <span className="practice-card-icon"><Cloud size={18} /></span>
            <div><h3>练习日历</h3><p>按月、周、日折叠。</p></div>
          </div>
          {!groupedRecords.length && <div className="practice-empty">保存第一批练习后，历史会出现在这里。</div>}
          {groupedRecords.map((month) => {
            const monthRecords = month.weeks.flatMap((week) => week.days.flatMap((day) => day.records));
            return (
              <details className="practice-month" key={month.key} open={month.key === today.slice(0, 7)}>
                <summary><span>{monthLabel(month.key)}</span><small>{month.weeks.flatMap((week) => week.days).length} 天 · {monthRecords.length} 首</small><ChevronDown size={15} /></summary>
                <div {...scrollRegionProps(
                  'practice-month-content',
                  monthRecords.length,
                  `${monthLabel(month.key)}练习记录`,
                )}>
                  {month.weeks.map((week) => {
                    const weekDays = week.days;
                    const weekRecords = weekDays.flatMap((day) => day.records);
                    const containsToday = weekDays.some((day) => day.key === today);
                    const visibleWeekRange = `${weekDays.at(-1)?.key.slice(5).replace('-', '/')}–${weekDays[0]?.key.slice(5).replace('-', '/')}`;
                    const visibleWeekLabel = containsToday ? '本周' : visibleWeekRange;
                    return (
                      <details className="practice-week" key={week.key} open={containsToday}>
                        <summary><span>{visibleWeekLabel}</span><small>{weekRecords.length} 首</small><ChevronDown size={14} /></summary>
                        <div {...scrollRegionProps(
                          'practice-week-content',
                          weekRecords.length,
                          `${visibleWeekLabel}练习记录`,
                        )}>
                          {weekDays.map((day) => (
                            <details className="practice-day" key={day.key} open={day.key === today}>
                              <summary>
                                <span>{dayLabel(day.key)}</span>
                                <small>{day.count} 首{day.averageScore === null ? '' : ` · 均分 ${day.averageScore}`}</small>
                                <ChevronDown size={14} />
                              </summary>
                              <div {...scrollRegionProps(
                                'practice-day-records',
                                day.records.length,
                                `${dayLabel(day.key)}练习记录`,
                              )}>
                                {day.records.map((record) => {
                                  const quality = qualityOf(record.matchScore);
                                  return (
                                    <button type="button" key={record.id} onDoubleClick={() => editRecord(record)} onClick={() => editRecord(record)}>
                                      <span><strong>{record.songTitle}</strong><small>{record.songArtist}</small></span>
                                      <b>{record.matchScore}</b>
                                      <em className={quality.className}>{quality.label}</em>
                                      <Edit3 size={14} />
                                    </button>
                                  );
                                })}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </aside>
      </div>
    </section>
  );
}
