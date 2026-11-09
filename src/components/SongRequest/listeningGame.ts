export interface ListeningGameOption { id: string; title: string; artist: string; }
export interface ListeningGameRoom {
  id: string;
  roundId: string | null;
  roundNumber: number;
  revision: number;
  phase: 'waiting' | 'listening' | 'open' | 'revealed' | 'ended';
  options: ListeningGameOption[];
  submissionDeadlineMs?: number | null;
  serverNowMs?: number;
  answerSongId?: string | null;
  counts?: Record<string, number>;
  submissionCount: number;
  submission: { songId: string; submittedAt: string; correct: boolean } | null;
}

export function localAnswerDeadline(room: ListeningGameRoom | null, requestedAt: number, receivedAt: number): number | null {
  if (room?.phase !== 'open' || room.submissionDeadlineMs == null || room.serverNowMs == null) return null;
  return (requestedAt + receivedAt) / 2 + room.submissionDeadlineMs - room.serverNowMs;
}

export const answerSecondsLeft = (deadline: number, now: number): number =>
  Math.min(30, Math.max(0, Math.ceil((deadline - now) / 1000)));

export const listeningGameConfirmationKey = (roomId: string, roundNumber: number): string =>
  `jieyou-game-confirm:${roomId}:${Math.floor((roundNumber - 1) / 4)}`;

export const shouldOpenListeningGame = (manager: boolean, search: string): boolean => !manager || new URLSearchParams(search).has('game');
export const isGameRoomId = (value: string | null): value is string => Boolean(value && /^[a-f0-9]{32}$/.test(value));
export const gameErrorMessage = (error: unknown): string => {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    GAME_NOT_FOUND: '这场游戏不存在，请返回网站首页加入当前游戏。',
    INVALID_GAME: '游戏链接无效，请返回网站首页加入当前游戏。',
    STALE_GAME_ROUND: '管理员已切换题目，请在新一轮中重新选择。',
    INVALID_GAME_PHASE: '游戏状态已变化，已为你刷新当前进度。',
    INVALID_QUIZ_SONG: '这首歌不在当前听歌识曲题库中，请刷新后重选。',
    INSUFFICIENT_QUIZ_SONGS: '听歌识曲题库至少需要 16 首歌曲才能开始。',
    SUBMISSIONS_CLOSED: '答题权限未开放，或本轮答题时间已结束。',
    AUTH_FAILED: '账号验证失败，请重新登录管理员账号。',
    NOT_REGISTERED: '账号验证失败，请重新登录管理员账号。',
    INVALID_ACTION: '游戏服务尚未更新，请先部署新版 songRequestSync 云函数。',
    CLOUD_UNAVAILABLE: '暂时无法连接游戏服务，请检查网络后重试。',
    CLOUD_TIMEOUT: '网络响应超时，请重试；重复请求不会重复计入答案。',
  };
  return messages[code] ?? '游戏同步失败，请检查网络后重试。';
};
