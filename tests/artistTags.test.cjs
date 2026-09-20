const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler } = require('../cloudfunctions/songRequestSync');

function setup() {
  const records = new Map();
  const owner = { alias: '2421415030@qq.com', password: 'test-password' };
  const user = { alias: 'reader', password: 'test-password' };
  for (const credentials of [owner, user]) {
    records.set(crypto.createHash('sha256').update(credentials.alias).digest('hex'), {
      alias: credentials.alias, passwordSalt: 'salt',
      passwordHash: crypto.scryptSync(credentials.password, 'salt', 32).toString('hex'),
    });
  }
  const handler = createHandler({
    getWorkspace: async (id) => records.get(id),
    getTagEntries: async () => [...records.values()].filter((entry) => Array.isArray(entry.tags)),
    getArtistSettings: async () => ({ catalog: { songs: [{ id: 'song-1', title: '慢冷' }] } }),
    setWorkspace: async (id, value) => records.set(id, structuredClone(value)),
    now: () => new Date().toISOString(),
  });
  return { handler, owner, user };
}

test('tag directory: public categorized list excludes empty tags and private account fields', async () => {
  const { handler, owner } = setup();
  await handler({ action: 'artistTags:save', ...owner, artist: '李荣浩', tags: ['创作'] });
  await handler({ action: 'artistTags:save', ...owner, artist: '空标签', tags: [] });
  await handler({ action: 'songTags:save', ...owner, songId: 'song-1', tags: ['抒情'] });
  assert.deepEqual(await handler({ action: 'tags:list' }), { ok: true, entries: [
    { kind: 'artist', id: '李荣浩', tags: ['创作'] },
    { kind: 'song', id: 'song-1', title: '慢冷', tags: ['抒情'] },
  ] });
});

test('song tags: save, edit, delete and keep song and artist tags separate', async () => {
  const { handler, owner } = setup();
  const save = (tags) => handler({ action: 'songTags:save', ...owner, songId: 'song-1', tags });
  assert.deepEqual(await save(['抒情', '吉他']), { ok: true, tags: ['抒情', '吉他'] });
  assert.deepEqual(await save(['慢板', '吉他']), { ok: true, tags: ['慢板', '吉他'] });
  assert.deepEqual(await handler({ action: 'songTags:pull', songId: 'song-1' }), { ok: true, tags: ['慢板', '吉他'] });
  assert.deepEqual(await handler({ action: 'songTags:pull', songId: 'song-2' }), { ok: true, tags: [] });
  assert.deepEqual(await handler({ action: 'artistTags:pull', artist: 'song-1' }), { ok: true, tags: [] });
  assert.deepEqual(await save([]), { ok: true, tags: [] });
});

test('song tags: reject unauthorized writes and invalid tags without losing saved data', async () => {
  const { handler, owner, user } = setup();
  const request = { action: 'songTags:save', songId: 'song-1', tags: ['原标签'] };
  await handler({ ...request, ...owner });
  for (const credentials of [user, {}, { ...owner, password: 'incorrect' }]) {
    assert.equal((await handler({ ...request, ...credentials, tags: ['覆盖'] })).ok, false);
  }
  for (const tags of [[''], ['x'.repeat(41)], [12], Array(31).fill('标签')]) {
    assert.equal((await handler({ ...request, ...owner, tags })).ok, false);
  }
  assert.deepEqual(await handler({ action: 'songTags:pull', songId: 'song-1' }), { ok: true, tags: ['原标签'] });
});

test('artist tags: owner saves multiple tags, visitors read, artists stay separate', async () => {
  const { handler, owner } = setup();
  assert.deepEqual(await handler({ action: 'artistTags:pull', artist: '李荣浩' }), { ok: true, tags: [] });
  assert.deepEqual(await handler({ action: 'artistTags:save', ...owner, artist: '李荣浩', tags: [' 创作歌手 ', '吉他', '吉他'] }), { ok: true, tags: ['创作歌手', '吉他'] });
  assert.deepEqual(await handler({ action: 'artistTags:pull', artist: '李荣浩' }), { ok: true, tags: ['创作歌手', '吉他'] });
  assert.deepEqual(await handler({ action: 'artistTags:pull', artist: '周杰伦' }), { ok: true, tags: [] });
  assert.deepEqual(await handler({ action: 'artistTags:save', ...owner, artist: '李荣浩', tags: [] }), { ok: true, tags: [] });
});

test('artist tags: ordinary users, visitors and wrong owner passwords cannot write', async () => {
  const { handler, owner, user } = setup();
  for (const credentials of [user, {}, { ...owner, password: 'incorrect' }]) {
    assert.equal((await handler({ action: 'artistTags:save', ...credentials, artist: '李荣浩', tags: ['禁止写入'] })).ok, false);
  }
  assert.deepEqual(await handler({ action: 'artistTags:pull', artist: '李荣浩' }), { ok: true, tags: [] });
});

test('artist tags: invalid payloads cannot overwrite existing tags', async () => {
  const { handler, owner } = setup();
  const request = { action: 'artistTags:save', ...owner, artist: '李荣浩' };
  await handler({ ...request, tags: ['歌手'] });
  for (const tags of [[''], ['x'.repeat(41)], [12], Array(31).fill('标签'), '标签']) {
    assert.equal((await handler({ ...request, tags })).ok, false);
  }
  assert.deepEqual(await handler({ action: 'artistTags:pull', artist: '李荣浩' }), { ok: true, tags: ['歌手'] });
});
