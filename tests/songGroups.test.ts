import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js');
const group = { id: 'if', name: '如果系列', description: '同名主题', songIds: ['a', 'b'] };
const request = { action: 'songGroups:save', alias: 'test', password: '123456', expectedRevision: 0, groups: [group] };

test('共享歌组保留名称、说明及歌曲顺序，不依赖路演编号', () => {
  assert.deepEqual(validateRequest(request).groups, [group]);
  assert.deepEqual(validateRequest({ action: 'songGroups:pull' }), { action: 'songGroups:pull' });
  assert.deepEqual(validateRequest({ ...request, groups: [] }).groups, []);
});
test('共享歌组拒绝无凭据写入、无效版本、重复及超限数据', () => {
  for (const override of [{ password: '' }, { expectedRevision: -1 }, { groups: [group, group] },
    { groups: [{ ...group, name: '' }] }, { groups: [{ ...group, songIds: ['a', 'a'] }] },
    { groups: [{ ...group, songIds: [] }] }, { groups: [{ ...group, description: 'x'.repeat(1001) }] }]) {
    assert.throws(() => validateRequest({ ...request, ...override }));
  }
});

test('共享保存拒绝过期覆盖，删除后不复活，数据库错误不当作空数据', async () => {
  const { saveSongGroupsAtomically } = require('../cloudfunctions/songRequestSync/songGroups.js');
  let stored: { revision: number; groups: typeof group[] } | null = null;
  let failed = false;
  const ref = {
    get: async () => { if (failed) throw new Error('permission denied'); return { data: stored }; },
    set: async (value: NonNullable<typeof stored>) => { stored = structuredClone(value); },
  };
  const transaction = { collection: (name: string) => { assert.equal(name, 'song_request_workspaces'); return { doc: (id: string) => { assert.equal(id, 'shared-song-groups'); return ref; } }; } };
  const db = { runTransaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction) };
  assert.equal((await saveSongGroupsAtomically(db, 'shared-song-groups', 0, [group])).revision, 1);
  await assert.rejects(saveSongGroupsAtomically(db, 'shared-song-groups', 0, []), /CONFLICT/);
  assert.deepEqual((await ref.get()).data?.groups, [group]);
  assert.deepEqual((await saveSongGroupsAtomically(db, 'shared-song-groups', 1, [])).groups, []);
  await assert.rejects(saveSongGroupsAtomically(db, 'shared-song-groups', 1, [group]), /CONFLICT/);
  failed = true;
  await assert.rejects(saveSongGroupsAtomically(db, 'shared-song-groups', 2, [group]), /permission denied/);
});

test('所有路演共用独立歌组，只有歌库管理员可以修改', async () => {
  const { createHandler } = require('../cloudfunctions/songRequestSync/index.js');
  const workspaces = new Map<string, unknown>();
  let writes = 0;
  const handler = createHandler({
    getWorkspace: async (id: string) => workspaces.get(id),
    setWorkspace: async (id: string, value: unknown) => workspaces.set(id, value),
    saveSongGroupsAtomically: async (id: string, revision: number, groups: typeof group[]) => {
      writes++;
      const snapshot = { revision: revision + 1, groups };
      workspaces.set(id, snapshot);
      return snapshot;
    },
    now: () => '2026-09-09T00:00:00.000Z',
  });
  const owner = { alias: '2421415030@qq.com', password: 'test-secret' };
  const other = { alias: 'other', password: 'test-secret' };
  await handler({ action: 'roadshows:register', ...owner });
  await handler({ action: 'roadshows:register', ...other });
  assert.deepEqual((await handler({ action: 'songGroups:pull' })).snapshot, { revision: 0, groups: [] });
  assert.equal((await handler({ ...request, ...other })).error, 'AUTH_FAILED');
  assert.equal((await handler({ ...request, ...owner, password: 'bad-secret' })).error, 'AUTH_FAILED');
  assert.equal(writes, 0);
  assert.equal((await handler({ ...request, ...owner })).ok, true);
  assert.deepEqual((await handler({ action: 'songGroups:pull', roadshowId: 'first' })).snapshot.groups, [group]);
  assert.deepEqual((await handler({ action: 'songGroups:pull', roadshowId: 'second' })).snapshot.groups, [group]);
});
