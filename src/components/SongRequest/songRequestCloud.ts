import { ensureSignIn, tcbApp } from '../../services/tcb';
import type { VoteCounts } from './songRequest';
import type { PublicQuizParticipantRankingItem, PublicQuizRankingItem, RoadshowLocation, RoadshowRecord } from './roadshow';
import type { PublicPracticeRankingItem, SongRecord } from './songRecords';
import type { SongScore } from './songScores';
import type { ArtistSettingsPayload, ArtistSettingsSnapshot } from './artistSettings';
import type { QuizAssignments } from './songQuizLibrary';

export interface Credentials {
  alias: string;
  password: string;
}

export interface CloudVoteState {
  counts: VoteCounts;
  sungCounts: VoteCounts;
}

type CloudResult<T> = { ok: true } & T;

const callSync = async <T>(data: Record<string, unknown>): Promise<CloudResult<T>> => {
  if (!tcbApp) throw new Error('CLOUD_UNAVAILABLE');
  await ensureSignIn();
  const response = await tcbApp.callFunction({ name: 'songRequestSync', data });
  const result = response?.result as ({ ok?: boolean; error?: string } & T) | undefined;
  if (!result?.ok) throw new Error(result?.error || 'SYNC_FAILED');
  return result as CloudResult<T>;
};

export const pullCloudVoteState = async (location?: RoadshowLocation): Promise<CloudVoteState> => {
  const result = await callSync<{ counts: VoteCounts; sungCounts?: VoteCounts }>({ action: 'votes:pull', ...(location ? { location } : {}) });
  return { counts: result.counts, sungCounts: result.sungCounts ?? {} };
};

export const pullCloudVotes = async (location?: RoadshowLocation): Promise<VoteCounts> => (await pullCloudVoteState(location)).counts;

export const incrementCloudVote = async (songId: string): Promise<number> => (
  await callSync<{ count: number }>({ action: 'votes:increment', songId })
).count;

export const finishCloudVotes = async (credentials: Credentials): Promise<CloudVoteState> => {
  const result = await callSync<CloudVoteState>({ action: 'votes:finishAll', ...credentials });
  return { counts: result.counts, sungCounts: result.sungCounts };
};

export const pullCloudFeaturedSongIds = async (): Promise<string[] | null> => (
  await callSync<{ songIds: string[] | null }>({ action: 'featuredSongs:pull' })
).songIds;

export const saveCloudFeaturedSongIds = async (credentials: Credentials, songIds: string[]): Promise<string[]> => (
  await callSync<{ songIds: string[] }>({ action: 'featuredSongs:set', ...credentials, songIds })
).songIds;

export const pullCloudQuizAssignments = async (): Promise<QuizAssignments | null> => (
  await callSync<{ assignments: QuizAssignments | null }>({ action: 'quizLibrary:pull' })
).assignments;

export const saveCloudQuizAssignments = async (
  credentials: Credentials,
  assignments: QuizAssignments,
): Promise<QuizAssignments> => (
  await callSync<{ assignments: QuizAssignments }>({ action: 'quizLibrary:set', ...credentials, assignments })
).assignments;

export const registerRoadshowWorkspace = async (credentials: Credentials): Promise<RoadshowRecord[]> => (
  await callSync<{ records: RoadshowRecord[] }>({ action: 'roadshows:register', ...credentials })
).records;

export const pullRoadshows = async (credentials: Credentials): Promise<RoadshowRecord[]> => (
  await callSync<{ records: RoadshowRecord[] }>({ action: 'roadshows:pull', ...credentials })
).records;

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

export const pullSongScores = async (credentials: Credentials): Promise<SongScore[]> => (
  await callSync<{ scores: SongScore[] }>({ action: 'songScores:pull', ...credentials })
).scores;

export const saveSongScore = async (credentials: Credentials, score: SongScore): Promise<SongScore> => (
  await callSync<{ score: SongScore }>({ action: 'songScores:save', ...credentials, score })
).score;

export const deleteSongScore = async (credentials: Credentials, songId: string): Promise<void> => {
  await callSync<Record<string, never>>({ action: 'songScores:delete', ...credentials, songId });
};

export const mapSongScoreSyncError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'SYNC_FAILED';
  if (code === 'PAYLOAD_TOO_LARGE') return '谱子图片过大，请减少页数或换更小的图片。';
  if (code === 'INVALID_SONG_SCORE') return '谱子内容格式无效，未保存。';
  if (code === 'AUTH_FAILED') return '私有空间已锁定，请先重新进入路演档案。';
  if (code === 'CLOUD_UNAVAILABLE') return '腾讯云暂时未连接，谱子尚未同步。';
  return '云端暂时没有回应，谱子尚未同步。';
};

export const pullArtistSettings = async (): Promise<ArtistSettingsSnapshot | null> => (
  await callSync<{ snapshot: ArtistSettingsSnapshot | null }>({ action: 'artistSettings:pull' })
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
