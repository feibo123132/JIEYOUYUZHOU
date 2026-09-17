const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { createHandler } = require('../cloudfunctions/songRequestSync/index.js');
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const owner = { alias: '2421415030@qq.com', password: 'test-password' };
const user = { alias: 'visitor', password: 'test-password' };
const other = { alias: 'other', password: 'test-password' };
const song = { id: 'qing-tian', title: '晴天', artist: '周杰伦', category: '流行', featured: true };
const seed = { version: 1, artistOrder: [song.artist], songOrder: [song.id], customAvatars: {}, avatarAdjustments: {}, catalog: { version: 9, artists: [song.artist], songs: [song] } };
function setup() {
  const settings = new Map(); const scores = new Map(); const files = new Map();
  const accounts = new Map([owner, user, other].map(auth => [hash(auth.alias), { passwordSalt: 'salt', passwordHash: crypto.scryptSync(auth.password, 'salt', 32).toString('hex'), roadshows: [{ id: 'legacy' }] }]));
  let failCopy = false; let copied = 0;
  const store = {
    getWorkspace: async id => accounts.get(id),
    getArtistSettings: async id => structuredClone(settings.get(id || hash(owner.alias)) || null),
    saveArtistSettingsAtomically: async (id, revision, snapshot) => {
      const current = settings.get(id);
      if ((current?.revision ?? null) !== revision) throw new Error('CONFLICT');
      const saved = { ...structuredClone(snapshot), ownerWorkspaceId: id, revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString() };
      settings.set(id, saved); return structuredClone(saved);
    },
    getSongScores: async id => structuredClone(scores.get(id) || []),
    copySongScorePage: async (id, songId, page) => {
      if (failCopy && copied++) throw new Error('SCORE_UPLOAD_FAILED');
      const destination = id + '/' + crypto.randomUUID(); files.set(destination, files.get(page)); return destination;
    },
    deleteCopiedScoreFiles: async ids => ids.forEach(id => files.delete(id)),
    saveCopiedSongScoreAtomically: async (key, value) => {
      const all = scores.get(value.workspaceId) || [];
      if (all.some(s => s.songId === value.songId && !s.deletedAt && s.pages.length)) throw new Error('SCORE_ALREADY_EXISTS');
      scores.set(value.workspaceId, [...all.filter(s => s.songId !== value.songId), structuredClone(value)]);
    },
    resolveSongScores: async all => all.map(s => ({ ...s, pageUrls: s.pages.map(p => 'https://example.com/' + p) })),
    getSongRecords: async () => [{ id: 'practice', kind: 'practice' }, { id: 'roadshow', kind: 'roadshow' }],
    now: () => new Date().toISOString(),
  };
  return { handler: createHandler(store), settings, scores, files, failCopy: () => { failCopy = true; } };
}
test('个人歌单首次复制站主快照，之后双方修改互不影响，重新登录保留删除', async () => {
  const { handler: call } = setup();
  assert.equal((await call({ action: 'artistSettings:push', ...owner, expectedRevision: null, snapshot: seed })).ok, true);
  const first = await call({ action: 'artistSettings:privatePull', ...user, seed });
  assert.deepEqual(first.snapshot.catalog, seed.catalog);
  const empty = { ...seed, artistOrder: [], songOrder: [], catalog: { version: 9, artists: [], songs: [] } };
  assert.equal((await call({ action: 'artistSettings:push', ...user, expectedRevision: 1, snapshot: empty })).ok, true);
  assert.deepEqual((await call({ action: 'artistSettings:pull' })).snapshot.catalog, seed.catalog);
  const changed = { ...seed, catalog: { ...seed.catalog, songs: [{ ...song, title: '站主修改' }] } };
  assert.equal((await call({ action: 'artistSettings:push', ...owner, expectedRevision: 1, snapshot: changed })).ok, true);
  assert.deepEqual((await call({ action: 'artistSettings:privatePull', ...user, seed })).snapshot.catalog.songs, []);
  assert.equal((await call({ action: 'artistSettings:privatePull', ...other, seed })).snapshot.catalog.songs[0].title, '站主修改');
  assert.equal((await call({ action: 'artistSettings:push', ...user, expectedRevision: 1, snapshot: seed })).error, 'CONFLICT');
  assert.equal((await call({ action: 'artistSettings:privatePull', ...user, password: 'wrong-secret', seed })).error, 'AUTH_FAILED');
});
test('扒谱复制当前歌曲实际文件，站主删源文件后副本仍存在；重复操作不覆盖用户谱子', async () => {
  const { handler: call, scores, files } = setup();
  files.set('original', 'image bytes');
  scores.set(hash(owner.alias), [{ id: 'score-qing-tian', songId: song.id, songTitle: song.title, songArtist: song.artist, pages: ['original'], lyrics: 'private' }, { songId: 'other-song', pages: ['other-original'] }]);
  const result = await call({ action: 'songScores:copyOwner', ...user, songId: song.id });
  assert.equal(result.ok, true);
  assert.equal(result.score.lyrics, undefined);
  assert.notEqual(result.score.pages[0], 'original');
  files.delete('original'); scores.delete(hash(owner.alias));
  assert.equal(files.get(result.score.pages[0]), 'image bytes');
  assert.equal(scores.get(hash(user.alias)).length, 1);
  assert.equal((await call({ action: 'songScores:copyOwner', ...user, songId: song.id })).error, 'SCORE_ALREADY_EXISTS');
  assert.equal((await call({ action: 'songScores:copyOwner', ...other, songId: song.id })).error, 'SCORE_NOT_FOUND');
});
test('扒谱中途失败不保存半份谱子，并清理本次复制的文件', async () => {
  const { handler: call, scores, files, failCopy } = setup();
  files.set('first', 'one'); files.set('second', 'two');
  scores.set(hash(owner.alias), [{ songId: song.id, songTitle: song.title, pages: ['first', 'second'] }]); failCopy();
  assert.equal((await call({ action: 'songScores:copyOwner', ...user, songId: song.id })).error, 'SCORE_UPLOAD_FAILED');
  assert.equal(scores.has(hash(user.alias)), false); assert.equal(files.size, 2);
});
test('非站主不能保存路演，且读取私人记录只返回练习', async () => {
  const { handler: call } = setup();
  const record = { id: 'r', title: '路演', date: '2026-09-16', performanceSongs: [], recognitionSongs: [], updatedAt: new Date().toISOString() };
  assert.equal((await call({ action: 'roadshows:save', ...user, record })).error, 'AUTH_FAILED');
  assert.equal((await call({ action: 'roadshows:delete', ...user, id: 'legacy' })).error, 'AUTH_FAILED');
  assert.deepEqual((await call({ action: 'roadshows:pull', ...user })).records, []);
  assert.deepEqual((await call({ action: 'songRecords:pull', ...user })).records.map(r => r.kind), ['practice']);
  const feedback = { id: 'r', kind: 'roadshow', songId: song.id, songTitle: song.title, songArtist: song.artist, occurredAt: new Date().toISOString(), audienceName: '', feedback: '现场', updatedAt: new Date().toISOString() };
  assert.equal((await call({ action: 'songRecords:save', ...user, record: feedback })).error, 'AUTH_FAILED');
  assert.equal((await call({ action: 'songRecords:saveBatch', ...user, records: [feedback] })).error, 'INVALID_SONG_RECORD');
});
test('歌单快照拒绝重复歌曲及不匹配的歌手', () => {
  const request = { action: 'artistSettings:push', ...user, expectedRevision: null };
  for (const songs of [[song, song], [{ ...song, artist: '不存在' }]]) assert.throws(() => validateRequest({ ...request, snapshot: { ...seed, catalog: { ...seed.catalog, songs } } }), /INVALID_ARTIST_SETTINGS/);
});
