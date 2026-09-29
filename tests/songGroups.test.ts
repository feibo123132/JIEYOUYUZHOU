import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, scryptSync } from 'node:crypto';
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

const medley = {
  id: 'chorus', name: '高潮串烧', chordProgression: '4536251', notes: '第二首接副歌',
  songIds: ['b', 'a'], lyrics: '《第二首》\n第一段\n\n《第一首》\n第二段',
};

test('串烧链保存独立顺序、和弦、衔接说明和完整换行歌词，支持同组多条链', () => {
  const groups = [{ ...group, medleys: [medley, { ...medley, id: 'alternate', songIds: ['a', 'b'], lyrics: '' }] }];
  assert.deepEqual(validateRequest({ ...request, groups }).groups, groups);
  assert.deepEqual(validateRequest({ ...request, groups: [{ ...group, medleys: [] }] }).groups, [{ ...group, medleys: [] }]);
});

test('串烧链拒绝组外歌曲、重复成员、单首链、重复链、错误类型和超限内容', () => {
  const invalid = [null, {}, { ...medley, id: '' }, { ...medley, name: '' },
    { ...medley, songIds: ['a'] }, { ...medley, songIds: ['a', 'a'] },
    { ...medley, songIds: ['a', 'outside'] }, { ...medley, lyrics: 42 },
    { ...medley, lyrics: 'x'.repeat(12001) }, { ...medley, chordProgression: 'x'.repeat(81) },
    { ...medley, notes: 'x'.repeat(1001) }];
  for (const item of invalid) assert.throws(() => validateRequest({ ...request, groups: [{ ...group, medleys: [item] }] }), /INVALID_SONG_GROUPS/);
  for (const medleys of [{}, [medley, medley], Array.from({ length: 11 }, (_, i) => ({ ...medley, id: String(i) }))]) {
    assert.throws(() => validateRequest({ ...request, groups: [{ ...group, medleys }] }), /INVALID_SONG_GROUPS/);
  }
});

test('图示和弦歌组只初始化前三首，未串联歌曲仍独立，已编辑或清空的链不会复活', async () => {
  const { initializeSongGroupMedleys } = await import('../src/components/SongRequest/songGroups.ts');
  const songs = ['再见太难', '最长的电影', '修炼爱情', '雀跃'].map((title, i) => ({ id: String(i), title }));
  const original = { ...group, name: '万能和弦套歌曲', songIds: ['3', '2', '1', '0'] };
  const initialized = initializeSongGroupMedleys(original, songs);
  assert.deepEqual(initialized.medleys?.[0].songIds, ['0', '1', '2']);
  assert.equal(initialized.medleys?.[0].chordProgression, '4536251');
  assert.deepEqual(initialized.songIds, original.songIds);
  assert.equal(initializeSongGroupMedleys(initialized, songs), initialized);
  const cleared = { ...original, medleys: [] };
  assert.equal(initializeSongGroupMedleys(cleared, songs), cleared);
  assert.equal(initializeSongGroupMedleys({ ...original, name: '普通歌组' }, songs).medleys, undefined);
  assert.equal(initializeSongGroupMedleys({ ...original, songIds: ['0', '1', '3'] }, songs).medleys, undefined);
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

test('旧页面保存歌组排序保留云端串烧歌词，显式删除链生效，移除链内歌曲不丢失内容', async () => {
  const { saveSongGroupsAtomically } = require('../cloudfunctions/songRequestSync/songGroups.js');
  let stored = { revision: 1, groups: [{ ...group, medleys: [medley] }] };
  const ref = { get: async () => ({ data: stored }), set: async (value: typeof stored) => { stored = structuredClone(value); } };
  const db = { runTransaction: async (run: (transaction: unknown) => Promise<unknown>) => run({ collection: () => ({ doc: () => ref }) }) };
  const reordered = { ...group, songIds: ['b', 'a'] };
  const saved = await saveSongGroupsAtomically(db, 'shared-song-groups', 1, [reordered]);
  assert.deepEqual(saved.groups, [{ ...reordered, medleys: [medley] }]);
  await assert.rejects(saveSongGroupsAtomically(db, 'shared-song-groups', 2, [{ ...group, songIds: ['a'] }]), /INVALID_SONG_GROUPS/);
  assert.equal(stored.revision, 2);
  assert.equal(stored.groups[0].medleys[0].lyrics, medley.lyrics);
  assert.deepEqual((await saveSongGroupsAtomically(db, 'shared-song-groups', 2, [{ ...group, medleys: [] }])).groups[0].medleys, []);
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
  // 已有管理员账号通过登录使用，注册流程不再允许创建管理员或无邀请注册。
  for (const credentials of [owner, other]) workspaces.set(createHash('sha256').update(credentials.alias).digest('hex'), {
    passwordSalt: 'salt', passwordHash: scryptSync(credentials.password, 'salt', 32).toString('hex'), roadshows: [],
  });
  assert.deepEqual((await handler({ action: 'songGroups:pull' })).snapshot, { revision: 0, groups: [] });
  assert.equal((await handler({ ...request, ...other })).error, 'AUTH_FAILED');
  assert.equal((await handler({ ...request, ...owner, password: 'bad-secret' })).error, 'AUTH_FAILED');
  assert.equal(writes, 0);
  assert.equal((await handler({ ...request, ...owner })).ok, true);
  assert.deepEqual((await handler({ action: 'songGroups:pull', roadshowId: 'first' })).snapshot.groups, [group]);
  assert.deepEqual((await handler({ action: 'songGroups:pull', roadshowId: 'second' })).snapshot.groups, [group]);
  const groups = [{ ...group, medleys: [medley] }];
  assert.equal((await handler({ ...request, ...owner, expectedRevision: 1, groups })).ok, true);
  assert.deepEqual((await handler({ action: 'songGroups:pull' })).snapshot.groups, groups);
});
