const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const sync = require('../cloudfunctions/songRequestSync');
const owner = { alias: '2421415030@qq.com', password: 'test-secret' };
const member = { alias: 'member', password: 'test-secret' };
const hash = alias => crypto.createHash('sha256').update(alias).digest('hex');

function setup(roadshows = [{ id: 'latest', date: '2026-09-29', location: '南湖' }]) {
  let failWrite = false;
  let data = new Map([owner, member].map(auth => [hash(auth.alias), {
    passwordSalt: 'salt', passwordHash: crypto.scryptSync(auth.password, 'salt', 32).toString('hex'), roadshows,
  }]));
  const db = { runTransaction: async callback => {
    const draft = structuredClone(data);
    const result = await callback({ collection: () => ({ doc: id => ({
      get: async () => ({ data: draft.has(id) ? [draft.get(id)] : [] }),
      set: async value => {
        if (failWrite) { failWrite = false; throw new Error('WRITE_FAILED'); }
        draft.set(id, structuredClone(value));
      },
    }) }) });
    data = draft;
    return result;
  } };
  const call = sync.createHandler({
    getWorkspace: async id => structuredClone(data.get(id)),
    getAllRoadshows: async () => data.get(hash(owner.alias)).roadshows,
    adjustRoadshowSingCountAtomically: (...args) => sync.adjustRoadshowSingCountAtomically(db, ...args),
    recordRoadshowQuizAtomically: (...args) => sync.recordRoadshowQuizAtomically(db, ...args),
    clearQuizRankingAtomically: (...args) => sync.clearQuizRankingAtomically(db, ...args),
    now: () => '2026-09-29T08:00:00.000Z',
  });
  const start = (eventId, songId = 'qing-tian') => call({ action: 'roadshowQuiz:start', ...owner, eventId, songId, title: '晴天', artist: '周杰伦' });
  const judge = (eventId, correct) => call({ action: 'roadshowQuiz:judge', ...owner, eventId, correct });
  return { call, start, judge, data: () => data, failNextWrite: () => { failWrite = true; } };
}

test('详情路演演唱采用云端最新路演地点，并拒绝没有地点的最新路演', async () => {
  const { call } = setup([{ id: 'old', date: '2026-09-20', location: '南湖' }, { id: 'new', date: '2026-09-29', location: '医大（武鸣）' }]);
  const request = { action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta: 1, latest: true, eventId: 'sing-play-1' };
  const result = await call(request);
  assert.equal((await call(request)).roadshowSingCounts['qing-tian'], 1);
  assert.equal(result.location, '医大（武鸣）');
  assert.equal(result.roadshowSingCountsByLocation['医大（武鸣）']['qing-tian'], 1);
  const missing = setup([{ id: 'old', date: '2026-09-20', location: '南湖' }, { id: 'new', date: '2026-09-29' }]);
  assert.equal((await missing.call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta: 1, latest: true })).error, 'NO_LATEST_ROADSHOW');
});

test('猜歌榜兼容旧答题记录与新演唱记录，未判定项可显示且不算作答错', async () => {
  const old = { catalogId: 'qing-tian', title: '晴天', artist: '周杰伦', correct: true };
  const pending = { ...old, id: 'pending', correct: undefined, playedAt: '2026-09-29T08:00:00.000Z' };
  const ranking = sync.buildPublicQuizRanking([{ recognitionAttempts: [old, pending, { ...old, correct: false }] }]);
  assert.equal(ranking[0].playCount, 3);
  assert.equal(ranking[0].answerCount, 2);
  assert.equal(ranking[0].accuracy, 50);
  const { parsePublicQuizRanking } = await import('../src/components/SongRequest/roadshow.ts');
  assert.equal(parsePublicQuizRanking(sync.buildPublicQuizRanking([{ recognitionAttempts: [pending] }])).length, 1);
  assert.equal(parsePublicQuizRanking(ranking).length, 1);
});

test('识曲演唱先记次数，判定和改判只更新正确率，重复请求不重复计数', async () => {
  const { call, start, judge } = setup();
  assert.equal((await start('play-1')).event.location, '南湖');
  await start('play-1');
  let result = await call({ action: 'roadshows:publicQuizRanking', location: '南湖' });
  assert.equal(result.ranking[0].playCount, 1);
  assert.equal(result.ranking[0].answerCount, 0);
  await judge('play-1', true);
  await judge('play-1', true);
  await start('play-2');
  await judge('play-2', false);
  result = await call({ action: 'roadshows:publicQuizRanking' });
  assert.equal(result.ranking[0].playCount, 2);
  assert.equal(result.ranking[0].answerCount, 2);
  assert.equal(result.ranking[0].accuracy, 50);
  await judge('play-2', true);
  assert.equal((await call({ action: 'roadshows:publicQuizRanking' })).ranking[0].accuracy, 100);
  assert.deepEqual(result.participantRanking, []);
  assert.equal((await call({ action: 'roadshowQuiz:pull', ...owner, songId: 'qing-tian' })).event.id, 'play-2');
});

test('识曲记录按演唱当时地点分类，清榜后判定旧记录不会恢复数据', async () => {
  const { call, start, judge, data } = setup();
  await start('play-1');
  data().get(hash(owner.alias)).roadshows.push({ id: 'next', date: '2026-09-30', location: '医大（本部）' });
  await start('play-2');
  await judge('play-1', true);
  await judge('play-2', false);
  assert.equal((await call({ action: 'roadshows:publicQuizRanking', location: '南湖' })).ranking[0].accuracy, 100);
  assert.equal((await call({ action: 'roadshows:publicQuizRanking', location: '医大（本部）' })).ranking[0].accuracy, 0);
  await call({ action: 'roadshows:clearQuizRanking', ...owner, location: '南湖' });
  await judge('play-1', false);
  assert.deepEqual((await call({ action: 'roadshows:publicQuizRanking', location: '南湖' })).ranking, []);
  assert.equal((await call({ action: 'roadshows:publicQuizRanking', location: '医大（本部）' })).ranking[0].playCount, 1);
});

test('游客和普通用户不能记录或判定，缺失路演和无效判定不写数据', async () => {
  const { call, data } = setup();
  for (const auth of [{}, member, { ...owner, password: 'wrong' }]) {
    assert.equal((await call({ action: 'roadshowQuiz:start', ...auth, eventId: 'play-1', songId: 'qing-tian', title: '晴天', artist: '周杰伦' })).ok, false);
    assert.equal((await call({ action: 'roadshowQuiz:judge', ...auth, eventId: 'play-1', correct: true })).ok, false);
  }
  assert.equal((await call({ action: 'roadshowQuiz:judge', ...owner, eventId: 'missing', correct: true })).error, 'NOT_FOUND');
  assert.equal((await call({ action: 'roadshowQuiz:judge', ...owner, eventId: 'play-1', correct: 'yes' })).ok, false);
  assert.equal(data().size, 2);
  assert.equal((await setup([]).start('play-1')).error, 'NO_LATEST_ROADSHOW');
});

test('路演演唱减一次按最新地点扣除，重复请求不多扣、零次数不扣其他地点', async () => {
  const { call, data } = setup();
  const adjust = (eventId, delta) => call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta, latest: true, eventId });
  await adjust('sing-add-1', 1);
  await adjust('sing-add-2', 1);
  await adjust('sing-remove-1', -1);
  assert.equal((await adjust('sing-remove-1', -1)).roadshowSingCounts['qing-tian'], 1);
  await adjust('sing-remove-2', -1);
  data().get(hash(owner.alias)).roadshows.push({ id: 'next', date: '2026-09-30', location: '医大（本部）' });
  await adjust('sing-add-3', 1);
  data().get(hash(owner.alias)).roadshows.push({ id: 'later', date: '2026-10-01', location: '南湖' });
  const zero = await adjust('sing-remove-3', -1);
  assert.equal(zero.roadshowSingCounts['qing-tian'], 1);
  assert.equal(zero.roadshowSingCountsByLocation['医大（本部）']['qing-tian'], 1);
  assert.deepEqual(zero.roadshowSingCountsByLocation['南湖'], {});
});

test('听歌识曲撤回演唱和判定，重复撤回不多扣，已撤回事件不能再判定或重放', async () => {
  const { call, start, judge } = setup();
  const undo = eventId => call({ action: 'roadshowQuiz:undo', ...owner, eventId });
  await start('play-1');
  await judge('play-1', true);
  await start('play-2');
  await judge('play-2', false);
  const result = await undo('play-2');
  assert.equal(result.ok, true);
  assert.equal(result.event.id, 'play-1');
  assert.equal((await undo('play-2')).event.id, 'play-1');
  const ranking = (await call({ action: 'roadshows:publicQuizRanking', location: '南湖' })).ranking[0];
  assert.deepEqual([ranking.playCount, ranking.answerCount, ranking.correctCount, ranking.accuracy], [1, 1, 1, 100]);
  assert.equal((await judge('play-2', true)).error, 'NOT_FOUND');
  assert.equal((await start('play-2')).error, 'NOT_FOUND');
  assert.equal((await undo('play-1')).event, null);
  assert.deepEqual((await call({ action: 'roadshows:publicQuizRanking' })).ranking, []);
  await start('play-3');
  await undo('play-3');
  assert.deepEqual((await call({ action: 'roadshows:publicQuizRanking' })).ranking, []);
});

test('撤回识曲按原演唱地点处理，游客和其他账号不能撤回，清榜前的旧事件不会重新显示', async () => {
  const { call, start, judge, data } = setup();
  await start('play-nanhu');
  await judge('play-nanhu', true);
  await call({ action: 'roadshows:clearQuizRanking', ...owner, location: '南湖' });
  data().get(hash(owner.alias)).roadshows.push({ id: 'next', date: '2026-09-30', location: '医大（本部）' });
  await start('play-medical');
  for (const auth of [{}, member, { ...owner, password: 'wrong' }]) {
    assert.equal((await call({ action: 'roadshowQuiz:undo', ...auth, eventId: 'play-medical' })).ok, false);
  }
  const undone = await call({ action: 'roadshowQuiz:undo', ...owner, eventId: 'play-medical' });
  assert.equal(undone.location, '医大（本部）');
  assert.equal(undone.event, null);
  assert.deepEqual((await call({ action: 'roadshows:publicQuizRanking' })).ranking, []);
  assert.equal((await call({ action: 'roadshowQuiz:undo', ...owner, eventId: 'missing' })).error, 'NOT_FOUND');
});

test('撤回写入失败保留演唱及判定，重试同一事件只撤回一次', async () => {
  const { call, start, judge, failNextWrite } = setup();
  await start('play-1');
  await judge('play-1', true);
  const request = { action: 'roadshowQuiz:undo', ...owner, eventId: 'play-1' };
  failNextWrite();
  assert.equal((await call(request)).error, 'SYNC_FAILED');
  const retained = (await call({ action: 'roadshows:publicQuizRanking' })).ranking[0];
  assert.deepEqual([retained.playCount, retained.answerCount, retained.accuracy], [1, 1, 100]);
  assert.equal((await call(request)).event, null);
  assert.equal((await call(request)).event, null);
  assert.deepEqual((await call({ action: 'roadshows:publicQuizRanking' })).ranking, []);
});

test('详情直接返回总榜和各地点的识曲次数与正确率，操作和刷新均与猜歌榜一致', async () => {
  const { call, start, judge, data } = setup();
  const pending = await start('stats-1');
  assert.deepEqual(pending.stats, { playCount: 1, answerCount: 0, correctCount: 0, accuracy: null });
  const judged = await judge('stats-1', true);
  assert.deepEqual(judged.statsByLocation['南湖'], { playCount: 1, answerCount: 1, correctCount: 1, accuracy: 100 });
  data().get(hash(owner.alias)).roadshows.push({ id: 'next', date: '2026-09-30', location: '医大（本部）' });
  await start('stats-2');
  await judge('stats-2', false);
  let pulled = await call({ action: 'roadshowQuiz:pull', ...owner, songId: 'qing-tian' });
  assert.deepEqual(pulled.stats, { playCount: 2, answerCount: 2, correctCount: 1, accuracy: 50 });
  assert.deepEqual(pulled.statsByLocation['医大（武鸣）'], { playCount: 0, answerCount: 0, correctCount: 0, accuracy: null });
  const undone = await call({ action: 'roadshowQuiz:undo', ...owner, eventId: 'stats-2' });
  assert.deepEqual(undone.stats, { playCount: 1, answerCount: 1, correctCount: 1, accuracy: 100 });
  pulled = await call({ action: 'roadshowQuiz:pull', ...owner, songId: 'qing-tian' });
  assert.deepEqual(pulled.stats, undone.stats);
  await call({ action: 'roadshows:clearQuizRanking', ...owner, location: '南湖' });
  pulled = await call({ action: 'roadshowQuiz:pull', ...owner, songId: 'qing-tian' });
  assert.deepEqual(pulled.stats, { playCount: 0, answerCount: 0, correctCount: 0, accuracy: null });
});

test('详情识曲统计包含旧路演答题，撤回新演唱后保留旧答题且与榜单一致', async () => {
  const { call, start, judge } = setup([{ id: 'latest', date: '2026-09-29', location: '南湖', recognitionAttempts: [
    { id: 'old-1', catalogId: 'qing-tian', title: '晴天', artist: '周杰伦', correct: true },
    { id: 'old-2', catalogId: 'qing-tian', title: '晴天', artist: '周杰伦', correct: false },
    { id: 'other', catalogId: 'other-song', title: '其他歌曲', correct: true },
  ] }]);
  await start('new-play');
  const result = await judge('new-play', true);
  assert.deepEqual(result.stats, { playCount: 3, answerCount: 3, correctCount: 2, accuracy: 66.7 });
  const ranked = (await call({ action: 'roadshows:publicQuizRanking' })).ranking.find(entry => entry.songId === 'qing-tian');
  assert.deepEqual([ranked.playCount, ranked.answerCount, ranked.correctCount, ranked.accuracy], Object.values(result.stats));
  const undone = await call({ action: 'roadshowQuiz:undo', ...owner, eventId: 'new-play' });
  assert.deepEqual(undone.stats, { playCount: 2, answerCount: 2, correctCount: 1, accuracy: 50 });
  assert.equal(undone.event, null);
});
