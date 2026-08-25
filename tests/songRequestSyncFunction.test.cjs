const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const functionPath = path.join(__dirname, '..', 'cloudfunctions', 'songRequestSync', 'index.js');
const validationPath = path.join(__dirname, '..', 'cloudfunctions', 'songRequestSync', 'validation.js');
const cloudbaseConfigPath = path.join(__dirname, '..', 'cloudbaserc.json');

test('CloudBase deployment config points directly at the small function directory', () => {
  const config = JSON.parse(readFileSync(cloudbaseConfigPath, 'utf8'));
  assert.equal(config.functionRoot, 'cloudfunctions');
  assert.deepEqual(config.functions, [{
    name: 'songRequestSync',
    dir: 'cloudfunctions/songRequestSync',
    runtime: 'Nodejs20.19',
    handler: 'index.main',
    installDependency: true,
  }]);
});

function loadFunction() {
  assert.ok(existsSync(functionPath), 'songRequestSync cloud function must exist');
  return require(functionPath);
}

function memoryStore() {
  const workspaces = new Map();
  const votes = new Map();
  return {
    workspaces,
    votes,
    getWorkspace: async (id) => workspaces.get(id) ?? null,
    setWorkspace: async (id, value) => { workspaces.set(id, structuredClone(value)); },
    getVotes: async () => Object.fromEntries(votes),
    incrementVote: async (songId) => {
      const count = (votes.get(songId) ?? 0) + 1;
      votes.set(songId, count);
      return count;
    },
    now: () => '2026-08-25T12:00:00.000Z',
  };
}

test('validates public and private actions without rejecting platform metadata', () => {
  assert.ok(existsSync(validationPath), 'songRequestSync validation must exist');
  const { validateRequest } = require(validationPath);

  assert.deepEqual(validateRequest({ action: 'votes:increment', songId: 'qing-tian', userInfo: { uid: 'u1' } }), {
    action: 'votes:increment', songId: 'qing-tian',
  });
  assert.throws(() => validateRequest({ action: 'roadshows:register', alias: '', password: '123456' }), /INVALID_ALIAS/);
  assert.throws(() => validateRequest({ action: 'roadshows:register', alias: 'JIEYOU', password: '123' }), /INVALID_PASSWORD/);
})

test('increments and pulls public song request votes', async () => {
  const { createHandler } = loadFunction();
  const handler = createHandler(memoryStore());

  assert.deepEqual(await handler({ action: 'votes:increment', songId: 'qing-tian' }), { ok: true, count: 1 });
  assert.deepEqual(await handler({ action: 'votes:increment', songId: 'qing-tian' }), { ok: true, count: 2 });
  assert.deepEqual(await handler({ action: 'votes:pull' }), { ok: true, counts: { 'qing-tian': 2 } });
})

test('protects private roadshows with an alias and password', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);

  assert.deepEqual(await handler({ action: 'roadshows:register', alias: 'JIEYOU', password: 'guitar-2026' }), { ok: true, records: [] });
  assert.deepEqual(await handler({ action: 'roadshows:pull', alias: 'JIEYOU', password: 'wrong-password' }), { ok: false, error: 'AUTH_FAILED' });
  assert.deepEqual(await handler({ action: 'roadshows:pull', alias: 'JIEYOU', password: 'guitar-2026' }), { ok: true, records: [] });

  const workspace = [...store.workspaces.values()][0];
  assert.notEqual(workspace.passwordHash, 'guitar-2026');
  assert.ok(workspace.passwordSalt);
})

test('saves roadshows and keeps soft-deleted records out of pulls', async () => {
  const store = memoryStore();
  const { createHandler } = loadFunction();
  const handler = createHandler(store);
  const auth = { alias: 'JIEYOU', password: 'guitar-2026' };
  const record = {
    id: 'roadshow-1', title: '第一次路演', date: '2026-08-25', updatedAt: '2026-08-25T11:00:00.000Z',
    performanceSongs: [{ id: 'catalog:qing-tian', catalogId: 'qing-tian', title: '晴天', artist: '周杰伦', source: 'catalog' }],
    recognitionSongs: [{ id: 'manual:test', title: '测试歌曲', artist: '', source: 'manual' }],
  };

  await handler({ action: 'roadshows:register', ...auth });
  assert.deepEqual(await handler({ action: 'roadshows:save', ...auth, record }), { ok: true, record: { ...record, updatedAt: '2026-08-25T12:00:00.000Z' } });
  assert.equal((await handler({ action: 'roadshows:pull', ...auth })).records.length, 1);
  assert.deepEqual(await handler({ action: 'roadshows:delete', ...auth, id: 'roadshow-1' }), { ok: true });
  assert.deepEqual(await handler({ action: 'roadshows:pull', ...auth }), { ok: true, records: [] });

  const workspace = [...store.workspaces.values()][0];
  assert.equal(workspace.roadshows[0].deletedAt, '2026-08-25T12:00:00.000Z');
})
