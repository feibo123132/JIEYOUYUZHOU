import { useEffect, useState } from 'react';
import { ChevronDown, Tag } from 'lucide-react';
import { SONGS, type Song } from './songCatalog';
import { pullTagDirectory, type TagDirectoryEntry, type Credentials } from './songRequestCloud';
import ArtistTagsDialog from './ArtistTagsDialog';

export default function TagDirectory({ songs, session }: { songs: Song[]; session: Credentials | null }) {
  const [selectedEntry, setSelectedEntry] = useState<TagDirectoryEntry | null>(null);
  const [entries, setEntries] = useState<TagDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    pullTagDirectory().then((value) => { if (active) setEntries(value); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const catalog = new Map([...SONGS, ...songs].map((song) => [song.id, song]));
  const name = (entry: TagDirectoryEntry) => entry.kind === 'artist' ? entry.id : catalog.get(entry.id)?.title ?? entry.title ?? entry.id;
  return <section className="mx-auto max-w-4xl pb-12">
    <header className="mb-8 pt-4 sm:pt-8">
      <Tag className="mb-4 h-6 w-6 text-orange-200/70" />
      <h1 className="font-serif text-4xl font-black sm:text-5xl">标签</h1>
      <p className="mt-3 text-sm text-white/40">关于歌手，关于歌曲。展开名字，看看留下的标签。</p>
    </header>
    {loading ? <p role="status" className="py-10 text-white/45">正在读取标签…</p> : error ? <div role="alert" className="py-10 text-white/60">标签读取失败。<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 text-orange-200 underline">重试</button></div> :
      <div className="grid items-start gap-8 sm:grid-cols-2">
        {(['artist', 'song'] as const).map((kind) => {
          const group = entries.filter((entry) => entry.kind === kind && entry.tags.length).sort((a, b) => name(a).localeCompare(name(b), 'zh-CN'));
          return <section key={kind} aria-label={kind === 'artist' ? '歌手标签' : '歌曲标签'}>
            <h2 className="mb-4 flex items-center gap-3 text-lg font-bold">{kind === 'artist' ? '歌手' : '歌曲'}<span className="text-xs font-normal text-white/35">{group.length}</span></h2>
            <div className="space-y-3">{group.map((entry) => <details key={entry.id} className="group rounded-2xl border border-white/10 bg-black/25 open:border-orange-200/20">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 break-words font-semibold">{name(entry)}{kind === 'song' && catalog.get(entry.id)?.artist && <small className="ml-2 font-normal text-white/35">{catalog.get(entry.id)?.artist}</small>}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-white/40 transition group-open:rotate-180" />
              </summary>
              <div className="flex flex-wrap gap-2 border-t border-white/5 px-5 py-4">{entry.tags.map((tag) => <button type="button" key={tag} aria-label={`管理${name(entry)}的标签：${tag}`} onClick={() => setSelectedEntry(entry)} className="max-w-full break-all rounded-2xl border border-orange-200/15 bg-orange-300/10 px-3 py-2 text-left text-sm text-orange-100/85 transition hover:border-orange-200/40 hover:bg-orange-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-200">{tag}</button>)}</div>
            </details>)}</div>
            {!group.length && <p className="rounded-2xl border border-dashed border-white/10 px-5 py-7 text-sm text-white/35">暂无有标签的{kind === 'artist' ? '歌手' : '歌曲'}</p>}
          </section>;
        })}
      </div>}
    {selectedEntry && <ArtistTagsDialog
      key={`${selectedEntry.kind}:${selectedEntry.id}`}
      artist={name(selectedEntry)}
      songId={selectedEntry.kind === 'song' ? selectedEntry.id : undefined}
      session={session}
      onClose={() => setSelectedEntry(null)}
      onSaved={(tags) => setEntries((current) => current.map((entry) => entry.kind === selectedEntry.kind && entry.id === selectedEntry.id ? { ...entry, tags } : entry))}
    />}
  </section>;
}
