import { ensureSignIn, tcbApp } from '../../services/tcb';
import type { VoteCounts, VoteRequesters } from './songRequest';
import type { FeelingsNotebook, NotebookPage } from './feelingsNotebook';
import type { PublicQuizParticipantRankingItem, PublicQuizRankingItem, RoadshowLocation, RoadshowRecord } from './roadshow';
import type { PublicPracticeRankingItem, SongRecord } from './songRecords';
import {
  isCloudScorePage,
  parseSongScores,
  toStoredSongScore,
  withResolvedSongScorePages,
  type SongScore,
  type StoredSongScore,
} from './songScores';
import type { ArtistSettingsPayload, ArtistSettingsSnapshot } from './artistSettings';
import type { QuizAssignments } from './songQuizLibrary';
import type { SongGroupsSnapshot } from './songGroups';
import type { JournalEntry, JournalSnapshot } from '../Enough/journalModel';

export const pullEnoughJournal = async (credentials: Credentials): Promise<JournalSnapshot> =>
  (await callSync<{ journal: JournalSnapshot }>({ action: 'enough:pull', ...credentials })).journal;
export const saveEnoughJournal = async (credentials: Credentials, expectedRevision: number, entries: JournalEntry[]): Promise<JournalSnapshot> =>
  (await callSync<{ journal: JournalSnapshot }>({ action: 'enough:save', ...credentials, expectedRevision, entries })).journal;

export interface Credentials {
  alias: string;
  password: string;
}

export interface InquiryEntry { id: string; topic: 'philosophy' | 'poetry' | 'internet' | 'memes'; question: string; insight: string; }
export interface InquirySnapshot { revision: number; entries: InquiryEntry[]; }
export const pullInquiries = async (credentials: Credentials) => (await callSync<{ snapshot: InquirySnapshot }>({ action: 'inquiries:pull', ...credentials })).snapshot;
export const saveInquiries = async (credentials: Credentials, expectedRevision: number, entries: InquiryEntry[]) => (await callSync<{ snapshot: InquirySnapshot }>({ action: 'inquiries:save', ...credentials, expectedRevision, entries })).snapshot;

export const verifyStarOwner = (credentials: Credentials) => callSync<{ owner: true }>({ action: 'stars:verifyOwner', ...credentials });
export const callOwnerStars = <T,>(credentials: Credentials, action: string, payload: Record<string, unknown>) => callSync<T>({ ...payload, action, ...credentials });

export interface CloudVoteState {
  counts: VoteCounts;
  sungCounts: VoteCounts;
  requesterNames: VoteRequesters;
}

type CloudResult<T> = { ok: true } & T;

const callSync = async <T>(data: Record<string, unknown>): Promise<CloudResult<T>> => {
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  await ensureSignIn();
  try {
    const response = await tcbApp.callFunction({ name: 'songRequestSync', data });
    const result = response?.result as ({ ok?: boolean; error?: string } & T) | undefined;
    if (!result?.ok) throw new Error(result?.error || 'SYNC_FAILED');
    return result as CloudResult<T>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? '');
    if (/timeout|timed out|deadline|超时/i.test(detail)) throw new Error('CLOUD_TIMEOUT');
    if (/payload too large|request entity too large|\b413\b|请求体过大/i.test(detail)) throw new Error('PAYLOAD_TOO_LARGE');
    throw error instanceof Error ? error : new Error('SYNC_FAILED');
  }
};

export const pullCloudVoteState = async (location?: RoadshowLocation): Promise<CloudVoteState> => {
  const result = await callSync<{ counts: VoteCounts; sungCounts?: VoteCounts; requesterNames?: VoteRequesters }>({ action: 'votes:pull', ...(location ? { location } : {}) });
  return { counts: result.counts, sungCounts: result.sungCounts ?? {}, requesterNames: result.requesterNames ?? {} };
};

export const pullCloudVotes = async (location?: RoadshowLocation): Promise<VoteCounts> => (await pullCloudVoteState(location)).counts;

export const incrementCloudVote = async (songId: string, location?: RoadshowLocation, requesterName?: string): Promise<{ count: number; location: RoadshowLocation | null }> => (
  await callSync<{ count: number; location: RoadshowLocation | null }>({ action: 'votes:increment', songId, ...(location ? { location } : {}), ...(requesterName ? { requesterName } : {}) })
);

export const finishCloudVotes = async (credentials: Credentials): Promise<CloudVoteState> => {
  const result = await callSync<CloudVoteState>({ action: 'votes:finishAll', ...credentials });
  return { counts: result.counts, sungCounts: result.sungCounts, requesterNames: result.requesterNames ?? {} };
};

export const adjustCloudSungVote = async (credentials: Credentials, songId: string, delta: 1 | -1, location?: RoadshowLocation): Promise<VoteCounts> => (
  await callSync<{ sungCounts: VoteCounts }>({ action: 'votes:adjustSung', ...credentials, songId, delta, ...(location ? { location } : {}) })
).sungCounts;

export const pullCloudRoadshowSingCounts = async (credentials: Credentials): Promise<VoteCounts> => (
  await callSync<{ roadshowSingCounts: VoteCounts }>({ action: 'roadshowSings:pull', ...credentials })
).roadshowSingCounts;

export interface CloudRoadshowSingState {
  roadshowSingCounts: VoteCounts;
  roadshowSingCountsByLocation?: Partial<Record<RoadshowLocation, VoteCounts>>;
  roadshowSingCountsClearedAt?: string;
  location?: RoadshowLocation;
}

export interface SongQuizPlay {
  id: string;
  catalogId: string;
  title: string;
  artist: string;
  roadshowId: string;
  location: RoadshowLocation;
  playedAt: string;
  correct?: boolean;
}

export interface SongQuizStats {
  playCount: number;
  answerCount: number;
  correctCount: number;
  accuracy: number | null;
}

export interface CloudSongQuizState {
  event: SongQuizPlay | null;
  stats: SongQuizStats;
  statsByLocation: Record<RoadshowLocation, SongQuizStats>;
}

export const recordCloudLatestRoadshowSing = (credentials: Credentials, songId: string, eventId: string, delta: 1 | -1 = 1): Promise<CloudRoadshowSingState> =>
  callSync<CloudRoadshowSingState>({ action: 'roadshowSings:adjust', ...credentials, songId, delta, latest: true, eventId });

export const pullCloudSongQuizPlay = (credentials: Credentials, songId: string): Promise<CloudSongQuizState> =>
  callSync<CloudSongQuizState>({ action: 'roadshowQuiz:pull', ...credentials, songId });

export const startCloudSongQuizPlay = (credentials: Credentials, song: { id: string; title: string; artist: string }, eventId: string): Promise<CloudSongQuizState> =>
  callSync<CloudSongQuizState>({ action: 'roadshowQuiz:start', ...credentials, eventId, songId: song.id, title: song.title, artist: song.artist });

export const judgeCloudSongQuizPlay = (credentials: Credentials, eventId: string, correct: boolean): Promise<CloudSongQuizState> =>
  callSync<CloudSongQuizState>({ action: 'roadshowQuiz:judge', ...credentials, eventId, correct });

export const undoCloudSongQuizPlay = (credentials: Credentials, eventId: string): Promise<CloudSongQuizState & { location: RoadshowLocation }> =>
  callSync<CloudSongQuizState & { location: RoadshowLocation }>({ action: 'roadshowQuiz:undo', ...credentials, eventId });

export const pullCloudRoadshowSingState = (credentials: Credentials): Promise<CloudRoadshowSingState> =>
  callSync<CloudRoadshowSingState>({ action: 'roadshowSings:pull', ...credentials });

export const adjustCloudRoadshowSingCount = (
  credentials: Credentials, songId: string, delta: 1 | -1, location?: RoadshowLocation, legacy = false,
): Promise<CloudRoadshowSingState> =>
  callSync<CloudRoadshowSingState>({ action: 'roadshowSings:adjust', ...credentials, songId, delta, ...(location ? { location } : {}), ...(legacy ? { legacy: true } : {}) });

export const clearCloudRoadshowSingCounts = (credentials: Credentials, location?: RoadshowLocation): Promise<CloudRoadshowSingState> =>
  callSync<CloudRoadshowSingState>({ action: 'roadshowSings:clear', ...credentials, ...(location ? { location } : {}) });

export const migrateLegacyCloudRoadshowSingCounts = async (credentials: Credentials): Promise<{ roadshowSingCounts: VoteCounts; sungCounts: VoteCounts; migrated: boolean }> => {
  const result = await callSync<{ roadshowSingCounts: VoteCounts; sungCounts: VoteCounts; migrated: boolean }>({ action: 'roadshowSings:migrateLegacy', ...credentials });
  return { roadshowSingCounts: result.roadshowSingCounts, sungCounts: result.sungCounts, migrated: result.migrated };
};

export const clearCloudVotes = async (credentials: Credentials, kind: 'pending' | 'sung'): Promise<CloudVoteState> => {
  const result = await callSync<CloudVoteState>({ action: kind === 'pending' ? 'votes:clearPending' : 'votes:clearSung', ...credentials });
  return { counts: result.counts, sungCounts: result.sungCounts, requesterNames: result.requesterNames ?? {} };
};

export const pullCloudFeaturedSongIds = async (): Promise<string[] | null> => (
  await callSync<{ songIds: string[] | null }>({ action: 'featuredSongs:pull' })
).songIds;

export const pullArtistTags = async (artist: string): Promise<string[]> => (
  await callSync<{ tags: string[] }>({ action: 'artistTags:pull', artist })
).tags;

export interface TagDirectoryEntry { kind: 'artist' | 'song'; id: string; title?: string; tags: string[]; }
export const pullTagDirectory = async (): Promise<TagDirectoryEntry[]> => (
  await callSync<{ entries: TagDirectoryEntry[] }>({ action: 'tags:list' })
).entries;

export const pullSongTags = async (songId: string): Promise<string[]> => (
  await callSync<{ tags: string[] }>({ action: 'songTags:pull', songId })
).tags;
export const saveSongTags = async (credentials: Credentials, songId: string, tags: string[]): Promise<string[]> => (
  await callSync<{ tags: string[] }>({ action: 'songTags:save', ...credentials, songId, tags })
).tags;

export const saveArtistTags = async (credentials: Credentials, artist: string, tags: string[]): Promise<string[]> => (
  await callSync<{ tags: string[] }>({ action: 'artistTags:save', ...credentials, artist, tags })
).tags;

export const saveCloudFeaturedSongIds = async (credentials: Credentials, songIds: string[]): Promise<string[]> => (
  await callSync<{ songIds: string[] }>({ action: 'featuredSongs:set', ...credentials, songIds })
).songIds;

export const pullCloudQuizAssignments = async (): Promise<QuizAssignments | null> => (
  await callSync<{ assignments: QuizAssignments | null }>({ action: 'quizLibrary:pull' })
).assignments;

export const pullSongGroups = async (): Promise<SongGroupsSnapshot> => (
  await callSync<{ snapshot: SongGroupsSnapshot }>({ action: 'songGroups:pull' })
).snapshot;

export const saveSongGroups = async (credentials: Credentials, snapshot: SongGroupsSnapshot): Promise<SongGroupsSnapshot> => (
  await callSync<{ snapshot: SongGroupsSnapshot }>({ action: 'songGroups:save', ...credentials, expectedRevision: snapshot.revision, groups: snapshot.groups })
).snapshot;

export const saveCloudQuizAssignments = async (
  credentials: Credentials,
  assignments: QuizAssignments,
): Promise<QuizAssignments> => (
  await callSync<{ assignments: QuizAssignments }>({ action: 'quizLibrary:set', ...credentials, assignments })
).assignments;

export const registerRoadshowWorkspace = async (credentials: Credentials, invitationCode = ''): Promise<RoadshowRecord[]> => (
  await callSync<{ records: RoadshowRecord[] }>({ action: 'roadshows:register', ...credentials, invitationCode })
).records;

export const createAccountInvitation = (credentials: Credentials, boundAlias: string) =>
  callSync<{ code: string; expiresAt: string }>({ action: 'invitations:create', ...credentials, boundAlias });
export const revokeAccountInvitation = (credentials: Credentials, invitationCode: string) =>
  callSync({ action: 'invitations:revoke', ...credentials, invitationCode });

export const pullRoadshows = async (credentials: Credentials): Promise<RoadshowRecord[]> => (
  await callSync<{ records: RoadshowRecord[] }>({ action: 'roadshows:pull', ...credentials })
).records;

export const pullFeelingsNotebook = async (credentials: Credentials): Promise<FeelingsNotebook> => (
  await callSync<{ notebook: FeelingsNotebook }>({ action: 'feelingsNotebook:pull', ...credentials })
).notebook;

export const saveFeelingsNotebook = async (credentials: Credentials, expectedRevision: number, pages: NotebookPage[]): Promise<FeelingsNotebook> => (
  await callSync<{ notebook: FeelingsNotebook }>({ action: 'feelingsNotebook:save', ...credentials, expectedRevision, pages })
).notebook;

export const pullPublicQuizRanking = async (location?: RoadshowLocation): Promise<{
  ranking: PublicQuizRankingItem[];
  participantRanking: PublicQuizParticipantRankingItem[];
}> => {
  const result = await callSync<{
    ranking?: PublicQuizRankingItem[];
    participantRanking?: PublicQuizParticipantRankingItem[];
  }>({ action: 'roadshows:publicQuizRanking', ...(location ? { location } : {}) });
  return {
    ranking: Array.isArray(result.ranking) ? result.ranking : [],
    participantRanking: Array.isArray(result.participantRanking) ? result.participantRanking : [],
  };
};

export const clearCloudQuizRanking = async (credentials: Credentials, location?: RoadshowLocation): Promise<void> => {
  await callSync<Record<string, never>>({ action: 'roadshows:clearQuizRanking', ...credentials, ...(location ? { location } : {}) });
};

export const saveRoadshow = async (credentials: Credentials, record: RoadshowRecord): Promise<RoadshowRecord> => (
  await callSync<{ record: RoadshowRecord }>({ action: 'roadshows:save', ...credentials, record })
).record;

export const deleteRoadshow = async (credentials: Credentials, id: string): Promise<void> => {
  await callSync<Record<string, never>>({ action: 'roadshows:delete', ...credentials, id });
};

export const pullSongRecords = async (credentials: Credentials): Promise<SongRecord[]> => (
  await callSync<{ records: SongRecord[] }>({ action: 'songRecords:pull', ...credentials })
).records;

export const pullPublicPracticeRanking = async (): Promise<PublicPracticeRankingItem[]> => (
  await callSync<{ ranking: PublicPracticeRankingItem[] }>({ action: 'songRecords:publicRanking' })
).ranking;

export const saveSongRecord = async (credentials: Credentials, record: SongRecord): Promise<SongRecord> => (
  await callSync<{ record: SongRecord }>({ action: 'songRecords:save', ...credentials, record })
).record;

export const saveSongRecords = async (credentials: Credentials, records: SongRecord[]): Promise<SongRecord[]> => (
  await callSync<{ records: SongRecord[] }>({ action: 'songRecords:saveBatch', ...credentials, records })
).records;

export const deleteSongRecord = async (credentials: Credentials, id: string): Promise<void> => {
  await callSync<Record<string, never>>({ action: 'songRecords:delete', ...credentials, id });
};

const getScorePageUrls = async (pages: string[]): Promise<string[]> => {
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  const cloudPages = [...new Set(pages.filter(isCloudScorePage))];
  const urlByFileId = new Map<string, string>();
  for (let index = 0; index < cloudPages.length; index += 50) {
    const fileList = cloudPages.slice(index, index + 50);
    const response = await tcbApp.getTempFileURL({ fileList: fileList.map((fileID) => ({ fileID, maxAge: 86400 })) });
    for (const item of response?.fileList ?? []) {
      const fileId = item.fileID ?? item.fileid;
      const url = item.tempFileURL ?? item.download_url;
      if (fileId && url && (!item.code || item.code === 'SUCCESS')) urlByFileId.set(fileId, url);
    }
  }
  return pages.map((page) => urlByFileId.get(page) ?? page);
};

/**
 * 云端签名地址（getTempFileURL）带有效期，页面长时间挂着之后地址会失效，
 * 谱子就变成裂图，只能靠刷新页面重新换取。这里把「重新换链接」的能力暴露出去，
 * 让界面在图片加载失败或长时间停留后自行换新，不需要用户手动刷新。
 */
export const refreshSongScorePageUrls = async (pages: string[]): Promise<string[]> => {
  if (!pages.some(isCloudScorePage)) return pages;
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  await ensureSignIn();
  return getScorePageUrls(pages);
};

/**
 * 兜底读谱：编辑器要用 fetch + canvas 把谱页当像素画到画布上，这一步受同源策略约束，
 * 云存储若没给当前站点开 CORS，浏览器会直接拦掉（表现为 TypeError: Failed to fetch），
 * 而 <img> 因为不受此限制，页面里看着又完全正常。
 * 这里改成让云函数按 fileID 把原图代取回来，以 base64 交回前端，完全绕开浏览器的跨域检查。
 */
export const readScorePageViaProxy = async (credentials: Credentials, fileId: string): Promise<Blob> => {
  if (!isCloudScorePage(fileId)) throw new Error('INVALID_SONG_SCORE');
  const result = await callSync<{ base64: string }>({ action: 'scorePages:read', ...credentials, fileID: fileId });
  const base64 = result.base64;
  if (typeof base64 !== 'string' || !base64) throw new Error('SCORE_DOWNLOAD_FAILED');
  // 交给浏览器原生解码 base64，比手写 atob + 逐字节循环快得多，也不会卡住主线程。
  const response = await fetch(`data:image/jpeg;base64,${base64}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('SCORE_DOWNLOAD_FAILED');
  return blob;
};

const resolveSongScores = async (scores: StoredSongScore[]): Promise<SongScore[]> => {
  const pages = scores.flatMap((score) => score.pages);
  const resolved = await getScorePageUrls(pages);
  let offset = 0;
  return scores.map((score) => {
    const pageUrls = resolved.slice(offset, offset + score.pages.length);
    offset += score.pages.length;
    return withResolvedSongScorePages(score, pageUrls);
  });
};

const deleteSongScoreFiles = async (fileIds: string[], credentials: Credentials): Promise<void> => {
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  if (!globalThis.crypto?.subtle) return;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(credentials.alias.trim().toLocaleLowerCase()));
  const workspaceId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const unique = [...new Set(fileIds.filter((fileId) => isCloudScorePage(fileId) && fileId.includes(`/song-request-scores/${workspaceId}/`)))];
  for (let index = 0; index < unique.length; index += 50) {
    await tcbApp.deleteFile({ fileList: unique.slice(index, index + 50) });
  }
};

export const copyOwnerSongScore = async (credentials: Credentials, songId: string): Promise<SongScore> =>
  (await callSync<{ score: SongScore }>({ action: 'songScores:copyOwner', ...credentials, songId })).score;

export const pullPublicSongScores = async (): Promise<SongScore[]> =>
  parseSongScores((await callSync<{ scores: SongScore[] }>({ action: 'songScores:publicPull' })).scores);

export const pullSongScores = async (credentials: Credentials): Promise<SongScore[]> => {
  const scores = parseSongScores((await callSync<{ scores: SongScore[] }>({ action: 'songScores:pull', ...credentials })).scores);
  // 云端只保存 cloud:// fileID；签名地址本身有有效期，不能沿用上一次换来的旧链接。
  const needsResolve = scores.some((score) => score.pages.some(isCloudScorePage));
  return needsResolve ? resolveSongScores(scores.map(toStoredSongScore)) : scores;
};

export const syncSongScoreToCloud = async (
  credentials: Credentials,
  score: SongScore,
  retiredFileIds: string[] = [],
): Promise<SongScore> => {
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  await ensureSignIn();
  const uploadedFileIds: string[] = [];
  try {
    const pages: string[] = [];
    for (const page of score.pages) {
      if (!page.startsWith('data:image/')) {
        pages.push(page);
        continue;
      }
      const uploaded = await callSync<{ fileId: string }>({
        action: 'songScores:uploadPage', ...credentials, songId: score.songId, pageDataUrl: page,
      });
      if (!uploaded.fileId || !isCloudScorePage(uploaded.fileId)) throw new Error('SCORE_UPLOAD_FAILED');
      uploadedFileIds.push(uploaded.fileId);
      pages.push(uploaded.fileId);
    }
    const uploadedScore: SongScore = { ...score, pages, pendingSync: false };
    const saved = (await callSync<{ score: SongScore }>({
      action: 'songScores:save', ...credentials, score: toStoredSongScore(uploadedScore),
    })).score;
    let synced = parseSongScores([saved])[0];
    if (!synced) throw new Error('INVALID_SONG_SCORE');
    const localOnlyText = {
      ...(score.lyrics?.trim() && !synced.lyrics?.trim() ? { lyrics: score.lyrics } : {}),
      ...(score.scoreNote?.trim() && !synced.scoreNote?.trim() ? { scoreNote: score.scoreNote } : {}),
    };
    if (Object.keys(localOnlyText).length) {
      synced = { ...synced, ...localOnlyText, pendingSync: true };
    }
    if (retiredFileIds.length) void deleteSongScoreFiles(retiredFileIds, credentials).catch(() => undefined);
    return synced;
  } catch (error) {
    if (uploadedFileIds.length) await deleteSongScoreFiles(uploadedFileIds, credentials).catch(() => undefined);
    throw error;
  }
};

export const saveSongScore = syncSongScoreToCloud;

export const deleteSongScore = async (
  credentials: Credentials,
  songId: string,
  fileIds: string[] = [],
): Promise<void> => {
  await callSync<Record<string, never>>({ action: 'songScores:delete', ...credentials, songId });
  if (fileIds.length) await deleteSongScoreFiles(fileIds, credentials).catch(() => undefined);
};

export const mapSongScoreSyncError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'SYNC_FAILED';
  if (code === 'PAYLOAD_TOO_LARGE') return '谱子图片过大，请减少页数或换更小的图片。';
  if (code === 'INVALID_SONG_SCORE') return '谱子内容格式无效，未保存。';
  if (code === 'SCORE_UPLOAD_FAILED') return '谱子图片未能上传到云存储，已保留在本机等待重试。';
  if (code === 'CLOUD_TIMEOUT') return '谱子上传超时，已保留在本机；请保持页面开启后重试。';
  if (code === 'AUTH_FAILED') return '私有空间已锁定，请先重新进入路演档案。';
  if (code === 'CLOUD_UNAVAILABLE') return '腾讯云暂时未连接，谱子尚未同步。';
  return '云端暂时没有回应，谱子尚未同步。';
};

/* ------------------------------------------------------------------ */
/* 录音（上传原文件 + 裁剪区间元数据）                                    */
/* ------------------------------------------------------------------ */

const workspaceHash = async (alias: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('CRYPTO_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(alias.trim().toLocaleLowerCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const RECORDING_AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

/** 每片 3MB 原始数据，base64 后约 4MB，落在云函数 4.7MB 请求上限内。 */
const RECORDING_CHUNK_BYTES = 3 * 1024 * 1024;

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('RECORDING_READ_FAILED'));
  reader.onload = () => {
    const result = String(reader.result || '');
    const comma = result.indexOf(',');
    resolve(comma >= 0 ? result.slice(comma + 1) : '');
  };
  reader.readAsDataURL(blob);
});

/**
 * 云函数分片上传（与谱子同一套「云函数写存储」思路）。
 * 大音频切成 3MB 片段逐片交给云函数，服务端合并成一个文件——
 * 既绕开请求体上限，也不依赖云存储桶对客户端开放写权限。
 */
const uploadRecordingViaChunks = async (
  credentials: Credentials,
  songId: string,
  file: File,
  extension: string,
  onProgress?: (percent: number) => void,
): Promise<{ fileID: string; cloudPath: string }> => {
  const uploadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const total = Math.max(1, Math.ceil(file.size / RECORDING_CHUNK_BYTES));
  const partFileIDs: string[] = [];
  for (let index = 0; index < total; index += 1) {
    const chunk = file.slice(index * RECORDING_CHUNK_BYTES, Math.min(file.size, (index + 1) * RECORDING_CHUNK_BYTES));
    const base64 = await blobToBase64(chunk);
    const uploaded = await callSync<{ fileID: string }>({
      action: 'recordings:uploadChunk',
      ...credentials,
      songId,
      uploadId,
      index,
      chunkBase64: `data:application/octet-stream;base64,${base64}`,
    });
    if (!uploaded.fileID) throw new Error('RECORDING_UPLOAD_FAILED');
    partFileIDs.push(uploaded.fileID);
    onProgress?.(Math.round(((index + 1) / total) * 90));
  }
  // 合并这一步要下载全部分片再整体上传，大文件容易顶到云函数超时；
  // 分片已经在云存储里了，重试只是重新合并，不会重复上传整首。
  const finish = async () => callSync<{ fileID: string }>({
    action: 'recordings:finishUpload', ...credentials, songId, uploadId, partFileIDs, ext: extension,
  });
  let finished: { fileID: string } | null = null;
  for (let attempt = 0; attempt < 3 && !finished; attempt += 1) {
    try {
      finished = await finish();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const retryable = code === 'CLOUD_TIMEOUT' || code === 'SYNC_FAILED';
      if (!retryable || attempt === 2) throw error;
      onProgress?.(90);
      await new Promise<void>((resolve) => { setTimeout(resolve, 800 * (attempt + 1)); });
    }
  }
  if (!finished?.fileID) throw new Error('RECORDING_UPLOAD_FAILED');
  onProgress?.(100);
  return { fileID: finished.fileID, cloudPath: '' };
};

/**
 * 上传录音：优先客户端直传（单请求最快），失败自动回退到云函数分片。
 * 云存储为 PRIVATE，客户端直传在没有写权限时会 403，分片路径是可靠兜底。
 */
export const uploadSongRecordingFile = async (
  credentials: Credentials,
  songId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ fileID: string; cloudPath: string }> => {
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  await ensureSignIn();
  const workspaceId = await workspaceHash(credentials.alias);
  const songHash = await workspaceHash(songId);
  const extension = RECORDING_AUDIO_EXTENSIONS[file.type] || 'bin';
  const cloudPath = `song-request-recordings/${workspaceId}/${songHash}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  try {
    const uploaded = await tcbApp.uploadFile({
      cloudPath,
      file,
      onUploadProgress: (event: { loaded?: number; total?: number }) => {
        if (!onProgress || !event?.total) return;
        onProgress(Math.max(0, Math.min(90, Math.round((event.loaded ?? 0) / event.total * 90))));
      },
    });
    const fileID = uploaded?.fileID ?? uploaded?.fileId;
    if (fileID) {
      onProgress?.(100);
      return { fileID, cloudPath };
    }
  } catch {
    // 存储桶不允许客户端写入，走云函数分片。
  }

  return uploadRecordingViaChunks(credentials, songId, file, extension, onProgress);
};

export const resolveSongRecordingUrl = async (fileID: string): Promise<string> => {
  if (!fileID) return '';
  if (!fileID.startsWith('cloud://')) return fileID;
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  await ensureSignIn();
  const response = await tcbApp.getTempFileURL({ fileList: [{ fileID, maxAge: 86400 }] });
  const item = response?.fileList?.[0];
  const url = item?.tempFileURL ?? item?.download_url;
  if (!url) throw new Error('RECORDING_URL_FAILED');
  return url;
};

/** 代理读音频的每片大小：base64 后约 4MB，落在云函数响应上限内。 */
const RECORDING_READ_CHUNK_BYTES = 3 * 1024 * 1024;

const base64ToBlob = async (base64: string, type: string): Promise<Blob> => {
  const response = await fetch(`data:${type || 'application/octet-stream'};base64,${base64}`);
  return response.blob();
};

/**
 * 云函数分段代取录音（对应谱子的「代理读图」）。
 * 换到另一台设备后本机没有原始音频，直接 fetch 签名地址又可能被跨域策略拦住，
 * 这里让云函数按区间切片返回，前端拼回完整文件——裁剪、导出因此在任何设备都能用。
 */
export const readSongRecordingBlob = async (
  credentials: Credentials,
  fileID: string,
  mimeType = 'audio/mpeg',
): Promise<Blob> => {
  const parts: Blob[] = [];
  let offset = 0;
  let totalBytes = Number.POSITIVE_INFINITY;
  // 16 片 × 3MB = 48MB，覆盖 40MB 上限，同时兜住异常返回导致的死循环。
  for (let guard = 0; guard < 16 && offset < totalBytes; guard += 1) {
    const result = await callSync<{ base64: string; bytes: number; totalBytes: number }>({
      action: 'recordings:readChunk', ...credentials, fileID, offset, length: RECORDING_READ_CHUNK_BYTES,
    });
    totalBytes = Number.isFinite(result.totalBytes) ? result.totalBytes : 0;
    if (!result.bytes || !result.base64) break;
    parts.push(await base64ToBlob(result.base64, mimeType));
    offset += result.bytes;
  }
  if (!parts.length) throw new Error('RECORDING_DOWNLOAD_FAILED');
  return new Blob(parts, { type: mimeType || 'audio/mpeg' });
};

export const pullCloudSongRecordings = async (credentials: Credentials): Promise<unknown[]> => (
  await callSync<{ recordings: unknown[] }>({ action: 'recordings:pull', ...credentials })
).recordings ?? [];

export const saveCloudSongRecording = async (
  credentials: Credentials,
  recording: unknown,
): Promise<unknown> => (
  await callSync<{ recording: unknown }>({ action: 'recordings:save', ...credentials, recording })
).recording;

export const deleteCloudSongRecording = async (credentials: Credentials, id: string): Promise<void> => {
  await callSync<Record<string, never>>({ action: 'recordings:delete', ...credentials, id });
};

export const deleteSongRecordingFile = async (fileID: string): Promise<void> => {
  if (!tcbApp || !fileID.startsWith('cloud://')) return;
  await ensureSignIn();
  await tcbApp.deleteFile({ fileList: [fileID] }).catch(() => undefined);
};

export const mapSongRecordingError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'SYNC_FAILED';
  if (code === 'PAYLOAD_TOO_LARGE') return '录音文件过大，请换更小的文件或先压缩。';
  if (code === 'RECORDING_UPLOAD_FAILED') return '录音未能传到云存储，已保存在本机，可点「重试同步」。';
  if (code === 'RECORDING_TOO_LARGE') return '录音超过 40MB 上限，请先压缩或剪短。';
  if (code === 'RECORDING_LOCAL_MISSING') return '本机找不到这段录音的原始文件（可能被浏览器清理），请重新上传。';
  if (code === 'RECORDING_DOWNLOAD_FAILED') return '这段录音没能从云端取回来，请检查网络后重试。';
  if (code === 'CLOUD_UNAVAILABLE') return '腾讯云暂时未连接，录音只保存在本机。';
  if (code === 'CLOUD_TIMEOUT') return '上传超时，录音已保存在本机，可点「重试同步」。';
  if (code === 'AUTH_FAILED') return '账号验证失败，请重新进入点歌台。';
  if (/INVALID_ACTION|INVALID_RECORDING/i.test(code)) return '云端尚未部署录音功能，录音暂时只保存在本机。';
  return '云端暂时没有回应，录音已保存在本机。';
};

export const pullArtistSettings = async (credentials?: Credentials | null, seed?: ArtistSettingsPayload): Promise<ArtistSettingsSnapshot | null> => (
  await callSync<{ snapshot: ArtistSettingsSnapshot | null }>(credentials && seed ? { action: 'artistSettings:privatePull', ...credentials, seed } : { action: 'artistSettings:pull' })
).snapshot;

export const pushArtistSettings = async (
  credentials: Credentials,
  expectedRevision: number | null,
  snapshot: ArtistSettingsPayload,
): Promise<ArtistSettingsSnapshot> => (
  await callSync<{ snapshot: ArtistSettingsSnapshot }>({
    action: 'artistSettings:push', ...credentials, expectedRevision, snapshot,
  })
).snapshot;

export const mapArtistSettingsSyncError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'SYNC_FAILED';
  if (code === 'CONFLICT') return '云端歌手设置已有更新，本地修改已保留。';
  if (code === 'AUTH_FAILED') return '当前私有空间不能修改全站歌手设置。';
  if (code === 'PAYLOAD_TOO_LARGE') return '头像数据过大，请换用更小的图片。';
  if (code === 'INVALID_ARTIST_SETTINGS') return '歌手设置格式无效，未上传云端。';
  return '全站歌手设置暂未同步，本地修改已保留。';
};

export const mapRoadshowSyncError = (error: unknown) => {
  if (error instanceof Error && error.message === 'INVALID_INVITATION') return '邀请码无效、已使用、已撤销、已过期或与账号不匹配，请向站主申请。';
  const code = error instanceof Error ? error.message : 'SYNC_FAILED';
  if (code === 'ALREADY_REGISTERED') return '这个别称已经设置过管理口令，请直接进入。';
  if (code === 'NOT_REGISTERED') return '这个别称还没有路演档案，请先首次启用。';
  if (code === 'AUTH_FAILED') return '管理口令不正确。';
  if (code === 'CLOUD_UNAVAILABLE') return '腾讯云同步尚未配置，暂时无法进入私有路演档案。';
  return '云端暂时没有回应，请稍后重试。';
};

export const mapSongRecordSyncError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'SYNC_FAILED';
  if (code === 'NOT_FOUND') return '这条记录已在其他设备删除，请刷新后再试。';
  if (code === 'AUTH_FAILED') return '私有空间已锁定，请先重新进入路演档案。';
  if (code === 'CLOUD_UNAVAILABLE') return '腾讯云暂时未连接，当前内容尚未同步。';
  return '云端暂时没有回应，当前内容尚未同步。';
};
