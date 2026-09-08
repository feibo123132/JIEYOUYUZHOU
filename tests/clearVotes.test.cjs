const assert = require('node:assert/strict');
const test = require('node:test');
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js');
const sync = require('../cloudfunctions/songRequestSync/index.js');
const owner = { alias: '2421415030@qq.com', password: 'test-secret' };

function database(failWrite = false) {
  let data = {
    song_request_workspaces: { owner: { alias: owner.alias, roadshows: [{ id: 'keep' }], sungVoteCounts: { song: 3 }, sungVoteCountsByLocation: { nanhu: { song: 3 } } } },
    song_request_votes: { song: { count: 2, locationCounts: { nanhu: 1, medicalWuming: 1 } }, newer: { count: 1 } },
  };
  return {
    get data() { return data; },
    async runTransaction(run) {
      const draft = structuredClone(data);
      const result = await run({ collection: name => ({ doc: id => ({
        get: async () => ({ data: draft[name][id] ? { _id: id, ...draft[name][id] } : null }),
        set: async value => { if (failWrite) throw new Error('WRITE_FAILED'); draft[name][id] = value; },
      }) }) });
      data = draft;
      return result;
    },
  };
}

test('清空接口必须提供管理口令', () => {
  for (const action of ['votes:clearPending', 'votes:clearSung']) {
    assert.deepEqual(validateRequest({ action, ...owner }), { action, ...owner });
    assert.throws(() => validateRequest({ action }), /INVALID_ALIAS/);
  }
});

test('清空已点持久清零总榜和地点计数，保留已唱及清除快照后的新歌', async () => {
  const db = database();
  const archive = structuredClone(db.data.song_request_workspaces.owner);
  await sync.clearVoteStateAtomically(db, 'owner', 'pending', ['song']);
  assert.equal(db.data.song_request_votes.song.count, 0);
  assert.deepEqual(db.data.song_request_votes.song.locationCounts, {});
  assert.deepEqual(db.data.song_request_workspaces.owner, archive);
  assert.equal(db.data.song_request_votes.newer.count, 1);
  await sync.clearVoteStateAtomically(db, 'owner', 'pending', ['song']);
  assert.equal(db.data.song_request_votes.song.count, 0);
});

test('清空已唱持久清零总榜和地点历史，保留待唱及其他私人记录', async () => {
  const db = database();
  const pending = structuredClone(db.data.song_request_votes);
  await sync.clearVoteStateAtomically(db, 'owner', 'sung', []);
  assert.deepEqual(db.data.song_request_workspaces.owner.sungVoteCounts, {});
  assert.deepEqual(db.data.song_request_workspaces.owner.sungVoteCountsByLocation, {});
  assert.deepEqual(db.data.song_request_workspaces.owner.roadshows, [{ id: 'keep' }]);
  assert.equal('_id' in db.data.song_request_workspaces.owner, false);
  assert.deepEqual(db.data.song_request_votes, pending);
});

test('云端清除失败不改变原数据', async () => {
  const db = database(true);
  const original = structuredClone(db.data);
  await assert.rejects(sync.clearVoteStateAtomically(db, 'owner', 'pending', ['song']), /WRITE_FAILED/);
  assert.deepEqual(db.data, original);
});

test('清除后再次点歌从一开始，事务内读取避免旧计数写回', async () => {
  const db = database();
  await sync.clearVoteStateAtomically(db, 'owner', 'pending', ['song']);
  assert.equal(await sync.incrementVoteAtomically(db, 'song', '南湖'), 1);
  assert.deepEqual(db.data.song_request_votes.song.locationCounts, { nanhu: 1 });
  assert.equal(await sync.incrementVoteAtomically(db, 'brand-new', null), 1);
});

test('仅站主可清空两种榜单，失败不得伪报成功', async () => {
  const workspaces = new Map();
  const calls = [];
  const handler = sync.createHandler({
    getWorkspace: async id => workspaces.get(id),
    setWorkspace: async (id, value) => workspaces.set(id, value),
    now: () => '2026-09-07T00:00:00.000Z',
    clearVotesAtomically: async (id, kind) => { calls.push(kind); return { counts: {}, sungCounts: {} }; },
  });
  const visitor = { alias: 'visitor', password: 'test-secret' };
  await handler({ action: 'roadshows:register', ...owner });
  await handler({ action: 'roadshows:register', ...visitor });
  for (const action of ['votes:clearPending', 'votes:clearSung']) {
    assert.deepEqual(await handler({ action, ...visitor }), { ok: false, error: 'AUTH_FAILED' });
    assert.deepEqual(await handler({ action, ...owner, password: 'wrong-password' }), { ok: false, error: 'AUTH_FAILED' });
    assert.deepEqual(await handler({ action, ...owner }), { ok: true, counts: {}, sungCounts: {} });
  }
  assert.deepEqual(calls, ['pending', 'sung']);
});
