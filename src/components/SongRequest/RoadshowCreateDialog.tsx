import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { deduplicateRoadshowSongs, getLatestRoadshow, groupRoadshowRecognitionSongs, inheritRecognitionSongs, ROADSHOW_LOCATIONS, type RoadshowRecord } from './roadshow';
import { QUIZ_LEVELS, type QuizAssignments } from './songQuizLibrary';

interface Props {
  draft: RoadshowRecord;
  records: RoadshowRecord[];
  assignments: QuizAssignments;
  onCancel: () => void;
  onCreate: (record: RoadshowRecord) => void;
}

export default function RoadshowCreateDialog({ draft, records, assignments, onCancel, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(draft);
  const [inherit, setInherit] = useState(true);
  // 补录旧路演时不从未来场次继承，日期变化会同步更新可见来源。
  const source = getLatestRoadshow(records.filter((record) => record.date <= form.date));
  const songs = deduplicateRoadshowSongs(source?.recognitionSongs ?? []);
  const groups = groupRoadshowRecognitionSongs(songs, assignments);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const inputClass = 'mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none focus:border-orange-300/60';

  return (
    <dialog ref={dialog} onCancel={onCancel} aria-labelledby="roadshow-create-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[2rem] border border-orange-200/20 bg-[#120b08] p-6 text-white shadow-2xl backdrop:bg-black/70 sm:p-8">
      <form onSubmit={(event) => { event.preventDefault(); if (form.title.trim() && form.date) onCreate(inheritRecognitionSongs(form, source, inherit)); }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="roadshow-create-title" className="font-serif text-2xl font-black">创建路演</h2>
          <button type="button" onClick={onCancel} aria-label="关闭创建路演" className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"><X size={20} /></button>
        </div>
        <label className="block text-sm text-white/60">路演名称<input autoFocus required maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} /></label>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm text-white/60">日期<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={`${inputClass} [color-scheme:dark]`} /></label>
          <label className="text-sm text-white/60">地点<select value={form.location ?? ''} onChange={(event) => setForm({ ...form, location: event.target.value })} className={inputClass}><option value="">选择地点（可稍后填写）</option>{ROADSHOW_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
        </div>
        <section className="mt-6 rounded-2xl border border-orange-200/15 bg-orange-300/[.05] p-4">
          <h3 className="mb-3 text-xs font-bold tracking-widest text-orange-200/70">听歌识曲 · 歌单传承</h3>
          <label className="flex cursor-pointer items-start gap-3 text-sm font-bold"><input type="checkbox" checked={inherit} onChange={(event) => setInherit(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-orange-300" />继承上一场路演的全部歌曲</label>
          <div aria-live="polite" className="mt-3 space-y-2 text-xs leading-6 text-white/50">
            {source && <p>来自：{source.title} · {source.date.replace(/-/g, '/')}</p>}
            {!inherit ? <p>本场从空歌单开始，之后可自行添加歌曲。</p> : songs.length ? <>
              <p>共 {songs.length} 首：{QUIZ_LEVELS.map((level) => `${level.label} ${groups[level.id].length}`).join(' · ')}{songs.some(song => song.fixedBonus) && ` · 固定送分 ${songs.filter(song => song.fixedBonus).length}`}</p>
              <p>已经玩过的歌曲也会保留，本场答题记录从零开始。</p>
            </> : <p>{source ? '上一场暂无歌曲可继承，本场从空歌单开始。' : '暂无可继承的路演，本场从空歌单开始。'}</p>}
          </div>
        </section>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/60">取消</button>
          <button type="submit" disabled={!form.title.trim() || !form.date} className="rounded-full bg-orange-300 px-6 py-3 text-sm font-black text-black transition hover:bg-orange-200 disabled:opacity-40">创建路演</button>
        </div>
      </form>
    </dialog>
  );
}
