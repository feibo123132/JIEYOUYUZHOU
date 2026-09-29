const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const sync = require('../cloudfunctions/songRequestSync/index.js');
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js');

const owner = { alias: '2421415030@qq.com', password: 'test-secret' };
const ownerId = crypto.createHash('sha256').update(owner.alias).digest('hex');
const resetId = `quiz-ranking-reset-${ownerId}`;
const clearedAt = '2026-09-29T02:00:00.000Z';
const attempt = (id, answeredAt, participantName = '小安') => ({ id, catalogId: id, title: id, artist: '歌手', correct: true, participantName, answeredAt });
const roadshows = () => [
  { id: 'nanhu', location: '南湖', recognitionAttempts: [attempt('old-nanhu', '2026-09-28T02:00:00.000Z')], performanceSongs: [{ title: '演唱歌曲' }] },
  { id: 'medical', location: '医大（武鸣）', recognitionAttempts: [attempt('old-medical', '2026-09-28T03:00:00.000Z')], recognitionSongs: [{ title: '识曲歌曲' }] },
];

function database(failWrite = false) {
  let data = { [ownerId]: { alias: owner.alias, roadshows: roadshows(), sungVoteCounts: { song: 5 } } };
  return {
    get data() { return data; },
    async runTransaction(run) {
      const draft = structuredClone(data);
      const result = await run({ collection: name => {
        assert.equal(name, 'song_request_workspaces');
        return { doc: id => ({
          get: async () => ({ data: draft[id] ? { _id: id, ...draft[id] } : null }),
          set: async value => { if (failWrite) throw new Error('WRITE_FAILED'); draft[id] = value; },
        }) };
      } });
      data = draft;
      return result;
    },
  };
}

async function seedAccount(workspaces, credentials) {
  const id = crypto.createHash('sha256').update(credentials.alias).digest('hex');
  const salt = 'test-salt';
  workspaces.set(id, { alias: credentials.alias, passwordSalt: salt, passwordHash: crypto.scryptSync(credentials.password, salt, 32).toString('hex') });
}

test('清空猜歌榜要求账号口令并校验地点', () => {
  assert.deepEqual(validateRequest({ action: 'roadshows:clearQuizRanking', ...owner, location: '南湖' }), { action: 'roadshows:clearQuizRanking', ...owner, location: '南湖' });
  assert.throws(() => validateRequest({ action: 'roadshows:clearQuizRanking' }), /INVALID_ALIAS/);
  assert.throws(() => validateRequest({ action: 'roadshows:clearQuizRanking', ...owner, location: '不存在' }), /INVALID_LOCATION/);
});

test('总榜清空后所有地点的歌曲和用户榜为空，原路演及其他统计保留', async () => {
  const db = database();
  const original = structuredClone(db.data[ownerId]);
  const reset = await sync.clearQuizRankingAtomically(db, ownerId, undefined, clearedAt);
  const filtered = sync.filterQuizRankingRoadshows(roadshows(), reset);
  assert.deepEqual(sync.buildPublicQuizRanking(filtered), []);
  assert.deepEqual(sync.buildPublicQuizParticipantRanking(filtered), []);
  assert.deepEqual(db.data[ownerId], original);
  assert.equal(db.data[resetId].clearedAt, clearedAt);
  assert.equal('_id' in db.data[resetId], false);
});

test('地点清空只影响对应地点，总榜中保留其他地点的答题', async () => {
  const db = database();
  const reset = await sync.clearQuizRankingAtomically(db, ownerId, '南湖', clearedAt);
  const ranking = sync.buildPublicQuizRanking(sync.filterQuizRankingRoadshows(roadshows(), reset));
  assert.deepEqual(ranking.map(entry => entry.songId), ['old-medical']);
  assert.equal(sync.buildPublicQuizParticipantRanking(sync.filterQuizRankingRoadshows(roadshows(), reset))[0].answerCount, 1);
});

test('清空后新答题从一开始，旧记录重新保存也不会回到榜单', async () => {
  const db = database();
  const reset = await sync.clearQuizRankingAtomically(db, ownerId, undefined, clearedAt);
  const saved = roadshows();
  saved[0].updatedAt = '2026-09-29T03:00:00.000Z';
  saved[0].recognitionAttempts.push(attempt('new-answer', '2026-09-29T03:00:00.000Z'));
  const filtered = sync.filterQuizRankingRoadshows(saved, reset);
  assert.deepEqual(sync.buildPublicQuizRanking(filtered).map(entry => [entry.songId, entry.answerCount]), [['new-answer', 1]]);
  assert.equal(sync.buildPublicQuizParticipantRanking(filtered)[0].score, 1);
  assert.equal(saved[0].recognitionAttempts.length, 2);
});

test('清空边界及没有有效作答时间的旧记录不重新计入', () => {
  const records = [{ location: '南湖', recognitionAttempts: [attempt('equal', clearedAt), attempt('legacy', undefined), attempt('invalid', 'invalid'), attempt('after', '2026-09-29T02:00:00.001Z')] }];
  const filtered = sync.filterQuizRankingRoadshows(records, { clearedAt });
  assert.deepEqual(filtered[0].recognitionAttempts.map(entry => entry.id), ['after']);
  assert.equal(sync.buildPublicQuizRanking(sync.filterQuizRankingRoadshows(records, null)).length, 4);
});

test('多地点重复清空保留其他地点标记，较早的并发请求不能覆盖较新的清空时间', async () => {
  const db = database();
  const later = '2026-09-29T04:00:00.000Z';
  await sync.clearQuizRankingAtomically(db, ownerId, '南湖', later);
  await sync.clearQuizRankingAtomically(db, ownerId, '医大（武鸣）', clearedAt);
  await sync.clearQuizRankingAtomically(db, ownerId, '南湖', clearedAt);
  await sync.clearQuizRankingAtomically(db, ownerId, undefined, later);
  const reset = await sync.clearQuizRankingAtomically(db, ownerId, undefined, clearedAt);
  assert.equal(reset.clearedAt, later);
  assert.equal(reset.clearedAtByLocation['南湖'], later);
  assert.equal(reset.clearedAtByLocation['医大（武鸣）'], clearedAt);
});

test('云端写入失败保留原榜单及所有数据', async () => {
  const db = database(true);
  const original = structuredClone(db.data);
  await assert.rejects(sync.clearQuizRankingAtomically(db, ownerId, undefined, clearedAt), /WRITE_FAILED/);
  assert.deepEqual(db.data, original);
});

test('仅站主可清空，普通账号、错误口令和未注册账号不会写入', async () => {
  const workspaces = new Map();
  const calls = [];
  await seedAccount(workspaces, owner);
  const visitor = { alias: 'visitor', password: 'test-secret' };
  await seedAccount(workspaces, visitor);
  const handler = sync.createHandler({
    getWorkspace: async id => workspaces.get(id),
    getAllRoadshows: async () => roadshows(),
    now: () => clearedAt,
    clearQuizRankingAtomically: async (id, location, timestamp) => { calls.push({ id, location, timestamp }); },
  });
  const action = 'roadshows:clearQuizRanking';
  assert.deepEqual(await handler({ action, ...visitor }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action, ...owner, password: 'wrong-password' }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action, alias: 'unknown', password: 'test-secret' }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(calls, []);
  assert.deepEqual(await handler({ action, ...owner, location: '南湖' }), { ok: true });
  assert.deepEqual(calls, [{ id: ownerId, location: '南湖', timestamp: clearedAt }]);
});

test('清空接口不伪报写入失败为成功', async () => {
  const workspaces = new Map();
  await seedAccount(workspaces, owner);
  const handler = sync.createHandler({ getWorkspace: async id => workspaces.get(id), now: () => clearedAt, clearQuizRankingAtomically: async () => { throw new Error('WRITE_FAILED'); } });
  assert.deepEqual(await handler({ action: 'roadshows:clearQuizRanking', ...owner }), { ok: false, error: 'SYNC_FAILED' });
});

test('公开总榜和地点榜均读取持久清空标记，不暴露标记或私人路演', async () => {
  const handler = sync.createHandler({
    getWorkspace: async id => id === resetId ? { clearedAtByLocation: { 南湖: clearedAt } } : null,
    getAllRoadshows: async () => roadshows(),
  });
  assert.deepEqual(await handler({ action: 'roadshows:publicQuizRanking', location: '南湖' }), { ok: true, ranking: [], participantRanking: [] });
  const total = await handler({ action: 'roadshows:publicQuizRanking' });
  assert.equal(total.ranking.length, 1);
  assert.equal(total.ranking[0].songId, 'old-medical');
  assert.equal(total.participantRanking[0].answerCount, 1);
  assert.deepEqual(Object.keys(total).sort(), ['ok', 'participantRanking', 'ranking']);
});
