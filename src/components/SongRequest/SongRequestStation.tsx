import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Disc3, Guitar,
  GripVertical, Library, ListOrdered, Mic2, Plus, RotateCcw, Search, SlidersHorizontal, Target, Trash2, Trophy, Upload, X,
} from 'lucide-react';
import useAppStore from '../../store/appStore';
import { SONGS, type Song } from './songCatalog';
import {
  addCatalogArtist, addCatalogSong, createEditableCatalog, getFeaturedSongs,
  getPersonalRankingPodiumSize, getRankingMedalTone, getSongSubtitle, incrementSongVote, isFeaturedSongManager,
  insertCatalogArtist, insertCatalogSong, loadEditableCatalog, loadVoteCounts, rankSongsByVotes,
  moveCatalogArtist, moveCatalogSong, removeCatalogArtist, removeCatalogSong, saveEditableCatalog, saveVoteCounts,
  type EditableCatalog, type VoteCounts,
} from './songRequest';
import {
  getLatestRoadshow, groupSongsByArtist, parseRoadshowCache,
  prepareLatestRoadshowPerformanceSong, prepareLatestRoadshowRecognitionSong, ROADSHOW_CACHE_KEY,
  type RoadshowRecord,
} from './roadshow';
import {
  incrementCloudVote, mapArtistSettingsSyncError, pullArtistSettings, pullCloudFeaturedSongIds, pullCloudVotes,
  pullCloudQuizAssignments, pullPublicPracticeRanking, pullRoadshows, pullSongRecords, pushArtistSettings,
  saveCloudFeaturedSongIds, saveCloudQuizAssignments, saveRoadshow,
} from './songRequestCloud';
import RoadshowPanel from './RoadshowPanel';
import SongDetailPanel from './SongDetailPanel';
import PopularSongBarrage from './PopularSongBarrage';
import { createInitialBarragePreferences, setBarragePreference } from '../StarrySky/barragePreferences';
import {
  getMatchQuality, loadSongRecordCache, parsePublicPracticeRanking, parseSongRecords, rankSongsByPracticeMatch, readSongRecordSession, recoverSongsFromRecords,
  saveSongRecordCache, SONG_REQUEST_SESSION_EVENT,
  type PublicPracticeRankingItem, type SongRecord, type SongRecordSession,
} from './songRecords';
import {
  clearArtistSettingsDraft, createArtistSettingsDraft, createArtistSettingsPayload,
  ensureArtistSettingsRetryDraft, hasCustomArtistSettings, loadArtistSettingsCache, loadArtistSettingsDraft, mergeArtistOrder, mergeSongOrder,
  parseArtistSettingsSnapshot, resolveArtistSettingsPull, resolveSuccessfulArtistSettingsPush,
  saveArtistSettingsCache, saveArtistSettingsDraft,
  type ArtistSettingsPayload,
} from './artistSettings';
import {
  countQuizSongs, groupQuizSongs, parseQuizAssignments, QUIZ_LEVELS, setQuizLevel,
  type QuizAssignments, type QuizLevel,
} from './songQuizLibrary';

interface SongRequestStationProps { onBack: () => void; }
type SectionId = 'ranking' | 'artists' | 'roadshows' | 'playlists' | 'quiz';
type RankingView = 'requests' | 'personal';
type ArtistLanguageFilter = 'chinese' | 'foreign' | 'single';
type SongDisplayMode = 'random' | 'full';
type ArtistDropPlacement = 'before' | 'after';

const createInitialSongBarragePreferences = () => ({
  ...createInitialBarragePreferences(),
  fill: true,
});

const ARTIST_LANGUAGE_FILTERS: { value: ArtistLanguageFilter; label: string }[] = [
  { value: 'chinese', label: '华语歌手' },
  { value: 'foreign', label: '外语歌手' },
  { value: 'single', label: '一人一曲' },
];

const PERSONAL_RANKING_SCROLL_THRESHOLD = 8;
const RANKING_MEDAL_CLASSES = {
  gold: 'bg-amber-300 text-black ring-1 ring-amber-100/70 shadow-[0_0_16px_rgba(252,211,77,0.2)]',
  silver: 'bg-slate-200 text-slate-950 ring-1 ring-white/65 shadow-[0_0_14px_rgba(226,232,240,0.16)]',
  bronze: 'bg-orange-700 text-orange-50 ring-1 ring-orange-300/55 shadow-[0_0_14px_rgba(194,65,12,0.18)]',
  neutral: 'bg-white/10 text-white/55',
} as const;

const QUIZ_LEVEL_STYLES: Record<QuizLevel, { accent: string; panel: string; badge: string }> = {
  warmup: { accent: 'text-emerald-200', panel: 'border-emerald-300/20 bg-emerald-400/[.055]', badge: 'border-emerald-300/35 bg-emerald-300/15 text-emerald-100' },
  standard: { accent: 'text-sky-200', panel: 'border-sky-300/20 bg-sky-400/[.055]', badge: 'border-sky-300/35 bg-sky-300/15 text-sky-100' },
  hard: { accent: 'text-violet-200', panel: 'border-violet-300/20 bg-violet-400/[.055]', badge: 'border-violet-300/35 bg-violet-300/15 text-violet-100' },
  hell: { accent: 'text-rose-200', panel: 'border-rose-300/20 bg-rose-400/[.055]', badge: 'border-rose-300/35 bg-rose-300/15 text-rose-100' },
};

const HUB_DIRECTIONS = [
  { id: 'ranking', label: '排行榜', eyebrow: 'RANKINGS', description: '切换查看点歌榜和吉他练习榜', icon: Trophy, tone: 'from-amber-400/20 to-orange-600/5' },
  { id: 'artists', label: '歌手', eyebrow: 'ARTISTS', description: '按歌手找到我会唱的歌', icon: Mic2, tone: 'from-rose-400/20 to-pink-700/5' },
  { id: 'roadshows', label: '私人记录', eyebrow: 'PRIVATE ARCHIVE', description: '日常练习与路演记录', icon: CalendarDays, tone: 'from-cyan-400/20 to-blue-700/5' },
  { id: 'playlists', label: '热门歌曲', eyebrow: 'HOT SONGS', description: '看歌名化作彩色弹幕穿过星空', icon: Library, tone: 'from-violet-400/20 to-purple-700/5' },
] as const;

const artistAvatarUrl = (fileName: string) => `${import.meta.env.BASE_URL}images/song-request/artists/${fileName}`;

const ARTIST_AVATARS: Record<string, { src: string; position: string; scale: number }> = {
  周杰伦: { src: artistAvatarUrl('jay-chou.png'), position: '50% 24%', scale: 1.35 },
  林俊杰: { src: artistAvatarUrl('jj-lin.png'), position: '50% 38%', scale: 1.35 },
  孙燕姿: { src: artistAvatarUrl('stefanie-sun.png'), position: '50% 24%', scale: 1.65 },
  邓紫棋: { src: artistAvatarUrl('gem.png'), position: '50% 34%', scale: 1.45 },
  薛之谦: { src: artistAvatarUrl('joker-xue.png'), position: '50% 29%', scale: 1.3 },
  汪苏泷: { src: artistAvatarUrl('silence-wang.png'), position: '50% 27%', scale: 1.35 },
  梁静茹: { src: artistAvatarUrl('fish-leong.png'), position: '50% 30%', scale: 1.4 },
  陶喆: { src: artistAvatarUrl('david-tao.png'), position: '67% 46%', scale: 2.7 },
  王力宏: { src: artistAvatarUrl('wang-leehom.png'), position: '50% 34%', scale: 1.35 },
  许嵩: { src: artistAvatarUrl('vae.png'), position: '63% 25%', scale: 1.55 },
  陈奕迅: { src: artistAvatarUrl('eason-chan.png'), position: '50% 43%', scale: 2.45 },
  郑润泽: { src: artistAvatarUrl('zheng-runze.png'), position: '50% 22%', scale: 1.35 },
};

interface ArtistAvatar { src: string; position: string; scale: number; }
interface AvatarAdjustment { x: number; y: number; scale: number; rotation: number; }
const ARTIST_AVATAR_ADJUSTMENTS_KEY = 'jieyou-artist-avatar-adjustments-v1';
const CUSTOM_ARTIST_AVATARS_KEY = 'jieyou-custom-artist-avatars-v1';

const getDefaultAvatarAdjustment = (avatar: { position: string; scale: number }): AvatarAdjustment => {
  const [x = 50, y = 50] = avatar.position.split(' ').map((value) => Number.parseFloat(value));
  return { x, y, scale: avatar.scale, rotation: 0 };
};

const loadAvatarAdjustments = (): Record<string, AvatarAdjustment> => {
  try { return JSON.parse(window.localStorage.getItem(ARTIST_AVATAR_ADJUSTMENTS_KEY) || '{}'); } catch { return {}; }
};

const loadCustomArtistAvatars = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_ARTIST_AVATARS_KEY) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string' && entry[1].startsWith('data:image/')
    )));
  } catch { return {}; }
};

const resizeArtistAvatar = (file: File): Promise<string> => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件。'));
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('图片读取失败。'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('无法识别这张图片。'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const maxSize = 512;
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context || !image.naturalWidth || !image.naturalHeight) return reject(new Error('图片处理失败。'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', 0.82));
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
});

const SongRequestStation = ({ onBack }: SongRequestStationProps) => {
  const nickname = useAppStore((state) => state.user?.nickname || '');
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [rankingView, setRankingView] = useState<RankingView>('requests');
  const [personalRankingArtist, setPersonalRankingArtist] = useState<string | null>(null);
  const [isPersonalRankingRandom, setIsPersonalRankingRandom] = useState(false);
  const [rankingArtistQuery, setRankingArtistQuery] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [query, setQuery] = useState('');
  const [artistLanguageFilter, setArtistLanguageFilter] = useState<ArtistLanguageFilter>('chinese');
  const [catalog, setCatalog] = useState<EditableCatalog>(() => (
    typeof window === 'undefined' ? createEditableCatalog(SONGS) : loadEditableCatalog(window.localStorage, SONGS)
  ));
  const [votes, setVotes] = useState<VoteCounts>(() => (
    typeof window === 'undefined' ? {} : loadVoteCounts(window.localStorage, catalog.songs.map((song) => song.id))
  ));
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [featuredSongIds, setFeaturedSongIds] = useState<string[]>(() => getFeaturedSongs(catalog.songs).map((song) => song.id));
  const [featuredBusyId, setFeaturedBusyId] = useState<string | null>(null);
  const [quizAssignments, setQuizAssignments] = useState<QuizAssignments>({});
  const [quizBusyId, setQuizBusyId] = useState<string | null>(null);
  const [roadshowBusyId, setRoadshowBusyId] = useState<string | null>(null);
  const [quizMenuSongId, setQuizMenuSongId] = useState<string | null>(null);
  const [roadshowArchives, setRoadshowArchives] = useState<RoadshowRecord[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return parseRoadshowCache(window.localStorage.getItem(ROADSHOW_CACHE_KEY)); } catch { return []; }
  });
  const latestRoadshow = useMemo(() => getLatestRoadshow(roadshowArchives) ?? null, [roadshowArchives]);
  const [syncMessage, setSyncMessage] = useState('');
  const [songRecordSession, setSongRecordSession] = useState<SongRecordSession | null>(() => (
    typeof window === 'undefined' ? null : readSongRecordSession(window.sessionStorage)
  ));
  const [songRecords, setSongRecords] = useState<SongRecord[]>(() => (
    typeof window === 'undefined' ? [] : loadSongRecordCache(window.localStorage, readSongRecordSession(window.sessionStorage))
  ));
  const [publicPracticeRanking, setPublicPracticeRanking] = useState<PublicPracticeRankingItem[]>([]);
  const [publicRankingStatus, setPublicRankingStatus] = useState('正在读取公开榜单');
  const [recoveredSongs, setRecoveredSongs] = useState<Song[]>([]);
  const [recordSyncStatus, setRecordSyncStatus] = useState('');
  const [avatarAdjustMode, setAvatarAdjustMode] = useState(false);
  const [artistOrderMode, setArtistOrderMode] = useState(false);
  const [draggedArtist, setDraggedArtist] = useState<string | null>(null);
  const [artistDropTarget, setArtistDropTarget] = useState<{ artist: string; placement: ArtistDropPlacement } | null>(null);
  const [songOrderMode, setSongOrderMode] = useState(false);
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [songDropTarget, setSongDropTarget] = useState<{ songId: string; placement: ArtistDropPlacement } | null>(null);
  const [adjustingArtist, setAdjustingArtist] = useState<string | null>(null);
  const [customArtistAvatars, setCustomArtistAvatars] = useState<Record<string, string>>(() => (
    typeof window === 'undefined' ? {} : loadCustomArtistAvatars()
  ));
  const [avatarAdjustments, setAvatarAdjustments] = useState<Record<string, AvatarAdjustment>>(() => (
    typeof window === 'undefined' ? {} : loadAvatarAdjustments()
  ));
  const [songAssistantOpen, setSongAssistantOpen] = useState(false);
  const [barragePreferences, setBarragePreferences] = useState(createInitialSongBarragePreferences);
  const barrageMode = barragePreferences.immersive;
  const intimateMode = barragePreferences.intimate;
  const fillMode = barragePreferences.fill;
  const [songDisplayMode, setSongDisplayMode] = useState<SongDisplayMode>('full');
  const artistSettingsInitializedRef = useRef(false);
  const artistSettingsRevisionRef = useRef<number | null>(
    typeof window === 'undefined' ? null : loadArtistSettingsCache(window.localStorage)?.revision ?? null,
  );
  const artistSettingsSessionRef = useRef<SongRecordSession | null>(songRecordSession);
  const artistSettingsPushRef = useRef<Promise<void> | null>(null);

  const applyCloudArtistSettings = (snapshot: ReturnType<typeof parseArtistSettingsSnapshot>) => {
    if (!snapshot) return;
    artistSettingsRevisionRef.current = snapshot.revision;
    setCatalog((current) => {
      const next = {
        ...current,
        artists: mergeArtistOrder(snapshot.artistOrder, current.artists),
        songs: mergeSongOrder(snapshot.songOrder, current.songs),
      };
      try { saveEditableCatalog(window.localStorage, next); } catch {}
      return next;
    });
    setCustomArtistAvatars(snapshot.customAvatars);
    setAvatarAdjustments(snapshot.avatarAdjustments);
    try {
      window.localStorage.setItem(CUSTOM_ARTIST_AVATARS_KEY, JSON.stringify(snapshot.customAvatars));
      window.localStorage.setItem(ARTIST_AVATAR_ADJUSTMENTS_KEY, JSON.stringify(snapshot.avatarAdjustments));
      saveArtistSettingsCache(window.localStorage, snapshot);
    } catch {}
  };

  const runArtistSettingsPush = () => {
    if (artistSettingsPushRef.current) return artistSettingsPushRef.current;
    const worker = (async () => {
      while (true) {
        const draft = loadArtistSettingsDraft(window.localStorage);
        const session = artistSettingsSessionRef.current;
        if (!draft || !session) {
          if (draft && !session) setSyncMessage('歌手设置已保存在本地，进入私有空间后将同步全站。');
          return;
        }
        try {
          const serverSnapshot = parseArtistSettingsSnapshot(await pushArtistSettings(session, draft.baseRevision, draft.snapshot));
          if (!serverSnapshot) throw new Error('INVALID_ARTIST_SETTINGS');
          artistSettingsRevisionRef.current = serverSnapshot.revision;
          saveArtistSettingsCache(window.localStorage, serverSnapshot);
          const latestDraft = loadArtistSettingsDraft(window.localStorage);
          const nextDraft = resolveSuccessfulArtistSettingsPush(latestDraft, draft.changeId, serverSnapshot);
          if (nextDraft) saveArtistSettingsDraft(window.localStorage, nextDraft);
          else clearArtistSettingsDraft(window.localStorage);
          setSyncMessage('');
          if (!nextDraft) return;
        } catch (error) {
          setSyncMessage(mapArtistSettingsSyncError(error));
          return;
        }
      }
    })().finally(() => { artistSettingsPushRef.current = null; });
    artistSettingsPushRef.current = worker;
    return worker;
  };

  const queueArtistSettings = (snapshot: ArtistSettingsPayload) => {
    const previous = loadArtistSettingsDraft(window.localStorage);
    const draft = createArtistSettingsDraft(previous, previous?.baseRevision ?? artistSettingsRevisionRef.current, snapshot);
    saveArtistSettingsDraft(window.localStorage, draft);
    void runArtistSettingsPush();
  };

  useEffect(() => {
    artistSettingsSessionRef.current = songRecordSession;
    if (songRecordSession && artistSettingsInitializedRef.current && loadArtistSettingsDraft(window.localStorage)) void runArtistSettingsPush();
  }, [songRecordSession]);

  useEffect(() => {
    const retryArtistSettingsPush = () => {
      if (!artistSettingsInitializedRef.current || !artistSettingsSessionRef.current
        || !loadArtistSettingsDraft(window.localStorage)) return;
      void runArtistSettingsPush();
    };
    window.addEventListener('online', retryArtistSettingsPush);
    window.addEventListener('focus', retryArtistSettingsPush);
    return () => {
      window.removeEventListener('online', retryArtistSettingsPush);
      window.removeEventListener('focus', retryArtistSettingsPush);
    };
  }, []);

  useEffect(() => {
    if (artistSettingsInitializedRef.current) return;
    artistSettingsInitializedRef.current = true;
    let active = true;
    const defaultCatalog = createEditableCatalog(SONGS);
    const local = createArtistSettingsPayload(
      catalog.artists,
      customArtistAvatars,
      avatarAdjustments,
      catalog.songs.map((song) => song.id),
    );
    pullArtistSettings().then((value) => {
      if (!active) return;
      const cloud = value === null ? null : parseArtistSettingsSnapshot(value);
      if (value !== null && !cloud) throw new Error('INVALID_ARTIST_SETTINGS');
      artistSettingsRevisionRef.current = cloud?.revision ?? null;
      const draft = loadArtistSettingsDraft(window.localStorage);
      const decision = resolveArtistSettingsPull({
        cloud, local, draft, hasSession: Boolean(artistSettingsSessionRef.current),
        defaultArtistOrder: defaultCatalog.artists,
        defaultSongOrder: defaultCatalog.songs.map((song) => song.id),
      });
      if (decision.kind === 'apply-cloud') {
        applyCloudArtistSettings(decision.snapshot);
        return;
      }
      if (decision.kind === 'conflict') {
        setSyncMessage('云端歌手设置已有更新，本地修改已保留。');
        return;
      }
      if (decision.kind === 'push-draft') {
        void runArtistSettingsPush();
        return;
      }
      if (decision.kind === 'seed-cloud') {
        saveArtistSettingsDraft(window.localStorage, createArtistSettingsDraft(null, null, decision.payload));
        void runArtistSettingsPush();
        return;
      }
      if (cloud === null && hasCustomArtistSettings(local, defaultCatalog.artists, defaultCatalog.songs.map((song) => song.id))) {
        saveArtistSettingsDraft(window.localStorage, createArtistSettingsDraft(null, null, local));
        if (artistSettingsSessionRef.current) void runArtistSettingsPush();
        else setSyncMessage('歌手设置已保存在本地，进入私有空间后将同步全站。');
      }
    }).catch(() => {
      if (!active) return;
      const retryDraft = ensureArtistSettingsRetryDraft(
        window.localStorage, local, defaultCatalog.artists, artistSettingsRevisionRef.current,
        defaultCatalog.songs.map((song) => song.id),
      );
      if (retryDraft && artistSettingsSessionRef.current) void runArtistSettingsPush();
      setSyncMessage(retryDraft
        ? '全站歌手设置暂时未连接，本地修改已排队并将在恢复后自动同步。'
        : '全站歌手设置暂时未连接，当前仍使用本地设置。');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    pullCloudVotes().then((counts) => {
      if (!active) return;
      setVotes(counts);
      try { saveVoteCounts(window.localStorage, counts); } catch {}
    }).catch(() => { if (active) setSyncMessage('云端暂时未连接，本次点歌稍后再试'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    pullCloudFeaturedSongIds().then((songIds) => {
      if (active && songIds) setFeaturedSongIds(songIds);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    pullCloudQuizAssignments().then((assignments) => {
      const parsed = parseQuizAssignments(assignments);
      if (active && parsed) setQuizAssignments(parsed);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    pullPublicPracticeRanking().then((ranking) => {
      if (!active) return;
      setPublicPracticeRanking(parsePublicPracticeRanking(ranking));
      setPublicRankingStatus('');
    }).catch(() => { if (active) setPublicRankingStatus('公开榜单暂时未连接'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refreshSession = () => {
      const next = readSongRecordSession(window.sessionStorage);
      setSongRecordSession(next);
      if (!next) {
        setSelectedSong(null);
        setSelectedArtist(null);
      }
    };
    window.addEventListener(SONG_REQUEST_SESSION_EVENT, refreshSession);
    return () => window.removeEventListener(SONG_REQUEST_SESSION_EVENT, refreshSession);
  }, []);

  useEffect(() => {
    if (!songRecordSession) {
      setRoadshowArchives([]);
      return;
    }
    let active = true;
    pullRoadshows(songRecordSession).then((records) => {
      if (!active) return;
      setRoadshowArchives(records);
      try { window.localStorage.setItem(ROADSHOW_CACHE_KEY, JSON.stringify({ version: 1, records })); } catch {}
    }).catch(() => undefined);
    return () => { active = false; };
  }, [songRecordSession]);

  useEffect(() => {
    if (!songRecordSession) {
      setSongRecords([]);
      setRecoveredSongs([]);
      setRecordSyncStatus('');
      return;
    }
    let active = true;
    const cached = loadSongRecordCache(window.localStorage, songRecordSession);
    setSongRecords(cached);
    setRecoveredSongs(recoverSongsFromRecords(cached, catalog.songs));
    setRecordSyncStatus(cached.length ? '正在同步，当前显示本地记录' : '正在从腾讯云同步');
    pullSongRecords(songRecordSession).then((cloudRecords) => {
      if (!active) return;
      const validRecords = parseSongRecords(cloudRecords);
      setSongRecords(validRecords);
      setRecoveredSongs(recoverSongsFromRecords(validRecords, catalog.songs));
      saveSongRecordCache(window.localStorage, songRecordSession.alias, validRecords);
      setRecordSyncStatus('已同步');
    }).catch(() => {
      if (active) setRecordSyncStatus(cached.length ? '云端暂时未连接，当前记录尚未同步' : '云端暂时未连接');
    });
    return () => { active = false; };
  }, [songRecordSession, catalog.songs]);

  const catalogSongs = useMemo(() => {
    const ids = new Set(catalog.songs.map((song) => song.id));
    return [...catalog.songs, ...recoveredSongs.filter((song) => !ids.has(song.id))];
  }, [catalog.songs, recoveredSongs]);
  const providedSongs = useMemo(() => {
    const featured = new Set(featuredSongIds);
    return catalogSongs.filter((song) => featured.has(song.id));
  }, [catalogSongs, featuredSongIds]);
  const quizGroups = useMemo(() => groupQuizSongs(catalogSongs, quizAssignments), [catalogSongs, quizAssignments]);
  const quizCounts = useMemo(() => countQuizSongs(quizAssignments), [quizAssignments]);
  const randomSongs = useMemo(() => {
    const shuffled = [...providedSongs];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled.slice(0, 60);
  }, [providedSongs]);
  const barrageSongs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle) {
      return providedSongs.filter((song) => song.title.toLowerCase().includes(needle)
        || song.artist.toLowerCase().includes(needle));
    }
    return songDisplayMode === 'full' ? providedSongs : randomSongs;
  }, [providedSongs, query, randomSongs, songDisplayMode]);
  const ranking = useMemo(() => rankSongsByVotes(catalogSongs, votes), [catalogSongs, votes]);
  const privatePersonalRanking = useMemo(() => rankSongsByPracticeMatch(catalogSongs, songRecords), [catalogSongs, songRecords]);
  const publicPersonalRanking = useMemo(() => publicPracticeRanking.map((entry) => ({
    song: catalogSongs.find((song) => song.id === entry.songId) ?? {
      id: entry.songId,
      title: entry.songTitle,
      artist: entry.songArtist,
      category: '公开练习榜',
      featured: false,
    },
    score: entry.score,
    practiceCount: 0,
  })), [catalogSongs, publicPracticeRanking]);
  const personalRanking = songRecordSession ? privatePersonalRanking : publicPersonalRanking;
  const visiblePersonalRanking = useMemo(() => {
    const base = personalRankingArtist
      ? personalRanking.filter(({ song }) => song.artist === personalRankingArtist)
      : personalRanking;
    const withRank = base.map((item, idx) => ({ ...item, originalRank: idx + 1 }));
    if (!isPersonalRankingRandom || withRank.length <= 3) return withRank;
    const top3 = withRank.slice(0, 3);
    const rest = withRank.slice(3);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [...top3, ...rest];
  }, [personalRanking, personalRankingArtist, isPersonalRankingRandom]);
  const artistSongCount = personalRankingArtist
    ? catalogSongs.filter((song) => song.artist === personalRankingArtist).length
    : 0;
  const personalRankingPodiumSize = getPersonalRankingPodiumSize(personalRankingArtist ? artistSongCount : null);
  const personalRankingArtists = useMemo(() => {
    const needle = rankingArtistQuery.trim().toLowerCase();
    return groupSongsByArtist(catalogSongs).filter(({ songs }) => songs.length >= 2).filter(({ artist, songs }) => (
      !needle || artist.toLowerCase().includes(needle)
        || songs.some((song) => song.title.toLowerCase().includes(needle))
    ));
  }, [catalogSongs, rankingArtistQuery]);
  const artistGroups = useMemo(() => {
    const grouped = new Map(groupSongsByArtist(catalogSongs).map((group) => [group.artist, group.songs]));
    const needle = query.trim().toLowerCase();
    const visibleArtists = [...new Set([...catalog.artists, ...recoveredSongs.map((song) => song.artist)])];
    return visibleArtists.map((artist) => ({ artist, songs: grouped.get(artist) ?? [] })).filter(({ artist, songs }) => {
      const singleSongArtist = songs.length === 1;
      const chineseArtist = !songs.some((song) => song.category === '欧美流行');
      const matchesCatalogGroup = artistLanguageFilter === 'single' ? singleSongArtist : songs.length >= 2;
      const matchesLanguage = artistLanguageFilter === 'single'
        || (artistLanguageFilter === 'chinese' ? chineseArtist : !chineseArtist);
      const matchesQuery = !needle || artist.toLowerCase().includes(needle)
        || songs.some((song) => song.title.toLowerCase().includes(needle));
      return matchesCatalogGroup && matchesLanguage && matchesQuery;
    });
  }, [artistLanguageFilter, catalog.artists, catalogSongs, query, recoveredSongs]);

  const commitCatalog = (next: EditableCatalog) => {
    setCatalog(next);
    try { saveEditableCatalog(window.localStorage, next); } catch {}
  };

  const syncCurrentArtistSettings = (
    artists = catalog.artists,
    avatars = customArtistAvatars,
    adjustments = avatarAdjustments,
    songOrder = catalog.songs.map((song) => song.id),
  ) => queueArtistSettings(createArtistSettingsPayload(artists, avatars, adjustments, songOrder));

  const commitSongOrder = (next: EditableCatalog) => {
    if (next === catalog) return;
    commitCatalog(next);
    syncCurrentArtistSettings(
      next.artists,
      customArtistAvatars,
      avatarAdjustments,
      next.songs.map((song) => song.id),
    );
  };

  const commitSongRecords = (next: SongRecord[]) => {
    setSongRecords(next);
    if (songRecordSession) {
      try { saveSongRecordCache(window.localStorage, songRecordSession.alias, next); } catch {}
      setRecoveredSongs(recoverSongsFromRecords(next, catalog.songs));
    }
  };

  const openSongDetail = (song: Song) => {
    try { setRoadshowArchives(parseRoadshowCache(window.localStorage.getItem(ROADSHOW_CACHE_KEY))); } catch {}
    setSelectedSong(song);
  };
  const canOpenPracticeDetails = Boolean(songRecordSession);
  const openPracticeSongDetail = (song: Song) => {
    if (canOpenPracticeDetails) openSongDetail(song);
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

  const moveVisibleArtist = (artist: string, direction: -1 | 1) => {
    const currentIndex = artistGroups.findIndex((group) => group.artist === artist);
    const targetArtist = artistGroups[currentIndex + direction]?.artist;
    if (!targetArtist) return;
    commitCatalog(moveCatalogArtist(catalog, artist, targetArtist));
  };

  const clearArtistDragState = () => {
    setDraggedArtist(null);
    setArtistDropTarget(null);
  };

  const getArtistDropPlacement = (event: DragEvent<HTMLElement>): ArtistDropPlacement => {
    const rect = event.currentTarget.getBoundingClientRect();
    const singleColumn = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
    return singleColumn
      ? (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      : (event.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
  };

  const handleArtistDragStart = (event: DragEvent<HTMLElement>, artist: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', artist);
    setDraggedArtist(artist);
    setArtistDropTarget(null);
  };

  const handleArtistDragOver = (event: DragEvent<HTMLElement>, targetArtist: string) => {
    const sourceArtist = draggedArtist || event.dataTransfer.getData('text/plain');
    if (!artistOrderMode || !sourceArtist || sourceArtist === targetArtist) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const placement = getArtistDropPlacement(event);
    setArtistDropTarget((current) => (
      current?.artist === targetArtist && current.placement === placement ? current : { artist: targetArtist, placement }
    ));
  };

  const handleArtistDrop = (event: DragEvent<HTMLElement>, targetArtist: string) => {
    event.preventDefault();
    const sourceArtist = draggedArtist || event.dataTransfer.getData('text/plain');
    const placement = artistDropTarget?.artist === targetArtist
      ? artistDropTarget.placement
      : getArtistDropPlacement(event);
    if (sourceArtist && sourceArtist !== targetArtist) {
      commitCatalog(insertCatalogArtist(catalog, sourceArtist, targetArtist, placement));
    }
    clearArtistDragState();
  };

  const clearSongDragState = () => {
    setDraggedSongId(null);
    setSongDropTarget(null);
  };

  const getSongDropPlacement = (event: DragEvent<HTMLElement>): ArtistDropPlacement => {
    const rect = event.currentTarget.getBoundingClientRect();
    const singleColumn = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
    return singleColumn
      ? (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      : (event.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
  };

  const moveVisibleSong = (songId: string, direction: -1 | 1) => {
    if (!selectedArtist) return;
    const songs = catalog.songs.filter((song) => song.artist === selectedArtist);
    const currentIndex = songs.findIndex((song) => song.id === songId);
    const targetSong = songs[currentIndex + direction];
    if (!targetSong) return;
    commitSongOrder(moveCatalogSong(catalog, songId, targetSong.id));
  };

  const handleSongDragStart = (event: DragEvent<HTMLElement>, songId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', songId);
    setDraggedSongId(songId);
    setSongDropTarget(null);
  };

  const handleSongDragOver = (event: DragEvent<HTMLElement>, targetSongId: string) => {
    const sourceSongId = draggedSongId || event.dataTransfer.getData('text/plain');
    if (!songOrderMode || !sourceSongId || sourceSongId === targetSongId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const placement = getSongDropPlacement(event);
    setSongDropTarget((current) => (
      current?.songId === targetSongId && current.placement === placement
        ? current
        : { songId: targetSongId, placement }
    ));
  };

  const handleSongDrop = (event: DragEvent<HTMLElement>, targetSongId: string) => {
    event.preventDefault();
    const sourceSongId = draggedSongId || event.dataTransfer.getData('text/plain');
    const placement = songDropTarget?.songId === targetSongId
      ? songDropTarget.placement
      : getSongDropPlacement(event);
    if (sourceSongId && sourceSongId !== targetSongId) {
      commitSongOrder(insertCatalogSong(catalog, sourceSongId, targetSongId, placement));
    }
    clearSongDragState();
  };

  const getArtistAvatar = (artist: string): ArtistAvatar | undefined => (
    customArtistAvatars[artist]
      ? { src: customArtistAvatars[artist], position: '50% 50%', scale: 1 }
      : ARTIST_AVATARS[artist]
  );

  const getAvatarStyle = (artist: string) => {
    const avatar = getArtistAvatar(artist);
    return avatar ? (avatarAdjustments[artist] ?? getDefaultAvatarAdjustment(avatar)) : null;
  };

  const updateAvatarAdjustment = (artist: string, patch: Partial<AvatarAdjustment>) => {
    const avatar = getArtistAvatar(artist);
    if (!avatar) return;
    setAvatarAdjustments((current) => {
      const next = { ...current, [artist]: { ...(current[artist] ?? getDefaultAvatarAdjustment(avatar)), ...patch } };
      try { window.localStorage.setItem(ARTIST_AVATAR_ADJUSTMENTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const resetAvatarAdjustment = (artist: string) => {
    setAvatarAdjustments((current) => {
      const next = { ...current };
      delete next[artist];
      try { window.localStorage.setItem(ARTIST_AVATAR_ADJUSTMENTS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleArtistAvatarUpload = async (artist: string, file: File) => {
    try {
      const src = await resizeArtistAvatar(file);
      const nextAvatars = { ...customArtistAvatars, [artist]: src };
      const nextAdjustments = { ...avatarAdjustments };
      delete nextAdjustments[artist];
      window.localStorage.setItem(CUSTOM_ARTIST_AVATARS_KEY, JSON.stringify(nextAvatars));
      window.localStorage.setItem(ARTIST_AVATAR_ADJUSTMENTS_KEY, JSON.stringify(nextAdjustments));
      setCustomArtistAvatars(nextAvatars);
      setAvatarAdjustments(nextAdjustments);
      syncCurrentArtistSettings(catalog.artists, nextAvatars, nextAdjustments);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '头像保存失败，请换一张图片重试。');
    }
  };

  const goBack = () => {
    if (selectedSong) {
      setSelectedSong(null);
      return;
    }
    if (activeSection === null) return onBack();
    if (selectedArtist) {
      setSongOrderMode(false);
      clearSongDragState();
      setSelectedArtist(null);
      return;
    }
    setActiveSection(null);
    setQuery('');
  };

  const openPrivateSpace = () => {
    setSelectedSong(null);
    setSelectedArtist(null);
    setActiveSection('roadshows');
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

  const canManageFeaturedSongs = isFeaturedSongManager(songRecordSession?.alias);
  const rememberRoadshowUpdate = (records: RoadshowRecord[], saved: RoadshowRecord) => {
    const nextRecords = records
      .map((record) => record.id === saved.id ? saved : record)
      .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt));
    setRoadshowArchives(nextRecords);
    try {
      window.localStorage.setItem(ROADSHOW_CACHE_KEY, JSON.stringify({ version: 1, records: nextRecords }));
    } catch {}
  };

  const updateQuizLevel = async (song: Song, level: QuizLevel) => {
    if (!songRecordSession || !canManageFeaturedSongs || quizBusyId) return;
    const next = setQuizLevel(quizAssignments, song.id, level);
    setQuizAssignments(next);
    setQuizMenuSongId(null);
    setQuizBusyId(song.id);
    setSyncMessage('');
    try {
      const saved = parseQuizAssignments(await saveCloudQuizAssignments(songRecordSession, next));
      if (!saved) throw new Error('INVALID_QUIZ_LIBRARY');
      setQuizAssignments(saved);
    } catch {
      setSyncMessage('识曲歌库尚未同步，当前选择已保留');
    } finally {
      setQuizBusyId(null);
    }
  };

  const addSongToLatestRoadshow = async (song: Song) => {
    if (!songRecordSession || roadshowBusyId) return;
    setRoadshowBusyId(song.id);
    setSyncMessage('');
    try {
      const records = await pullRoadshows(songRecordSession);
      const prepared = prepareLatestRoadshowRecognitionSong(records, song);
      if (prepared.kind === 'missing') {
        setSyncMessage('还没有路演，请先在私人记录中创建一场路演');
        return;
      }
      if (prepared.kind === 'duplicate') {
        setRoadshowArchives(records);
        setSyncMessage(`${song.title}已在最新路演的听歌识曲中`);
        return;
      }
      const saved = await saveRoadshow(songRecordSession, prepared.record);
      rememberRoadshowUpdate(records, saved);
      setSyncMessage(`${song.title}已加入“${saved.title}”的听歌识曲`);
    } catch {
      setSyncMessage('加入最新路演失败，请检查网络后重试');
    } finally {
      setRoadshowBusyId(null);
    }
  };

  const addSongToLatestRoadshowPerformance = async (song: Song) => {
    if (!songRecordSession || roadshowBusyId) return;
    setRoadshowBusyId(song.id);
    setSyncMessage('');
    try {
      const records = await pullRoadshows(songRecordSession);
      const prepared = prepareLatestRoadshowPerformanceSong(records, song);
      if (prepared.kind === 'missing') {
        setRoadshowArchives([]);
        setSyncMessage('还没有路演，请先在私人记录中创建一场路演');
        return;
      }
      if (prepared.kind === 'duplicate') {
        setRoadshowArchives(records);
        setSyncMessage(`${song.title}已在最新路演的路演歌曲中`);
        return;
      }
      const saved = await saveRoadshow(songRecordSession, prepared.record);
      rememberRoadshowUpdate(records, saved);
      setQuizMenuSongId(null);
      setSyncMessage(`${song.title}已加入“${saved.title}”的路演歌曲`);
    } catch {
      setSyncMessage('加入最新路演失败，请检查网络后重试');
    } finally {
      setRoadshowBusyId(null);
    }
  };

  const QuizLevelControl = ({ song }: { song: Song }) => {
    const currentLevel = quizAssignments[song.id];
    const current = QUIZ_LEVELS.find((level) => level.id === currentLevel);
    if (!songRecordSession) {
      return current ? <span title={`识曲歌库 · ${current.label}`} className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full border px-2 text-[10px] font-black ${QUIZ_LEVEL_STYLES[current.id].badge}`}>{current.symbol}</span> : null;
    }
    const menuOpen = quizMenuSongId === song.id;
    const isInLatestRoadshow = Boolean(latestRoadshow?.performanceSongs.some((item) => (
      item.catalogId === song.id || (item.title === song.title && item.artist === song.artist)
    )));
    return (
      <span className="relative shrink-0">
        <button type="button" aria-expanded={menuOpen} aria-label={`编排${song.title}`} title={current ? `编排歌曲 · 识曲${current.label}` : '编排歌曲'} disabled={Boolean(quizBusyId || roadshowBusyId)}
          onClick={(event) => { event.stopPropagation(); setQuizMenuSongId(menuOpen ? null : song.id); }}
          className={`relative grid h-9 min-w-9 place-items-center rounded-full border px-2 text-[10px] font-black transition active:scale-95 disabled:opacity-45 ${current ? QUIZ_LEVEL_STYLES[current.id].badge : 'border-white/10 bg-black/25 text-white/35 hover:border-sky-200/35 hover:text-sky-100'}`}>
          {current?.symbol ?? <Disc3 className="h-4 w-4" />}
          {isInLatestRoadshow && <span title="已加入最新路演" aria-label="已加入最新路演" className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-black/70 bg-orange-300 text-black shadow-[0_0_10px_rgba(253,186,116,.35)]"><Check className="h-2.5 w-2.5" /></span>}
        </button>
        {menuOpen && (
          <span role="menu" aria-label={`${song.title}编排选项`} className="absolute bottom-full right-0 z-40 mb-2 grid max-h-[calc(100vh-2rem)] overflow-y-auto w-56 gap-1 overscroll-contain rounded-2xl border border-white/15 bg-[#100d16]/95 p-2 shadow-2xl backdrop-blur-xl">
            {canManageFeaturedSongs && <>
              <small className="px-2 pb-1 pt-1 text-[9px] font-black tracking-[.16em] text-white/30">识曲歌库</small>
              <span className="grid grid-cols-2 gap-1">
                {QUIZ_LEVELS.map((level) => (
                  <button key={level.id} type="button" role="menuitemradio" aria-checked={currentLevel === level.id}
                    onClick={(event) => { event.stopPropagation(); void updateQuizLevel(song, level.id); }}
                    className={`flex items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-bold transition hover:bg-white/10 ${currentLevel === level.id ? QUIZ_LEVEL_STYLES[level.id].accent : 'text-white/65'}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${QUIZ_LEVEL_STYLES[level.id].badge}`}>{level.symbol}</span>{level.label}
                  </button>
                ))}
              </span>
              <small className="px-2 pt-1 text-[9px] leading-4 text-white/30">再次选择可移出歌库</small>
            </>}
            <span className="mx-2 my-1 border-t border-white/10" />
            <small className="px-2 pb-1 text-[9px] font-black tracking-[.16em] text-orange-200/45">最新路演 · 路演歌曲</small>
            {latestRoadshow ? (
              <button type="button" disabled={isInLatestRoadshow || Boolean(roadshowBusyId)}
                onClick={(event) => { event.stopPropagation(); void addSongToLatestRoadshowPerformance(song); }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition ${isInLatestRoadshow ? 'cursor-default bg-orange-300/[.08] text-orange-100/55' : 'text-orange-100 hover:bg-orange-300/10'}`}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-orange-200/20 bg-orange-300/10">{isInLatestRoadshow ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0"><span className="block truncate">{isInLatestRoadshow ? `已加入“${latestRoadshow.title}”` : `加入“${latestRoadshow.title}”`}</span><small className="mt-0.5 block font-normal text-white/30">作为本次准备演唱的歌曲</small></span>
              </button>
            ) : <span className="rounded-xl px-3 py-2 text-[10px] leading-5 text-white/30">尚未创建路演，请先前往私人记录创建。</span>}
          </span>
        )}
      </span>
    );
  };

  const toggleFeaturedSong = async (song: Song) => {
    if (!songRecordSession || !canManageFeaturedSongs || featuredBusyId) return;
    const previous = featuredSongIds;
    const featured = previous.includes(song.id);
    const next = featured ? previous.filter((songId) => songId !== song.id) : [...previous, song.id];
    setFeaturedSongIds(next);
    setFeaturedBusyId(song.id);
    setSyncMessage('');
    try {
      setFeaturedSongIds(await saveCloudFeaturedSongIds(songRecordSession, next));
    } catch {
      setFeaturedSongIds(previous);
      setSyncMessage('热门歌曲标记未同步，请稍后重试');
    } finally {
      setFeaturedBusyId(null);
    }
  };

  const FeaturedSongControl = ({ song }: { song: Song }) => {
    const featured = featuredSongIds.includes(song.id);
    if (canManageFeaturedSongs) {
      return (
        <button type="button" aria-pressed={featured} aria-label={featured ? `取消${song.title}的热门歌曲标记` : `将${song.title}设为热门歌曲`}
          title={featured ? '取消热门歌曲' : '设为热门歌曲'} disabled={Boolean(featuredBusyId)} onClick={(event) => { event.stopPropagation(); void toggleFeaturedSong(song); }}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-base transition active:scale-95 disabled:opacity-45 ${featured ? 'border-amber-300/45 bg-amber-300/15 shadow-[0_0_18px_rgba(251,191,36,.16)]' : 'border-white/10 bg-black/25 grayscale opacity-45 hover:border-amber-200/30 hover:grayscale-0 hover:opacity-100'}`}>🔥</button>
      );
    }
    return featured ? <span className="grid h-9 w-9 shrink-0 place-items-center text-base drop-shadow-[0_0_8px_rgba(251,191,36,.35)]" title="热门歌曲">🔥</span> : null;
  };

  const RequestButton = ({ song }: { song: Song }) => {
    const done = requestedId === song.id;
    return (
      <button type="button" onClick={(event) => { event.stopPropagation(); void requestSong(song); }} disabled={done}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition active:scale-95 ${done ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-100' : 'border-orange-200/25 bg-orange-400/15 text-orange-100 hover:bg-orange-400/25'}`}>
        {done ? <><Check className="h-4 w-4" />已点</> : '点歌'}
      </button>
    );
  };

  const SongRows = ({ songs }: { songs: Song[] }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {songs.map((song, index) => {
        const isDragged = draggedSongId === song.id;
        const dropPlacement = songDropTarget?.songId === song.id ? songDropTarget.placement : null;
        return (
          <article
            key={song.id}
            draggable={songOrderMode}
            aria-label={songOrderMode ? `${song.title}，可拖拽排序` : undefined}
            aria-grabbed={songOrderMode ? isDragged : undefined}
            onDragStart={songOrderMode ? (event) => handleSongDragStart(event, song.id) : undefined}
            onDragOver={songOrderMode ? (event) => handleSongDragOver(event, song.id) : undefined}
            onDrop={songOrderMode ? (event) => handleSongDrop(event, song.id) : undefined}
            onDragEnd={songOrderMode ? clearSongDragState : undefined}
            className={`group relative flex min-w-0 items-center justify-between gap-3 rounded-2xl border bg-black/25 p-2 transition ${songOrderMode ? 'cursor-grab select-none active:cursor-grabbing' : 'hover:border-orange-200/25 hover:bg-white/[.045]'} ${isDragged ? 'opacity-40' : ''} ${dropPlacement ? 'border-orange-300/60 bg-orange-300/[.055]' : 'border-white/10'}`}
          >
            {dropPlacement && (
              <span aria-hidden="true" className={`pointer-events-none absolute z-20 rounded-full bg-orange-300 shadow-[0_0_18px_rgba(253,186,116,.8)] ${dropPlacement === 'before' ? '-top-1 left-2 right-2 h-1 sm:-left-1 sm:bottom-2 sm:right-auto sm:top-2 sm:h-auto sm:w-1' : '-bottom-1 left-2 right-2 h-1 sm:-right-1 sm:bottom-2 sm:left-auto sm:top-2 sm:h-auto sm:w-1'}`} />
            )}
            {songOrderMode && <GripVertical className="h-5 w-5 shrink-0 text-orange-200/45" aria-hidden="true" />}
            {songOrderMode ? (
              <span className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left">
                <h3 className="truncate font-bold text-orange-50">{song.title}</h3><p title={song.hotComment} className="mt-1 truncate text-xs text-white/40">{getSongSubtitle(song)}</p>
              </span>
            ) : (
              <button type="button" onClick={() => openSongDetail(song)} className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-300/50">
                <h3 className="truncate font-bold transition group-hover:text-orange-100">{song.title}</h3><p title={song.hotComment} className="mt-1 truncate text-xs text-white/40">{getSongSubtitle(song)}</p>
              </button>
            )}
            {songOrderMode ? (
              <span className="flex shrink-0 gap-1">
                <button type="button" aria-label={`${song.title}前移`} title="前移" disabled={index === 0} onClick={() => moveVisibleSong(song.id, -1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/55 transition hover:border-orange-200/35 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-20"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" aria-label={`${song.title}后移`} title="后移" disabled={index === songs.length - 1} onClick={() => moveVisibleSong(song.id, 1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/55 transition hover:border-orange-200/35 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-20"><ChevronRight className="h-4 w-4" /></button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-2"><QuizLevelControl song={song} /><FeaturedSongControl song={song} /><RequestButton song={song} /></span>
            )}
          </article>
        );
      })}
    </div>
  );

  const sectionTitle = activeSection === 'quiz' ? '识曲歌库' : HUB_DIRECTIONS.find((item) => item.id === activeSection)?.label;
  const detailBackLabel = selectedSong
    ? activeSection === 'ranking'
      ? rankingView === 'requests' ? '点歌榜' : '吉他练习榜'
      : activeSection === 'playlists' ? '热门歌曲'
        : activeSection === 'quiz' ? '识曲歌库'
          : activeSection === 'artists' && selectedArtist ? selectedArtist : '点歌台'
    : '';
  const popularImmersive = activeSection === 'playlists' && !selectedSong;

  return (
    <main className={`relative z-20 min-h-screen text-white ${popularImmersive ? 'h-screen overflow-hidden bg-transparent' : 'overflow-y-auto bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.14),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(124,58,237,.12),transparent_28%)] px-4 py-5 sm:px-7 lg:px-10 lg:py-8'}`}>
      <div className="pointer-events-none fixed inset-0 opacity-[.16] [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:42px_42px]" />
      {popularImmersive && !songAssistantOpen && (
        <button type="button" aria-label="打开歌曲助手" onClick={() => { (window as any).playClickSound?.(); setSongAssistantOpen(true); }} className="fixed right-4 top-4 z-40 bg-transparent text-3xl drop-shadow-[0_0_14px_rgba(251,191,36,.35)]">
          <span role="img" aria-label="cat" className="breath-slow inline-block transition-transform duration-200 hover:scale-125 hover:rotate-12">🐱</span>
        </button>
      )}
      {songAssistantOpen && (
        <SongAssistant
          query={query}
          displayMode={songDisplayMode}
          barrageMode={barrageMode}
          intimateMode={intimateMode}
          fillMode={fillMode}
          onQueryChange={(value) => { setQuery(value); setActiveSection('playlists'); setSelectedArtist(null); setSelectedSong(null); }}
          onResetSearch={() => setQuery('')}
          onDisplayModeChange={(mode) => { setSongDisplayMode(mode); setActiveSection('playlists'); setSelectedArtist(null); setSelectedSong(null); }}
          onBarrageModeChange={(enabled) => setBarragePreferences((current) => setBarragePreference(current, 'immersive', enabled))}
          onIntimateModeChange={(enabled) => setBarragePreferences((current) => setBarragePreference(current, 'intimate', enabled))}
          onFillModeChange={(enabled) => setBarragePreferences((current) => setBarragePreference(current, 'fill', enabled))}
          onShowPopular={() => { setActiveSection('playlists'); setSelectedArtist(null); setSelectedSong(null); setQuery(''); setSongAssistantOpen(false); }}
          onClose={() => setSongAssistantOpen(false)}
        />
      )}
      {popularImmersive ? (
        <section data-popular-immersive className="fixed inset-0 z-10 overflow-hidden bg-transparent">
          <PopularSongBarrage songs={barrageSongs} intimate={intimateMode} fill={fillMode} onSelectSong={openSongDetail} immersive />
          {!barrageMode && (
          <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between p-4 pr-16 sm:p-6 sm:pr-20">
            <button type="button" onClick={goBack} className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-4 text-sm font-semibold text-white/75 shadow-2xl backdrop-blur-xl transition hover:bg-white/15 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> 点歌台
            </button>
            <div className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-center sm:top-6">
              <p className="text-[9px] font-black tracking-[0.3em] text-violet-200/45 sm:text-[10px]">JIEYOU · HOT SONGS</p>
              <h1 className="mt-1 font-serif text-2xl font-black tracking-[-0.03em] text-white sm:text-4xl">✨ 热门歌曲 ✨</h1>
            </div>
          </header>
          )}
          {!barrageMode && (
            <p className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap text-[11px] text-white/35">{barrageSongs.length} 首 · 点击歌名查看详情</p>
          )}
        </section>
      ) : (
      <div className="relative mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4 pr-14 sm:pr-16">
          <button type="button" onClick={goBack} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-4 text-sm font-semibold text-white/70 backdrop-blur-xl transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {selectedSong ? detailBackLabel : activeSection === null ? '宇宙' : selectedArtist ? sectionTitle : '点歌台'}
          </button>
          <span className="text-[10px] font-bold tracking-[0.28em] text-orange-200/55">JIEYOU · SONG REQUEST</span>
        </header>

        {selectedSong ? (
          <SongDetailPanel song={selectedSong} records={songRecords} roadshows={roadshowArchives} session={songRecordSession} syncStatus={recordSyncStatus} onRecordsChange={commitSongRecords} onOpenPrivateSpace={openPrivateSpace} />
        ) : activeSection === null ? (
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
              <button type="button" onClick={() => setActiveSection('quiz')}
                className="group relative min-h-36 overflow-hidden rounded-[2rem] border border-sky-200/15 bg-[radial-gradient(circle_at_12%_50%,rgba(56,189,248,.18),transparent_32%),linear-gradient(105deg,rgba(14,116,144,.16),rgba(88,28,135,.10),rgba(159,18,57,.10))] p-7 text-left backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-sky-100/30 sm:col-span-2 sm:p-8">
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-sky-100/20 bg-black/25 text-sky-100"><Disc3 className="h-7 w-7 transition duration-500 group-hover:rotate-180" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black tracking-[0.28em] text-sky-100/45">QUIZ LIBRARY</span>
                    <h2 className="mt-1 font-serif text-3xl font-black">识曲歌库</h2>
                    <span className="mt-2 block text-sm text-white/45">四档题库 · 已采购 {quizCounts.total} 首</span>
                  </span>
                  <span className="flex flex-wrap gap-2 sm:justify-end">
                    {QUIZ_LEVELS.map((level) => <span key={level.id} className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${QUIZ_LEVEL_STYLES[level.id].badge}`}>{level.symbol} {quizCounts[level.id]}</span>)}
                  </span>
                  <ChevronRight className="absolute right-0 top-0 h-5 w-5 text-white/25 transition group-hover:translate-x-1 group-hover:text-white/70" />
                </div>
              </button>
            </nav>
          </>
        ) : (
          <section>
            {activeSection !== 'roadshows' && (
            <div className="mb-7 flex items-end justify-between gap-4">
              <div><p className="text-[10px] font-black tracking-[0.28em] text-orange-300/65">SONG REQUEST</p>
                <h1 className="mt-1 font-serif text-4xl font-black sm:text-5xl">{selectedArtist || (activeSection === 'ranking' ? rankingView === 'requests' ? '点歌榜' : personalRankingArtist ? `${personalRankingArtist} · 吉他练习榜` : '吉他练习榜' : sectionTitle)}</h1>
              </div>
              {activeSection === 'ranking' && (
                <div role="tablist" aria-label="排行榜切换" className="flex shrink-0 gap-1 rounded-full border border-white/10 bg-black/35 p-1">
                  <button type="button" aria-label="切换到点歌榜" aria-pressed={rankingView === 'requests'} onClick={() => setRankingView('requests')}
                    className={`grid h-10 w-10 place-items-center rounded-full transition ${rankingView === 'requests' ? 'bg-orange-300 text-black' : 'text-white/45 hover:text-white'}`}>
                    <Trophy className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="切换到吉他练习榜" aria-pressed={rankingView === 'personal'} onClick={() => setRankingView('personal')}
                    className={`grid h-10 w-10 place-items-center rounded-full transition ${rankingView === 'personal' ? 'bg-orange-300 text-black' : 'text-white/45 hover:text-white'}`}>
                    <Target className="h-4 w-4" />
                  </button>
                </div>
              )}
              {activeSection === 'artists' && (
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {!selectedArtist && <>
                    <button type="button" aria-pressed={artistOrderMode} onClick={() => { if (artistOrderMode) syncCurrentArtistSettings(); clearArtistDragState(); setArtistOrderMode((current) => !current); setAvatarAdjustMode(false); setAdjustingArtist(null); }} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${artistOrderMode ? 'border-orange-200/40 bg-orange-300 text-black' : 'border-white/10 bg-black/30 text-white/55 hover:text-white'}`}>
                      <ListOrdered className="h-4 w-4" />{artistOrderMode ? '完成排序' : '调整排序'}
                    </button>
                    <button type="button" aria-pressed={avatarAdjustMode} onClick={() => { if (avatarAdjustMode) syncCurrentArtistSettings(); clearArtistDragState(); setAvatarAdjustMode((current) => !current); setArtistOrderMode(false); setAdjustingArtist(null); }} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${avatarAdjustMode ? 'border-orange-200/40 bg-orange-300 text-black' : 'border-white/10 bg-black/30 text-white/55 hover:text-white'}`}>
                      <SlidersHorizontal className="h-4 w-4" />{avatarAdjustMode ? '完成头像' : '调整头像'}
                    </button>
                  </>}
                  {selectedArtist && (
                    <button type="button" aria-pressed={songOrderMode} onClick={() => { clearSongDragState(); setSongOrderMode((current) => !current); }} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${songOrderMode ? 'border-orange-200/40 bg-orange-300 text-black' : 'border-white/10 bg-black/30 text-white/55 hover:text-white'}`}>
                      <ListOrdered className="h-4 w-4" />{songOrderMode ? '完成排序' : '调整排序'}
                    </button>
                  )}
                  <button type="button" onClick={selectedArtist ? handleAddSong : handleAddArtist} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/25 bg-rose-300/10 px-3.5 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-300/20">
                    <Plus className="h-4 w-4" />{selectedArtist ? '新增歌曲' : '新增歌手'}
                  </button>
                  <button type="button" onClick={selectedArtist ? handleRemoveSong : handleRemoveArtist} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3.5 py-2 text-xs font-bold text-white/55 transition hover:border-red-300/30 hover:text-red-200">
                    <Trash2 className="h-4 w-4" />{selectedArtist ? '删除歌曲' : '删除歌手'}
                  </button>
                </div>
              )}
            </div>
            )}

            {activeSection === 'ranking' && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="rounded-[1.75rem] border border-white/10 bg-black/35 p-5 sm:p-7">
                  {rankingView === 'requests' ? (
                    ranking.length ? <ol className="space-y-3">{ranking.map(({ song, count }, index) => (
                      <li key={song.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.035] p-4">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-serif font-black ${RANKING_MEDAL_CLASSES[getRankingMedalTone(index, 3)]}`}>{index + 1}</span>
                        <button type="button" onClick={() => openSongDetail(song)} className="min-w-0 flex-1 text-left"><p className="truncate font-bold hover:text-orange-100">{song.title}</p><p className="truncate text-xs text-white/40">{song.artist}</p></button>
                        <strong className="font-serif text-xl text-orange-200">{count}<small className="ml-1 font-sans text-[10px] font-normal text-white/30">次</small></strong>
                      </li>
                    ))}</ol> : <div className="grid min-h-64 place-items-center text-center text-white/40"><div><Trophy className="mx-auto h-9 w-9 opacity-40" /><p className="mt-3">还没有人点歌</p></div></div>
                  ) : (
                    visiblePersonalRanking.length ? <ol
                      tabIndex={visiblePersonalRanking.length > PERSONAL_RANKING_SCROLL_THRESHOLD ? 0 : undefined}
                      aria-label={visiblePersonalRanking.length > PERSONAL_RANKING_SCROLL_THRESHOLD ? `${personalRankingArtist ?? '总榜'}${isPersonalRankingRandom ? '随机' : '匹配度'}排行，可上下滚动` : undefined}
                      className={`space-y-3 ${visiblePersonalRanking.length > PERSONAL_RANKING_SCROLL_THRESHOLD ? 'max-h-[42rem] overflow-y-auto overscroll-contain pr-2' : ''}`}
                    >{visiblePersonalRanking.map(({ song, score, practiceCount, originalRank }, index) => {
                      const quality = getMatchQuality(Math.round(score));
                      return (
                        <li key={song.id} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.035] p-4">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-serif font-black ${RANKING_MEDAL_CLASSES[getRankingMedalTone(index, personalRankingPodiumSize)]}`}>{originalRank}</span>
                          <button type="button" disabled={!canOpenPracticeDetails} onClick={() => openPracticeSongDetail(song)} title={canOpenPracticeDetails ? '查看我的私人练习档案' : '登录本人私有空间后可查看详情'} className={`min-w-0 flex-1 text-left ${canOpenPracticeDetails ? '' : 'cursor-default'}`}><p className={`truncate font-bold ${canOpenPracticeDetails ? 'hover:text-orange-100' : ''}`}>{song.title}</p><p className="truncate text-xs text-white/40">{canOpenPracticeDetails ? `${song.artist} · 练习 ${practiceCount} 次` : song.artist}</p></button>
                          <span className="flex shrink-0 items-center gap-3">
                            <em className={`practice-quality ${quality?.tone ?? 'white'}`}>{quality?.label ?? '—'}</em>
                            <strong className="font-serif text-xl text-orange-200">{score}<small className="ml-1 font-sans text-[10px] font-normal text-white/30">匹配度</small></strong>
                          </span>
                        </li>
                      );
                    })}</ol> : <div className="grid min-h-64 place-items-center text-center text-white/40"><div><Target className="mx-auto h-9 w-9 opacity-40" /><p className="mt-3">{songRecordSession ? personalRankingArtist ? `${personalRankingArtist}还没有练习记录` : '还没有练习记录' : publicRankingStatus || (personalRankingArtist ? `${personalRankingArtist}暂无公开排行` : '暂无公开排行')}</p></div></div>
                  )}
                </div>
                {rankingView === 'requests' ? (
                  <aside className="h-fit rounded-[1.75rem] border border-orange-200/15 bg-orange-950/20 p-6 text-sm leading-7 text-white/45">点歌榜会汇总所有设备上的累计点歌次数。</aside>
                ) : (
                  <aside aria-label="吉他练习榜歌手筛选" className="h-fit overflow-hidden rounded-[1.75rem] border border-orange-200/15 bg-orange-950/20 p-4 sm:p-5">
                    <label className="flex h-11 items-center gap-2.5 rounded-xl border border-white/10 bg-black/35 px-3.5 focus-within:border-orange-300/45">
                      <Search className="h-4 w-4 shrink-0 text-orange-200/55" />
                      <input value={rankingArtistQuery} onChange={(event) => setRankingArtistQuery(event.target.value)} placeholder="搜索歌手或歌曲" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/28" />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button type="button" aria-pressed={personalRankingArtist === null} onClick={() => setPersonalRankingArtist(null)} className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm font-black transition ${personalRankingArtist === null ? 'border-orange-300/45 bg-orange-300 text-black' : 'border-white/10 bg-black/25 text-white/65 hover:border-orange-200/25 hover:text-white'}`}>总榜</button>
                      <button type="button" aria-pressed={isPersonalRankingRandom} onClick={() => setIsPersonalRankingRandom((prev) => !prev)} className={`flex-1 rounded-xl border px-4 py-3 text-sm font-black transition ${isPersonalRankingRandom ? 'border-orange-300/45 bg-orange-300 text-black' : 'border-white/10 bg-black/25 text-white/65 hover:border-orange-200/25 hover:text-white'}`}>随机</button>
                    </div>
                    <div className="mt-3 grid max-h-[34rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-1">
                      {personalRankingArtists.map(({ artist, songs }) => {
                        const avatar = getArtistAvatar(artist);
                        const avatarStyle = getAvatarStyle(artist);
                        return (
                          <button key={artist} type="button" aria-pressed={personalRankingArtist === artist} onClick={() => setPersonalRankingArtist(artist)} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left transition ${personalRankingArtist === artist ? 'border-orange-300/50 bg-orange-300/12' : 'border-white/10 bg-black/25 hover:border-orange-200/25'}`}>
                            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-orange-200/15 bg-orange-300/10">
                              {avatar && avatarStyle ? <img src={avatar.src} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${avatarStyle.x}% ${avatarStyle.y}%`, transform: `scale(${avatarStyle.scale}) rotate(${avatarStyle.rotation}deg)`, transformOrigin: `${avatarStyle.x}% ${avatarStyle.y}%` }} /> : <Mic2 className="h-4 w-4 text-orange-200/70" />}
                            </span>
                            <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white/85">{artist}</strong><small className="text-[10px] text-white/35">{songs.length} 首</small></span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/25" />
                          </button>
                        );
                      })}
                      {!personalRankingArtists.length && <p className="col-span-2 py-8 text-center text-xs text-white/35">没有找到歌手</p>}
                    </div>
                  </aside>
                )}
              </div>
            )}

            {activeSection === 'quiz' && (
              <div className="grid gap-4 lg:grid-cols-2">
                {QUIZ_LEVELS.map((level) => {
                  const levelSongs = quizGroups[level.id];
                  return (
                    <section key={level.id} className={`flex h-[22rem] flex-col rounded-[1.75rem] border p-5 sm:p-6 ${QUIZ_LEVEL_STYLES[level.id].panel}`}>
                      <header className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid h-10 w-10 place-items-center rounded-full border font-serif font-black ${QUIZ_LEVEL_STYLES[level.id].badge}`}>{level.symbol}</span>
                          <div><p className={`text-[10px] font-black tracking-[0.22em] ${QUIZ_LEVEL_STYLES[level.id].accent}`}>LEVEL {level.symbol}</p><h2 className="font-serif text-2xl font-black">{level.label}</h2></div>
                        </div>
                        <strong className="text-sm text-white/45">{levelSongs.length} 首</strong>
                      </header>
                      {levelSongs.length ? (
                        <div className="min-h-0 flex-1 grid grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 pr-1 content-start">
                          {levelSongs.map((song) => (
                            <article key={song.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                              <button type="button" onClick={() => openSongDetail(song)} className="min-w-0 flex-1 text-left">
                                <strong className="block truncate text-sm">{song.title}</strong><small className="mt-1 block truncate text-white/35">{song.artist}</small>
                              </button>
                              {songRecordSession && (
                                <button type="button" aria-label={`将${song.title}加入最新路演听歌识曲`} title="加入最新路演 · 听歌识曲"
                                  disabled={Boolean(roadshowBusyId)} onClick={() => { void addSongToLatestRoadshow(song); }}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-orange-200/20 bg-orange-300/10 text-orange-100 transition hover:bg-orange-300/20 disabled:opacity-40">
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </article>
                          ))}
                        </div>
                      ) : <div className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 text-center text-xs leading-6 text-white/30">这个档位还没有歌曲<br />去歌手页点击唱片按钮采购</div>}
                    </section>
                  );
                })}
              </div>
            )}

            {activeSection === 'artists' && (
              <div className="space-y-5">
                <SearchBox query={query} setQuery={setQuery} />
                {!selectedArtist && (
                  <div role="tablist" aria-label="歌手语种筛选" className="flex items-center gap-2 overflow-x-auto pb-1">
                    {ARTIST_LANGUAGE_FILTERS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={artistLanguageFilter === item.value}
                        onClick={() => setArtistLanguageFilter(item.value)}
                        className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${artistLanguageFilter === item.value ? 'border-orange-300/45 bg-orange-300 text-black shadow-[0_8px_24px_rgba(251,146,60,.16)]' : 'border-white/10 bg-black/30 text-white/45 hover:border-orange-200/25 hover:text-white/75'}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                {avatarAdjustMode && !selectedArtist && (
                  <AvatarAdjustmentPanel
                    artist={adjustingArtist}
                    avatar={adjustingArtist ? getArtistAvatar(adjustingArtist) : undefined}
                    adjustment={adjustingArtist ? getAvatarStyle(adjustingArtist) : null}
                    onUpload={(file) => { if (adjustingArtist) void handleArtistAvatarUpload(adjustingArtist, file); }}
                    onChange={(patch) => { if (adjustingArtist) updateAvatarAdjustment(adjustingArtist, patch); }}
                    onReset={() => { if (adjustingArtist) resetAvatarAdjustment(adjustingArtist); }}
                    onDone={() => { setAdjustingArtist(null); syncCurrentArtistSettings(); }}
                  />
                )}
                {selectedArtist ? <>
                  {songOrderMode && (
                    <p className="flex items-center gap-2 text-xs text-orange-100/55">
                      <GripVertical className="h-4 w-4" aria-hidden="true" />拖拽歌曲到任意位置，或使用箭头微调；顺序会自动同步
                    </p>
                  )}
                  <SongRows songs={catalogSongs.filter((song) => song.artist === selectedArtist)} />
                </> : (<>
                      {artistOrderMode && (
                        <p className="flex items-center gap-2 text-xs text-orange-100/55">
                          <GripVertical className="h-4 w-4" aria-hidden="true" />拖拽歌手到任意位置，或使用箭头微调
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{artistGroups.map(({ artist, songs }, index) => {
                        const avatar = getArtistAvatar(artist);
                        const avatarStyle = getAvatarStyle(artist);
                        const isDragged = draggedArtist === artist;
                        const dropPlacement = artistDropTarget?.artist === artist ? artistDropTarget.placement : null;
                        const cardClass = `relative flex min-w-0 items-center gap-4 rounded-2xl border bg-black/30 p-4 text-left transition ${adjustingArtist === artist ? 'border-orange-300/70 ring-2 ring-orange-300/15' : 'border-white/10 hover:border-rose-300/35'}`;
                        const cardContent = <>
                          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-rose-200/20 bg-rose-300/10">
                            {avatar && avatarStyle ? (
                              <img src={avatar.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" style={{ objectPosition: `${avatarStyle.x}% ${avatarStyle.y}%`, transform: `scale(${avatarStyle.scale}) rotate(${avatarStyle.rotation}deg)`, transformOrigin: `${avatarStyle.x}% ${avatarStyle.y}%` }} />
                            ) : <Mic2 className="h-5 w-5 text-rose-200" />}
                          </span>
                          <span className="min-w-0 flex-1"><strong className="block truncate">{artist}</strong><small className="text-white/35">{songs.length} 首</small></span>
                        </>;
                        if (artistOrderMode) return (
                          <article
                            key={artist}
                            draggable={artistOrderMode}
                            aria-label={`${artist}，可拖拽排序`}
                            aria-grabbed={isDragged}
                            title="拖拽到任意位置，或使用箭头微调"
                            onDragStart={(event) => handleArtistDragStart(event, artist)}
                            onDragOver={(event) => handleArtistDragOver(event, artist)}
                            onDrop={(event) => handleArtistDrop(event, artist)}
                            onDragEnd={clearArtistDragState}
                            className={`${cardClass} cursor-grab select-none active:cursor-grabbing ${isDragged ? 'opacity-40' : ''} ${dropPlacement ? 'border-orange-300/60 bg-orange-300/[.055]' : ''}`}
                          >
                            {dropPlacement && (
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none absolute z-20 rounded-full bg-orange-300 shadow-[0_0_18px_rgba(253,186,116,.8)] ${dropPlacement === 'before'
                                  ? '-top-1 left-2 right-2 h-1 sm:-left-1 sm:bottom-2 sm:right-auto sm:top-2 sm:h-auto sm:w-1'
                                  : '-bottom-1 left-2 right-2 h-1 sm:-right-1 sm:bottom-2 sm:left-auto sm:top-2 sm:h-auto sm:w-1'}`}
                              />
                            )}
                            <GripVertical className="h-5 w-5 shrink-0 text-orange-200/45" aria-hidden="true" />
                            {cardContent}
                            <span className="flex shrink-0 gap-1">
                              <button type="button" aria-label={`${artist}前移`} title="前移" disabled={index === 0} onClick={() => moveVisibleArtist(artist, -1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/55 transition hover:border-orange-200/35 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-20"><ChevronLeft className="h-4 w-4" /></button>
                              <button type="button" aria-label={`${artist}后移`} title="后移" disabled={index === artistGroups.length - 1} onClick={() => moveVisibleArtist(artist, 1)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white/55 transition hover:border-orange-200/35 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-20"><ChevronRight className="h-4 w-4" /></button>
                            </span>
                          </article>
                        );
                        return (
                          <button key={artist} type="button" onClick={() => avatarAdjustMode ? setAdjustingArtist(artist) : setSelectedArtist(artist)} className={cardClass}>
                            {cardContent}<ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
                          </button>
                        );
                      })}</div>
                </>)}
              </div>
            )}

            {activeSection === 'roadshows' && (
              <RoadshowPanel
                defaultAlias={nickname}
                songs={catalogSongs}
                records={songRecords}
                syncStatus={recordSyncStatus}
                quizAssignments={quizAssignments}
                onRecordsChange={commitSongRecords}
              />
            )}
          </section>
        )}
      </div>
      )}
      <p className="sr-only" aria-live="polite">{requestedId ? `已点歌曲 ${catalogSongs.find((song) => song.id === requestedId)?.title ?? ''}` : syncMessage}</p>
      {syncMessage && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-red-200/15 bg-black/85 px-4 py-2 text-xs text-red-100 shadow-xl">{syncMessage}</div>}
    </main>
  );
};

const SongAssistant = ({ query, displayMode, barrageMode, intimateMode, fillMode, onQueryChange, onResetSearch, onDisplayModeChange, onBarrageModeChange, onIntimateModeChange, onFillModeChange, onShowPopular, onClose }: {
  query: string;
  displayMode: SongDisplayMode;
  barrageMode: boolean;
  intimateMode: boolean;
  fillMode: boolean;
  onQueryChange: (value: string) => void;
  onResetSearch: () => void;
  onDisplayModeChange: (mode: SongDisplayMode) => void;
  onBarrageModeChange: (enabled: boolean) => void;
  onIntimateModeChange: (enabled: boolean) => void;
  onFillModeChange: (enabled: boolean) => void;
  onShowPopular: () => void;
  onClose: () => void;
}) => (
  <>
    <button type="button" aria-label="关闭歌曲助手" onClick={onClose} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
    <aside aria-label="歌曲助手栏" className="fixed right-0 top-0 z-50 h-full w-[min(24rem,88vw)] overflow-y-auto border-l border-white/10 bg-[#09070d]/88 p-5 text-white shadow-[-24px_0_80px_rgba(0,0,0,.45)] backdrop-blur-2xl">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <div><p className="text-[10px] font-black tracking-[0.25em] text-orange-200/55">JIEYOU ASSISTANT</p><h2 className="mt-1 text-2xl font-black">💪 助手栏</h2></div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/55 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </header>
      <div className="mt-6 space-y-4">
        <details className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4"><span className="text-lg font-bold">🔎 检索</span><ChevronRight className="h-4 w-4 text-white/45 transition group-open:rotate-90" /></summary>
          <div className="space-y-3 border-t border-white/[.06] p-3">
            <label className="flex items-center rounded-xl bg-white/[.055] px-3 py-2.5 focus-within:ring-1 focus-within:ring-cyan-200/45">
              <Search className="mr-2 h-4 w-4 text-cyan-100/70" />
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索歌名或歌手" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" />
            </label>
            <button type="button" onClick={onResetSearch} className="w-full rounded-xl bg-white/[.07] px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/[.12] hover:text-white">重置</button>
          </div>
        </details>

        <details open className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4"><span className="text-lg font-bold">⭐ 歌曲展示</span><ChevronRight className="h-4 w-4 text-white/45 transition group-open:rotate-90" /></summary>
          <div className="space-y-3 border-t border-white/[.06] p-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[.055] px-3 py-2.5">
              <span className="text-sm text-white/90">随机部分（60首，刷新重置）</span>
              <label className="inline-flex shrink-0 items-center gap-2"><input type="checkbox" checked={displayMode === 'random'} onChange={(event) => onDisplayModeChange(event.target.checked ? 'random' : 'full')} className="accent-cyan-300" /><span className="text-xs text-white/70">{displayMode === 'random' ? '开启' : '关闭'}</span></label>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[.055] px-3 py-2.5">
              <span className="text-sm text-white/90">完全展示（全部歌曲）</span>
              <label className="inline-flex shrink-0 items-center gap-2"><input type="checkbox" checked={displayMode === 'full'} onChange={(event) => onDisplayModeChange(event.target.checked ? 'full' : 'random')} className="accent-cyan-300" /><span className="text-xs text-white/70">{displayMode === 'full' ? '开启' : '关闭'}</span></label>
            </div>
            <p className="px-1 text-xs leading-5 text-white/45">提示：使用“检索”时总是展示所有匹配歌曲。</p>
          </div>
        </details>

        <details open className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4"><span className="text-lg font-bold">💬 弹幕</span><ChevronRight className="h-4 w-4 text-white/45 transition group-open:rotate-90" /></summary>
          <div className="space-y-3 border-t border-white/[.06] p-3">
            <div className="flex items-center justify-between rounded-xl bg-white/[.055] px-3 py-3">
              <div><div className="text-sm text-white/90">弹幕模式</div><div className="mt-1 text-xs text-white/55">只保留星空与歌曲</div></div>
              <button type="button" role="switch" aria-checked={barrageMode} aria-label="弹幕模式" onClick={() => onBarrageModeChange(!barrageMode)} className={`relative h-7 w-12 rounded-full border transition-colors duration-200 ${barrageMode ? 'border-emerald-300/60 bg-emerald-400/80' : 'border-white/20 bg-white/10'}`}>
                <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${barrageMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[.055] px-3 py-3">
              <div><div className="text-sm text-white/90">亲密模式</div><div className="mt-1 text-xs text-white/55">弹幕横纵间距减半</div></div>
              <button type="button" role="switch" aria-checked={intimateMode} aria-label="亲密模式" onClick={() => onIntimateModeChange(!intimateMode)} className={`relative h-7 w-12 rounded-full border transition-colors duration-200 ${intimateMode ? 'border-emerald-300/60 bg-emerald-400/80' : 'border-white/20 bg-white/10'}`}>
                <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${intimateMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[.055] px-3 py-3">
              <div><div className="text-sm text-white/90">填充模式</div><div className="mt-1 text-xs text-white/55">循环补齐弹幕，减少屏幕空白</div></div>
              <button type="button" role="switch" aria-checked={fillMode} aria-label="填充模式" onClick={() => onFillModeChange(!fillMode)} className={`relative h-7 w-12 rounded-full border transition-colors duration-200 ${fillMode ? 'border-emerald-300/60 bg-emerald-400/80' : 'border-white/20 bg-white/10'}`}>
                <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${fillMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </details>

        <button type="button" onClick={onShowPopular} className="flex w-full items-center justify-between rounded-2xl border border-violet-200/15 bg-violet-300/[.06] p-4 text-left transition hover:border-violet-200/35"><span><strong className="block">查看热门歌曲</strong><small className="mt-1 block text-white/40">回到全屏彩色弹幕</small></span><ChevronRight className="h-5 w-5 text-violet-200/55" /></button>
      </div>
    </aside>
  </>
);

const AvatarAdjustmentPanel = ({ artist, avatar, adjustment, onUpload, onChange, onReset, onDone }: {
  artist: string | null;
  avatar?: ArtistAvatar;
  adjustment: AvatarAdjustment | null;
  onUpload: (file: File) => void;
  onChange: (patch: Partial<AvatarAdjustment>) => void;
  onReset: () => void;
  onDone: () => void;
}) => {
  if (!artist) {
    return <div className="rounded-2xl border border-dashed border-orange-200/20 bg-orange-950/10 px-5 py-4 text-sm text-white/45">点击任一歌手卡片，即可上传或手动调整头像。</div>;
  }

  const currentAdjustment = adjustment ?? { x: 50, y: 50, scale: 1, rotation: 0 };
  const controls = [
    { label: '左右', key: 'x', min: 0, max: 100, step: 1, value: currentAdjustment.x },
    { label: '上下', key: 'y', min: 0, max: 100, step: 1, value: currentAdjustment.y },
    { label: '缩放', key: 'scale', min: 1, max: 4, step: 0.05, value: currentAdjustment.scale },
    { label: '旋转', key: 'rotation', min: -30, max: 30, step: 1, value: currentAdjustment.rotation },
  ] as const;

  return (
    <section className="rounded-[1.5rem] border border-orange-200/20 bg-black/45 p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="mx-auto grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border border-orange-200/30 bg-black sm:mx-0">
          {avatar && adjustment ? <img src={avatar.src} alt={`${artist}头像预览`} className="h-full w-full object-cover" style={{ objectPosition: `${adjustment.x}% ${adjustment.y}%`, transform: `scale(${adjustment.scale}) rotate(${adjustment.rotation}deg)`, transformOrigin: `${adjustment.x}% ${adjustment.y}%` }} /> : <Mic2 className="h-8 w-8 text-orange-200/55" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-black tracking-[0.2em] text-orange-300/65">头像设置</p><h2 className="mt-1 font-bold">{artist}</h2></div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-orange-200/25 bg-orange-300/10 px-3 py-2 text-xs font-bold text-orange-100 transition hover:bg-orange-300/20"><Upload className="h-3.5 w-3.5" />{avatar ? '更换头像' : '上传头像'}<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }} /></label>
              {avatar && <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs text-white/55 hover:text-white"><RotateCcw className="h-3.5 w-3.5" />重置</button>}
              <button type="button" onClick={onDone} className="rounded-full bg-orange-300 px-4 py-2 text-xs font-bold text-black">完成</button>
            </div>
          </div>
          {avatar ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {controls.map(({ label, key, min, max, step, value }) => (
              <label key={key} className="text-xs text-white/50"><span className="mb-2 flex justify-between"><b className="text-white/75">{label}</b><span>{Number(value).toFixed(key === 'scale' ? 2 : 0)}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange({ [key]: Number(event.target.value) })} className="w-full accent-orange-300" /></label>
            ))}
          </div> : <p className="rounded-xl border border-dashed border-white/10 bg-white/[.025] px-4 py-3 text-sm text-white/40">该歌手还没有头像，请先上传图片；上传后即可调整位置、缩放和旋转。</p>}
        </div>
      </div>
    </section>
  );
};

const SearchBox = ({ query, setQuery }: { query: string; setQuery: (value: string) => void }) => (
  <label className="flex h-13 items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 focus-within:border-orange-300/45">
    <Search className="h-5 w-5 text-orange-200/55" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌名或歌手" className="h-13 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/30" />
  </label>
);

export default SongRequestStation;
