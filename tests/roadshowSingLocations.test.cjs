const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const sync = require('../cloudfunctions/songRequestSync');
const owner = { alias: '2421415030@qq.com', password: 'test-secret' };
const member = { alias: 'member', password: 'test-secret' };
const hash = alias => crypto.createHash('sha256').update(alias).digest('hex');

function setup() {
  let accounts = new Map([owner, member].map(auth => [hash(auth.alias), {
    passwordSalt: 'salt', passwordHash: crypto.scryptSync(auth.password, 'salt', 32).toString('hex'),
    roadshows: [{ id: 'latest', date: '2026-09-29', location: '南湖' }],
    sungVoteCounts: { 'qing-tian': 7 }, sungVoteCountsByLocation: { nanhu: { 'qing-tian': 7 } },
  }]));
  const db = { runTransaction: async callback => {
    const draft = structuredClone(accounts);
    const result = await callback({ collection: () => ({ doc: id => ({
      get: async () => ({ data: draft.has(id) ? [draft.get(id)] : [] }),
      set: async value => { draft.set(id, structuredClone(value)); },
    }) }) });
    accounts = draft;
    return result;
  } };
  const call = sync.createHandler({
    getWorkspace: async id => structuredClone(accounts.get(id)),
    adjustRoadshowSingCountAtomically: (...args) => sync.adjustRoadshowSingCountAtomically(db, ...args),
    clearRoadshowSingCountsAtomically: (...args) => sync.clearRoadshowSingCountsAtomically(db, ...args),
    migrateLegacyRoadshowSingCountsAtomically: (...args) => sync.migrateLegacyRoadshowSingCountsAtomically(db, ...args),
    now: () => '2026-09-29T08:00:00.000Z',
  });
  return { call, account: () => accounts.get(hash(owner.alias)) };
}

test('路演演唱按实际路演地点累计，总榜等于地点合计，撤回不扣其他地点', async () => {
  const { call } = setup();
  const adjust = (delta, location) => call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta, location });
  assert.equal((await adjust(1, '医大（武鸣）')).ok, true);
  await adjust(1, '医大（本部）');
  await adjust(1, undefined);
  await adjust(-1, '医大（武鸣）');
  await adjust(-1, '医大（武鸣）');
  const result = await call({ action: 'roadshowSings:pull', ...owner });
  assert.equal(result.roadshowSingCounts['qing-tian'], 2);
  assert.deepEqual(result.roadshowSingCountsByLocation, {
    '医大（武鸣）': {}, '医大（本部）': { 'qing-tian': 1 }, '南湖': { 'qing-tian': 1 },
  });
});

test('清空路演演唱的总榜和全部地点，不删除路演档案、不清空点歌已唱，刷新和迁移不恢复旧次数', async () => {
  const { call, account } = setup();
  await call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta: 1, location: '南湖' });
  assert.equal((await call({ action: 'roadshowSings:clear', ...owner })).ok, true);
  const pulled = await call({ action: 'roadshowSings:pull', ...owner });
  assert.deepEqual(pulled.roadshowSingCounts, {});
  assert.ok(Object.values(pulled.roadshowSingCountsByLocation).every(counts => !Object.keys(counts).length));
  assert.ok(pulled.roadshowSingCountsClearedAt);
  assert.equal(account().roadshows.length, 1);
  assert.equal(account().sungVoteCounts['qing-tian'], 7);
  const migrated = await call({ action: 'roadshowSings:migrateLegacy', ...owner });
  assert.equal(migrated.migrated, false);
  assert.deepEqual(migrated.roadshowSingCounts, {});
  assert.equal(migrated.sungCounts['qing-tian'], 7);
  await call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta: 1, legacy: true });
  assert.deepEqual((await call({ action: 'roadshowSings:pull', ...owner })).roadshowSingCounts, {});
  await call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta: 1, location: '南湖' });
  assert.equal((await call({ action: 'roadshowSings:pull', ...owner })).roadshowSingCounts['qing-tian'], 1);
});

test('清空单个路演地点只扣除该地点次数，其他地点和点歌统计保持原值', async () => {
  const { call, account } = setup();
  for (const location of ['医大（武鸣）', '医大（本部）', '南湖']) {
    await call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta: 1, location });
  }
  await call({ action: 'roadshowSings:clear', ...owner, location: '医大（本部）' });
  const result = await call({ action: 'roadshowSings:pull', ...owner });
  assert.equal(result.roadshowSingCounts['qing-tian'], 2);
  assert.deepEqual(result.roadshowSingCountsByLocation['医大（本部）'], {});
  assert.equal(result.roadshowSingCountsByLocation['南湖']['qing-tian'], 1);
  assert.equal(account().sungVoteCounts['qing-tian'], 7);
});

test('游客、普通用户、错误站主口令和无效地点不能清空或改写路演统计', async () => {
  const { call, account } = setup();
  for (const auth of [{}, member, { ...owner, password: 'wrong-secret' }]) {
    assert.equal((await call({ action: 'roadshowSings:clear', ...auth })).ok, false);
    assert.equal((await call({ action: 'roadshowSings:adjust', ...auth, songId: 'qing-tian', delta: 1, location: '南湖' })).ok, false);
  }
  assert.equal((await call({ action: 'roadshowSings:clear', ...owner, location: '未知地点' })).error, 'INVALID_LOCATION');
  assert.equal((await call({ action: 'roadshowSings:adjust', ...owner, songId: 'qing-tian', delta: 1, location: '未知地点' })).error, 'INVALID_LOCATION');
  assert.equal(account().roadshowSingCounts, undefined);
});
