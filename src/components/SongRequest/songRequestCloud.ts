import { ensureSignIn, tcbApp } from '../../services/tcb';
import type { VoteCounts } from './songRequest';
import type { RoadshowRecord } from './roadshow';

interface Credentials {
  alias: string;
  password: string;
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

export const pullCloudVotes = async (): Promise<VoteCounts> => (
  await callSync<{ counts: VoteCounts }>({ action: 'votes:pull' })
).counts;

export const incrementCloudVote = async (songId: string): Promise<number> => (
  await callSync<{ count: number }>({ action: 'votes:increment', songId })
).count;

export const registerRoadshowWorkspace = async (credentials: Credentials): Promise<RoadshowRecord[]> => (
  await callSync<{ records: RoadshowRecord[] }>({ action: 'roadshows:register', ...credentials })
).records;

export const pullRoadshows = async (credentials: Credentials): Promise<RoadshowRecord[]> => (
  await callSync<{ records: RoadshowRecord[] }>({ action: 'roadshows:pull', ...credentials })
).records;

export const saveRoadshow = async (credentials: Credentials, record: RoadshowRecord): Promise<RoadshowRecord> => (
  await callSync<{ record: RoadshowRecord }>({ action: 'roadshows:save', ...credentials, record })
).record;

export const deleteRoadshow = async (credentials: Credentials, id: string): Promise<void> => {
  await callSync<Record<string, never>>({ action: 'roadshows:delete', ...credentials, id });
};

export const mapRoadshowSyncError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'SYNC_FAILED';
  if (code === 'ALREADY_REGISTERED') return '这个别称已经设置过管理口令，请直接进入。';
  if (code === 'NOT_REGISTERED') return '这个别称还没有路演档案，请先首次启用。';
  if (code === 'AUTH_FAILED') return '管理口令不正确。';
  if (code === 'CLOUD_UNAVAILABLE') return '腾讯云同步尚未配置，暂时无法进入私有路演档案。';
  return '云端暂时没有回应，请稍后重试。';
};
