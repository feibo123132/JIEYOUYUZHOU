import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SONGS } from '../src/components/SongRequest/songCatalog.ts';
import { shouldOpenListeningGame, isGameRoomId, gameErrorMessage, listeningGameConfirmationKey, localAnswerDeadline, answerSecondsLeft } from '../src/components/SongRequest/listeningGame.ts';

test('固定网址对游客直接打开答题页，管理员默认仍进入点歌台', () => {
  assert.equal(shouldOpenListeningGame(false, ''), true);
  assert.equal(shouldOpenListeningGame(true, ''), false);
  assert.equal(shouldOpenListeningGame(false, '?from=poster'), true);
  assert.equal(shouldOpenListeningGame(true, '?game=' + 'a'.repeat(32)), true);
});

test('旧房间链接仍只接受有效的房间编号', () => {
  const roomId = 'a'.repeat(32);
  assert.equal(isGameRoomId(roomId), true);
  for (const value of [null, '', '../test', 'x'.repeat(32)]) assert.equal(isGameRoomId(value), false);
});

test('确认提示在同场游戏每四轮共用一次记录', () => {
  const firstGroup = listeningGameConfirmationKey('room-a', 1);
  assert.equal(listeningGameConfirmationKey('room-a', 4), firstGroup);
  assert.notEqual(listeningGameConfirmationKey('room-a', 5), firstGroup);
  assert.equal(listeningGameConfirmationKey('room-a', 8), listeningGameConfirmationKey('room-a', 5));
  assert.notEqual(listeningGameConfirmationKey('room-b', 1), firstGroup);
});

test('云函数默认曲目与前端默认歌库一致，避免备用曲库漂移', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../cloudfunctions/songRequestSync/quizCatalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(snapshot, SONGS.map(({ id, title, artist }) => ({ id, title, artist })));
});

test('旧版云服务、禁止提交和换题都有可操作的提示', () => {
  assert.match(gameErrorMessage(new Error('INVALID_ACTION')), /部署新版/);
  assert.match(gameErrorMessage(new Error('SUBMISSIONS_CLOSED')), /未开放.*时间已结束/);
  assert.match(gameErrorMessage(new Error('STALE_GAME_ROUND')), /新一轮/);
});

test('中途扫码按云端剩余时间计算倒计时，客户端时钟偏差不影响结束时间', () => {
  const room = { id: 'room', roundId: 'round', revision: 1, roundNumber: 1, phase: 'open' as const,
    options: [], submission: null, submissionCount: 0, submissionDeadlineMs: 1_030_000, serverNowMs: 1_012_000 };
  const deadline = localAnswerDeadline(room, 500, 700);
  assert.equal(deadline, 18_600);
  assert.equal(answerSecondsLeft(deadline!, 700), 18);
  assert.equal(answerSecondsLeft(deadline!, 18_599), 1);
  assert.equal(answerSecondsLeft(deadline!, 18_600), 0);
  assert.equal(localAnswerDeadline({ ...room, phase: 'listening' }, 500, 700), null);
});
