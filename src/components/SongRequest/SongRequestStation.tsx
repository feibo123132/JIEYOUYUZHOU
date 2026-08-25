import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarDays, Check, ChevronRight, Flame, Guitar,
  Library, Mic2, Plus, Search, Trash2, Trophy,
} from 'lucide-react';
import useAppStore from '../../store/appStore';
import { SONGS, type Song } from './songCatalog';
import {
  addCatalogArtist, addCatalogSong, createEditableCatalog, filterSongs, getFeaturedSongs,
  getSongSubtitle, incrementSongVote, loadEditableCatalog, loadVoteCounts, rankSongsByVotes,
  removeCatalogArtist, removeCatalogSong, saveEditableCatalog, saveVoteCounts,
  type EditableCatalog, type VoteCounts,
} from './songRequest';
import { groupSongsByArtist } from './roadshow';
import { incrementCloudVote, pullCloudVotes } from './songRequestCloud';
import RoadshowPanel from './RoadshowPanel';

interface SongRequestStationProps { onBack: () => void; }
type SectionId = 'ranking' | 'artists' | 'roadshows' | 'playlists';

const HUB_DIRECTIONS = [
  { id: 'ranking', label: '点歌榜', eyebrow: 'REQUESTS', description: '看看大家累计点过哪些歌', icon: Trophy, tone: 'from-amber-400/20 to-orange-600/5' },
  { id: 'artists', label: '歌手', eyebrow: 'ARTISTS', description: '按歌手找到我会唱的歌', icon: Mic2, tone: 'from-rose-400/20 to-pink-700/5' },
  { id: 'roadshows', label: '路演', eyebrow: 'ROADSHOWS', description: '私密管理每次路演与游戏曲目', icon: CalendarDays, tone: 'from-cyan-400/20 to-blue-700/5' },
  { id: 'playlists', label: '歌单', eyebrow: 'SONGBOOK', description: '浏览热门歌曲与完整曲库', icon: Library, tone: 'from-violet-400/20 to-purple-700/5' },
] as const;

const SongRequestStation = ({ onBack }: SongRequestStationProps) => {
  const nickname = useAppStore((state) => state.user?.nickname || '');
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [catalog, setCatalog] = useState<EditableCatalog>(() => (
    typeof window === 'undefined' ? createEditableCatalog(SONGS) : loadEditableCatalog(window.localStorage, SONGS)
  ));
  const [votes, setVotes] = useState<VoteCounts>(() => (
    typeof window === 'undefined' ? {} : loadVoteCounts(window.localStorage, catalog.songs.map((song) => song.id))
  ));
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    let active = true;
    pullCloudVotes().then((counts) => {
      if (!active) return;
      setVotes(counts);
      try { saveVoteCounts(window.localStorage, counts); } catch {}
    }).catch(() => { if (active) setSyncMessage('云端暂时未连接，本次点歌稍后再试'); });
    return () => { active = false; };
  }, []);

  const catalogSongs = catalog.songs;
  const songCategories = useMemo(() => ['全部', ...new Set(catalogSongs.map((song) => song.category))], [catalogSongs]);
  const featuredSongs = useMemo(() => getFeaturedSongs(catalogSongs), [catalogSongs]);
  const visibleSongs = useMemo(() => filterSongs(catalogSongs, query, category), [catalogSongs, category, query]);
  const ranking = useMemo(() => rankSongsByVotes(catalogSongs, votes), [catalogSongs, votes]);
  const artistGroups = useMemo(() => {
    const grouped = new Map(groupSongsByArtist(catalogSongs).map((group) => [group.artist, group.songs]));
    const needle = query.trim().toLowerCase();
    return catalog.artists.map((artist) => ({ artist, songs: grouped.get(artist) ?? [] })).filter(({ artist, songs }) => (
      !needle || artist.toLowerCase().includes(needle)
        || songs.some((song) => song.title.toLowerCase().includes(needle))
    ));
  }, [catalog.artists, catalogSongs, query]);

  const commitCatalog = (next: EditableCatalog) => {
    setCatalog(next);
    try { saveEditableCatalog(window.localStorage, next); } catch {}
  };

  const handleAddArtist = () => {
    const artist = window.prompt('请输入新歌手名：')?.trim();
    if (!artist) return;
    if (catalog.artists.includes(artist)) return window.alert('该歌手已存在。');
    commitCatalog(addCatalogArtist(catalog, artist));
  };

  const handleRemoveArtist = () => {
    const artist = window.prompt('请输入要删除的歌手名：')?.trim();
    if (!artist) return;
    if (!catalog.artists.includes(artist)) return window.alert('没有找到该歌手。');
    if (!window.confirm(`确定删除“${artist}”及其全部歌曲吗？`)) return;
    commitCatalog(removeCatalogArtist(catalog, artist));
    if (selectedArtist === artist) setSelectedArtist(null);
  };

  const handleAddSong = () => {
    if (!selectedArtist) return;
    const title = window.prompt(`请输入要添加给“${selectedArtist}”的歌名：`)?.trim();
    if (!title) return;
    if (catalogSongs.some((song) => song.artist === selectedArtist && song.title === title)) return window.alert('该歌曲已存在。');
    const hotComment = window.prompt('请输入歌曲热评（可留空）：')?.trim();
    const artistCategory = catalogSongs.find((song) => song.artist === selectedArtist)?.category ?? '华语流行';
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    commitCatalog(addCatalogSong(catalog, {
      id, title, artist: selectedArtist, category: artistCategory, featured: false,
      ...(hotComment ? { hotComment } : {}),
    }));
  };

  const handleRemoveSong = () => {
    if (!selectedArtist) return;
    const title = window.prompt(`请输入要从“${selectedArtist}”删除的歌名：`)?.trim();
    if (!title) return;
    const song = catalogSongs.find((item) => item.artist === selectedArtist && item.title === title);
    if (!song) return window.alert('没有找到该歌曲。');
    if (!window.confirm(`确定删除“${title}”吗？`)) return;
    commitCatalog(removeCatalogSong(catalog, song.id));
  };

  const goBack = () => {
    if (activeSection === null) return onBack();
    if (selectedArtist) return setSelectedArtist(null);
    setActiveSection(null);
    setQuery('');
    setCategory('全部');
  };

  const requestSong = async (song: Song) => {
    const optimistic = incrementSongVote(votes, song.id);
    setVotes(optimistic);
    setRequestedId(song.id);
    setSyncMessage('');
    try {
      const count = await incrementCloudVote(song.id);
      const synced = { ...optimistic, [song.id]: count };
      setVotes(synced);
      saveVoteCounts(window.localStorage, synced);
    } catch {
      setVotes(votes);
      setSyncMessage('点歌未提交，请检查网络后重试');
    }
    window.setTimeout(() => setRequestedId((current) => current === song.id ? null : current), 1000);
  };

  const RequestButton = ({ song }: { song: Song }) => {
    const done = requestedId === song.id;
    return (
      <button type="button" onClick={() => requestSong(song)} disabled={done}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition active:scale-95 ${done ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-100' : 'border-orange-200/25 bg-orange-400/15 text-orange-100 hover:bg-orange-400/25'}`}>
        {done ? <><Check className="h-4 w-4" />已点</> : '点歌'}
      </button>
    );
  };

  const SongRows = ({ songs }: { songs: Song[] }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {songs.map((song) => (
        <article key={song.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="min-w-0"><h3 className="truncate font-bold">{song.title}</h3><p title={song.hotComment} className="mt-1 truncate text-xs text-white/40">{getSongSubtitle(song)}</p></div>
          <RequestButton song={song} />
        </article>
      ))}
    </div>
  );

  const sectionTitle = HUB_DIRECTIONS.find((item) => item.id === activeSection)?.label;

  return (
    <main className="relative z-20 min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.14),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(124,58,237,.12),transparent_28%)] px-4 py-5 text-white sm:px-7 lg:px-10 lg:py-8">
      <div className="pointer-events-none fixed inset-0 opacity-[.16] [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <button type="button" onClick={goBack} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-4 text-sm font-semibold text-white/70 backdrop-blur-xl transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {activeSection === null ? '返回宇宙' : selectedArtist ? `返回${sectionTitle}` : '返回点歌台'}
          </button>
          <span className="text-[10px] font-bold tracking-[0.28em] text-orange-200/55">JIEYOU · SONG REQUEST</span>
        </header>

        {activeSection === null ? (
          <>
            <section className="mx-auto max-w-3xl py-5 text-center sm:py-10">
              <span className="inline-flex items-center gap-2 text-xs font-black tracking-[0.25em] text-orange-300"><Guitar className="h-4 w-4" /> LIVE SONGBOOK</span>
              <h1 className="mt-4 font-serif text-5xl font-black tracking-[-0.05em] sm:text-7xl">点歌台</h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/45">选一个方向，再慢慢找你想听的歌。</p>
            </section>
            <nav className="mx-auto mt-5 grid max-w-4xl gap-4 sm:grid-cols-2" aria-label="点歌台功能">
              {HUB_DIRECTIONS.map(({ id, label, eyebrow, description, icon: Icon, tone }) => (
                <button key={id} type="button" onClick={() => setActiveSection(id)}
                  className={`group min-h-48 rounded-[2rem] border border-white/10 bg-gradient-to-br ${tone} p-7 text-left backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/25 sm:min-h-56 sm:p-9`}>
                  <div className="flex items-start justify-between"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-black/20"><Icon className="h-7 w-7" /></span><ChevronRight className="h-5 w-5 text-white/25 transition group-hover:translate-x-1 group-hover:text-white/70" /></div>
                  <p className="mt-8 text-[10px] font-black tracking-[0.28em] text-white/35">{eyebrow}</p>
                  <h2 className="mt-1 font-serif text-3xl font-black">{label}</h2>
                  <p className="mt-2 text-sm text-white/45">{description}</p>
                </button>
              ))}
            </nav>
          </>
        ) : (
          <section>
            <div className="mb-7 flex items-end justify-between gap-4">
              <div><p className="text-[10px] font-black tracking-[0.28em] text-orange-300/65">SONG REQUEST</p>
                <h1 className="mt-1 font-serif text-4xl font-black sm:text-5xl">{selectedArtist || sectionTitle}</h1>
              </div>
              {activeSection === 'artists' && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={selectedArtist ? handleAddSong : handleAddArtist} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/25 bg-rose-300/10 px-3.5 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-300/20">
                    <Plus className="h-4 w-4" />{selectedArtist ? '新增歌曲' : '新增歌手'}
                  </button>
                  <button type="button" onClick={selectedArtist ? handleRemoveSong : handleRemoveArtist} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3.5 py-2 text-xs font-bold text-white/55 transition hover:border-red-300/30 hover:text-red-200">
                    <Trash2 className="h-4 w-4" />{selectedArtist ? '删除歌曲' : '删除歌手'}
                  </button>
                </div>
              )}
            </div>

            {activeSection === 'ranking' && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="rounded-[1.75rem] border border-white/10 bg-black/35 p-5 sm:p-7">
                  {ranking.length ? <ol className="space-y-3">{ranking.map(({ song, count }, index) => (
                    <li key={song.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.035] p-4">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-serif font-black ${index === 0 ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/55'}`}>{index + 1}</span>
                      <div className="min-w-0 flex-1"><p className="truncate font-bold">{song.title}</p><p className="truncate text-xs text-white/40">{song.artist}</p></div>
                      <strong className="font-serif text-xl text-orange-200">{count}<small className="ml-1 font-sans text-[10px] font-normal text-white/30">次</small></strong>
                    </li>
                  ))}</ol> : <div className="grid min-h-64 place-items-center text-center text-white/40"><div><Trophy className="mx-auto h-9 w-9 opacity-40" /><p className="mt-3">还没有人点歌</p></div></div>}
                </div>
                <aside className="h-fit rounded-[1.75rem] border border-orange-200/15 bg-orange-950/20 p-6 text-sm leading-7 text-white/45">点歌榜会汇总所有设备上的累计点歌次数。</aside>
              </div>
            )}

            {activeSection === 'artists' && (
              <div className="space-y-5">
                <SearchBox query={query} setQuery={setQuery} />
                {selectedArtist ? <SongRows songs={catalogSongs.filter((song) => song.artist === selectedArtist)} /> : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{artistGroups.map(({ artist, songs }) => (
                    <button key={artist} type="button" onClick={() => setSelectedArtist(artist)} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-left transition hover:border-rose-300/35">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-rose-300/10"><Mic2 className="h-5 w-5 text-rose-200" /></span>
                      <span className="min-w-0 flex-1"><strong className="block truncate">{artist}</strong><small className="text-white/35">{songs.length} 首</small></span><ChevronRight className="h-4 w-4 text-white/25" />
                    </button>
                  ))}</div>
                )}
              </div>
            )}

            {activeSection === 'playlists' && (
              <div className="space-y-6">
                <SearchBox query={query} setQuery={setQuery} />
                {!query && category === '全部' && <SongSection title="热门歌曲" icon={<Flame className="h-5 w-5 text-orange-400" />}><SongRows songs={featuredSongs} /></SongSection>}
                <section className="rounded-[1.75rem] border border-white/10 bg-black/35 p-5 sm:p-7">
                  <div className="mb-5 flex items-center justify-between"><h2 className="font-serif text-2xl font-black">完整曲库</h2><span className="text-xs text-white/35">{visibleSongs.length} 首</span></div>
                  <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{songCategories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold ${category === item ? 'border-orange-300/40 bg-orange-400/20 text-orange-100' : 'border-white/10 text-white/45'}`}>{item}</button>)}</div>
                  {visibleSongs.length ? <SongRows songs={visibleSongs} /> : <p className="py-16 text-center text-sm text-white/35">没有找到这首歌</p>}
                </section>
              </div>
            )}

            {activeSection === 'roadshows' && <RoadshowPanel defaultAlias={nickname} />}
          </section>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{requestedId ? `已点歌曲 ${catalogSongs.find((song) => song.id === requestedId)?.title ?? ''}` : syncMessage}</p>
      {syncMessage && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-red-200/15 bg-black/85 px-4 py-2 text-xs text-red-100 shadow-xl">{syncMessage}</div>}
    </main>
  );
};

const SearchBox = ({ query, setQuery }: { query: string; setQuery: (value: string) => void }) => (
  <label className="flex h-13 items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 focus-within:border-orange-300/45">
    <Search className="h-5 w-5 text-orange-200/55" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌名或歌手" className="h-13 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/30" />
  </label>
);

const SongSection = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-[1.75rem] border border-orange-200/15 bg-orange-950/20 p-5 sm:p-7"><h2 className="mb-5 flex items-center gap-2 font-serif text-2xl font-black">{icon}{title}</h2>{children}</section>
);

export default SongRequestStation;
