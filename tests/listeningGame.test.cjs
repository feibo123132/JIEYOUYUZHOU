const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { createHandler } = require('../cloudfunctions/songRequestSync');
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation');
const game = require('../cloudfunctions/songRequestSync/listeningGame');

const owner = { alias: '2421415030@qq.com', password: 'test-secret' };
const idFor = alias => crypto.createHash('sha256').update(alias).digest('hex');
const songs = Array.from({ length: 24 }, (_, i) => ({ id: `song-${i}`, title: `歌曲${i}`, artist: '歌手' }));
function setup() {
  let documents = {};
  let caller = 'guest-1';
  let failWrites = false;
  let queue = Promise.resolve();
  const db = { runTransaction(run) {
    const result = queue.then(async () => {
      const draft = structuredClone(documents);
      const result = await run({ collection: name => {
        assert.equal(name, 'song_request_workspaces');
        return { doc: id => ({ get: async () => ({ data: draft[id] ? { _id: id, ...draft[id] } : null }), set: async value => { if (failWrites === true || failWrites === id) throw new Error('WRITE_FAILED'); assert.equal('_id' in value, false); draft[id] = value; } }) };
      } });
      documents = draft;
      return result;
    });
    queue = result.catch(() => {});
    return result;
  } };
  const salt = 'test-salt';
  for (const account of [owner, { alias: 'visitor', password: 'test-secret' }]) {
    documents[idFor(account.alias)] = { alias: account.alias, passwordSalt: salt,
      passwordHash: crypto.scryptSync(account.password, salt, 32).toString('hex'),
      quizLibraryAssignments: Object.fromEntries(songs.map(s => [s.id, 'warmup'])) };
  }
  const handler = createHandler({
    getWorkspace: async id => documents[id] ?? null,
    getArtistSettings: async () => ({ catalog: { songs } }),
    getGameCallerId: () => caller,
    mutateListeningGame: (request, uid) => game.mutateListeningGame(db, request, uid, '2026-11-06T12:00:00.000Z'),
    now: () => '2026-11-06T12:00:00.000Z',
  });
  return { handler, db, setCaller: id => { caller = id; }, setFailWrites: value => { failWrites = value; }, get documents() { return documents; } };
}
async function createRound(s) {
  const created = await s.handler({ action: 'listeningGame:create', ...owner });
  assert.equal(created.ok, true);
  const roomId = created.room.id;
  const started = await s.handler({ action: 'listeningGame:start', ...owner, roomId, roundId: null, songId: 'song-0' });
  assert.equal(started.ok, true);
  return started.room;
}
const control = (room, action) => ({ action: `listeningGame:${action}`, ...owner, roomId: room.id, roundId: room.roundId });
const submit = (room, songId = 'song-0') => ({ action: 'listeningGame:submit', roomId: room.id, roundId: room.roundId, songId });

test('每轮包含正确歌曲和题库内15首不重复干扰项，并打乱答案位置', () => {
  const positions = new Set();
  for (let i = 0; i < 50; i++) {
    const options = game.selectGameOptions(songs, 'song-0');
    assert.equal(options.length, 16);
    assert.equal(new Set(options.map(s => s.id)).size, 16);
    assert.ok(options.every(s => songs.some(candidate => candidate.id === s.id)));
    positions.add(options.findIndex(s => s.id === 'song-0'));
  }
  assert.ok(positions.size > 1);
  assert.throws(() => game.selectGameOptions(songs.slice(0, 15), 'song-0'), /INSUFFICIENT_QUIZ_SONGS/);
  assert.throws(() => game.selectGameOptions(songs, 'outside'), /INVALID_QUIZ_SONG/);
});

test('只显示歌名时，同名歌曲不能成为另一项干扰答案', () => {
  const duplicates = [...songs, { id: 'same-title-other-artist', title: '歌曲0', artist: '另一位歌手' }];
  const options = game.selectGameOptions(duplicates, 'same-title-other-artist');
  assert.equal(options.length, 16);
  assert.equal(new Set(options.map(song => song.title)).size, 16);
  assert.equal(options.filter(song => song.title === '歌曲0')[0].id, 'same-title-other-artist');
  assert.throws(() => game.selectGameOptions([...songs.slice(0, 15), duplicates.at(-1)], 'song-0'), /INSUFFICIENT_QUIZ_SONGS/);
});

test('游客请求不接受伪造的用户身份、权限和正确答案，输入长度受限', () => {
  const request = validateRequest({ action: 'listeningGame:submit', roomId: 'a'.repeat(32), roundId: 'b'.repeat(32), songId: 'song-0', uid: 'other', correct: true, phase: 'open' });
  assert.equal(request.uid, undefined);
  assert.equal(request.correct, undefined);
  assert.throws(() => validateRequest({ ...request, roomId: '../room' }), /INVALID_GAME/);
  assert.throws(() => validateRequest({ ...request, songId: 'x'.repeat(101) }), /INVALID_GAME/);
  assert.throws(() => validateRequest({ action: 'listeningGame:create' }), /INVALID_ALIAS/);
});

test('仅指定管理员及正确口令能够创建和控制游戏', async () => {
  const s = setup();
  assert.equal((await s.handler({ action: 'listeningGame:create', alias: 'visitor', password: 'test-secret' })).error, 'AUTH_FAILED');
  assert.equal((await s.handler({ action: 'listeningGame:create', ...owner, password: 'wrong-password' })).error, 'AUTH_FAILED');
  const room = await createRound(s);
  assert.equal((await s.handler({ ...control(room, 'open'), alias: 'visitor' })).error, 'AUTH_FAILED');
});

test('开放前服务端拒绝提交；游客读取不泄露答案、统计或管理员信息', async () => {
  const s = setup(); const room = await createRound(s);
  assert.equal(room.phase, 'listening');
  assert.equal(room.answerSongId, 'song-0');
  assert.equal((await s.handler(submit(room))).error, 'SUBMISSIONS_CLOSED');
  const pulled = await s.handler({ action: 'listeningGame:pull', roomId: room.id });
  assert.equal(pulled.room.answerSongId, undefined);
  assert.equal(pulled.room.counts, undefined);
  assert.equal(pulled.room.options.length, 16);
  assert.equal(JSON.stringify(pulled).includes(owner.alias), false);
  assert.equal(JSON.stringify(pulled).includes('password'), false);
});

test('开放后一次提交，重试幂等且不能改答案；刷新可恢复本人提交', async () => {
  const s = setup(); const room = await createRound(s);
  assert.equal((await s.handler(control(room, 'open'))).ok, true);
  const first = await s.handler(submit(room));
  assert.equal(first.ok, true);
  assert.equal(first.room.submission.songId, 'song-0');
  assert.equal(first.room.submission.correct, true);
  assert.equal(first.room.answerSongId, 'song-0');
  assert.equal(first.room.counts, undefined);
  const retried = await s.handler(submit(room, 'song-1'));
  assert.equal(retried.room.submission.songId, 'song-0');
  assert.equal(retried.room.submission.correct, true);
  const restored = await s.handler({ action: 'listeningGame:pull', roomId: room.id });
  assert.equal(restored.room.submission.songId, 'song-0');
  assert.equal(restored.room.submission.correct, true);
  assert.equal(restored.room.answerSongId, 'song-0');
  assert.equal(restored.room.submissionCount, 1);
  s.setCaller('guest-2');
  const other = await s.handler({ action: 'listeningGame:pull', roomId: room.id });
  assert.equal(other.room.submission, null);
  assert.equal(other.room.answerSongId, undefined);
});

test('无有效云端游客身份、题目之外的歌曲都不能提交', async () => {
  const s = setup(); const room = await createRound(s);
  await s.handler(control(room, 'open'));
  assert.equal((await s.handler(submit(room, 'outside'))).error, 'INVALID_QUIZ_SONG');
  s.setCaller('');
  assert.equal((await s.handler(submit(room))).error, 'AUTH_FAILED');
});

test('暂停提交和结束本轮由管理员控制，未提交游客在结束后查看答案', async () => {
  const s = setup(); const room = await createRound(s);
  await s.handler(control(room, 'open'));
  await s.handler(submit(room));
  await s.handler(control(room, 'lock'));
  s.setCaller('guest-2');
  assert.equal((await s.handler(submit(room))).error, 'SUBMISSIONS_CLOSED');
  await s.handler(control(room, 'reveal'));
  const result = await s.handler({ action: 'listeningGame:pull', roomId: room.id });
  assert.equal(result.room.phase, 'revealed');
  assert.equal(result.room.answerSongId, 'song-0');
  assert.equal(result.room.counts['song-0'], 1);
  assert.equal((await s.handler(control(room, 'open'))).error, 'INVALID_GAME_PHASE');
});

test('同一二维码持续下一轮；旧提交和旧控制请求不能影响新题目', async () => {
  const s = setup(); const room = await createRound(s);
  assert.equal((await s.handler({ ...control(room, 'start'), songId: 'song-1' })).error, 'INVALID_GAME_PHASE');
  await s.handler(control(room, 'reveal'));
  const next = await s.handler({ ...control(room, 'start'), songId: 'song-1' });
  assert.equal(next.room.id, room.id);
  assert.notEqual(next.room.roundId, room.roundId);
  assert.equal(next.room.roundNumber, 2);
  assert.equal(next.room.submissionCount, 0);
  assert.equal((await s.handler(submit(room))).error, 'STALE_GAME_ROUND');
  assert.equal((await s.handler(control(room, 'open'))).error, 'STALE_GAME_ROUND');
});

test('候选歌曲仅来自共享听歌识曲库，少于16首无法开局', async () => {
  const s = setup(); const room = await createRound(s);
  await s.handler(control(room, 'reveal'));
  delete s.documents[idFor(owner.alias)].quizLibraryAssignments['song-0'];
  assert.equal((await s.handler({ ...control(room, 'start'), songId: 'song-0' })).error, 'INVALID_QUIZ_SONG');
  s.documents[idFor(owner.alias)].quizLibraryAssignments = { 'song-0': 'warmup' };
  assert.equal((await s.handler({ ...control(room, 'start'), songId: 'song-0' })).error, 'INSUFFICIENT_QUIZ_SONGS');
});

test('多游客并发提交不丢统计，结束后拒绝新提交', async () => {
  const s = setup(); const room = await createRound(s);
  await s.handler(control(room, 'open'));
  await Promise.all(Array.from({ length: 12 }, (_, i) => game.mutateListeningGame(s.db, submit(room), `guest-${i}`, '2026-11-06T12:01:00.000Z')));
  const state = await s.handler({ action: 'listeningGame:pull', ...owner, roomId: room.id });
  assert.equal(state.room.submissionCount, 12);
  assert.equal(state.room.counts['song-0'], 12);
  await s.handler(control(room, 'end'));
  s.setCaller('another-guest');
  assert.equal((await s.handler(submit(room))).error, 'SUBMISSIONS_CLOSED');
});

test('写入失败不伪报开局或提交成功，原状态和统计保持不变', async () => {
  const s = setup(); const room = await createRound(s);
  s.setFailWrites(true);
  assert.deepEqual(await s.handler(control(room, 'open')), { ok: false, error: 'SYNC_FAILED' });
  s.setFailWrites(false);
  await s.handler(control(room, 'open'));
  const original = structuredClone(s.documents);
  s.setFailWrites(true);
  assert.deepEqual(await s.handler(submit(room)), { ok: false, error: 'SYNC_FAILED' });
  assert.deepEqual(s.documents, original);
});

test('换题后同一游客可再次答题，前一轮的提交不覆盖新答案', async () => {
  const s = setup(); const room = await createRound(s);
  await s.handler(control(room, 'open'));
  await s.handler(submit(room));
  await s.handler(control(room, 'reveal'));
  const next = (await s.handler({ ...control(room, 'start'), songId: 'song-1' })).room;
  const restored = await s.handler({ action: 'listeningGame:pull', roomId: room.id });
  assert.equal(restored.room.submission, null);
  await s.handler(control(next, 'open'));
  assert.equal((await s.handler(submit(next, 'song-1'))).room.submission.songId, 'song-1');
});

test('普通注册账号读取仍为游客视图；伪造字段不能请求管理员视图', async () => {
  const s = setup(); const room = await createRound(s);
  const pulled = await s.handler({ action: 'listeningGame:pull', roomId: room.id, alias: 'visitor', password: 'test-secret', owner: true });
  assert.equal(pulled.ok, true);
  assert.equal(pulled.room.answerSongId, undefined);
  assert.equal(pulled.room.counts, undefined);
  assert.equal(pulled.room.revision, room.revision);
});

test('无效房间和未知动作被拒绝，不创建意外状态', async () => {
  const s = setup();
  assert.deepEqual(await s.handler({ action: 'listeningGame:pull', roomId: 'a'.repeat(32) }), { ok: false, error: 'GAME_NOT_FOUND' });
  assert.equal((await s.handler({ action: 'listeningGame:cheat', ...owner })).error, 'INVALID_ACTION');
  const before = structuredClone(s.documents);
  assert.equal((await s.handler({ action: 'listeningGame:open', ...owner, roomId: 'a'.repeat(32), roundId: 'b'.repeat(32) })).error, 'GAME_NOT_FOUND');
  assert.deepEqual(s.documents, before);
});

test('固定网址可免账号查询当前游戏，没有开场时明确返回空值', async () => {
  const s = setup();
  assert.deepEqual(validateRequest({ action: 'listeningGame:current', owner: true, roomId: 'forged' }), { action: 'listeningGame:current' });
  assert.deepEqual(await s.handler({ action: 'listeningGame:current' }), { ok: true, room: null });
});

test('新设备无需房间编号或本地缓存即可加入管理员创建的游戏', async () => {
  const s = setup(); const room = await createRound(s);
  s.setCaller('new-device');
  const current = await s.handler({ action: 'listeningGame:current' });
  assert.equal(current.ok, true);
  assert.equal(current.room.id, room.id);
  assert.equal(current.room.options.length, 16);
  assert.equal(current.room.answerSongId, undefined);
  assert.equal(current.room.counts, undefined);
  assert.equal(current.room.submission, null);
});

test('管理员通过当前游戏恢复控制台，游客刷新当前网址恢复本人答案', async () => {
  const s = setup(); const room = await createRound(s);
  const managed = await s.handler({ action: 'listeningGame:current', ...owner });
  assert.equal(managed.room.answerSongId, 'song-0');
  await s.handler(control(room, 'open'));
  await s.handler(submit(room));
  const current = await s.handler({ action: 'listeningGame:current' });
  assert.equal(current.room.submission.songId, 'song-0');
  assert.equal(current.room.submission.correct, true);
  assert.equal(current.room.answerSongId, 'song-0');
  s.setCaller('ordinary-device');
  const ordinary = await s.handler({ action: 'listeningGame:current', alias: 'visitor', password: 'test-secret' });
  assert.equal(ordinary.room.answerSongId, undefined);
});

test('固定网址跨轮次和新场次始终跟随当前游戏，旧游戏记录保留', async () => {
  const s = setup(); const room = await createRound(s);
  await s.handler(control(room, 'reveal'));
  const next = (await s.handler({ ...control(room, 'start'), songId: 'song-1' })).room;
  assert.equal((await s.handler({ action: 'listeningGame:current' })).room.roundId, next.roundId);
  await s.handler(control(next, 'end'));
  assert.equal((await s.handler({ action: 'listeningGame:current' })).room.phase, 'ended');
  const newRoom = (await s.handler({ action: 'listeningGame:create', ...owner })).room;
  assert.notEqual(newRoom.id, room.id);
  assert.equal((await s.handler({ action: 'listeningGame:current' })).room.id, newRoom.id);
  assert.equal((await s.handler({ action: 'listeningGame:pull', roomId: room.id })).room.phase, 'ended');
});

test('创建新场次写入失败时固定网址仍指向原游戏', async () => {
  const s = setup(); const room = await createRound(s);
  const before = structuredClone(s.documents);
  s.setFailWrites(true);
  assert.equal((await s.handler({ action: 'listeningGame:create', ...owner })).error, 'SYNC_FAILED');
  assert.deepEqual(s.documents, before);
  assert.equal((await s.handler({ action: 'listeningGame:current' })).room.id, room.id);
});

test('发布当前游戏失败时房间写入一并回滚，不产生孤立新场次', async () => {
  const s = setup(); await createRound(s);
  const before = structuredClone(s.documents);
  s.setFailWrites('listening-game-active');
  assert.equal((await s.handler({ action: 'listeningGame:create', ...owner })).error, 'SYNC_FAILED');
  assert.deepEqual(s.documents, before);
});

test('当前游戏读取失败不会假装没有开场', async () => {
  const handler = createHandler({ getWorkspace: async () => { throw new Error('NETWORK_FAILED'); } });
  assert.deepEqual(await handler({ action: 'listeningGame:current' }), { ok: false, error: 'SYNC_FAILED' });
});

test('答错后立即返回错误结果和正确歌名，不依赖管理员结束本轮', async () => {
  const s = setup(); const room = await createRound(s);
  await s.handler(control(room, 'open'));
  const wrong = room.options.find(song => song.id !== 'song-0');
  const result = await s.handler({ ...submit(room, wrong.id), correct: true, answerSongId: wrong.id });
  assert.equal(result.ok, true);
  assert.equal(result.room.phase, 'open');
  assert.equal(result.room.submission.correct, false);
  assert.equal(result.room.answerSongId, 'song-0');
  const restored = await s.handler({ action: 'listeningGame:current' });
  assert.equal(restored.room.submission.correct, false);
  assert.equal(restored.room.answerSongId, 'song-0');
  const retry = await s.handler(submit(room));
  assert.equal(retry.room.submission.songId, wrong.id);
  assert.equal(retry.room.submission.correct, false);
  assert.equal(retry.room.submissionCount, 1);
  s.setCaller('not-submitted');
  const other = await s.handler({ action: 'listeningGame:current' });
  assert.equal(other.room.answerSongId, undefined);
  assert.equal(other.room.submission, null);
});
