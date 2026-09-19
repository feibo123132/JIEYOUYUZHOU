const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { createHandler } = require('../cloudfunctions/songRequestSync/index.js');
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js');

test('游客只读取站主未删除谱页，不泄露歌词和私人字段', async () => {
  const ownerId = crypto.createHash('sha256').update('2421415030@qq.com').digest('hex');
  const score = { id: 'score-test', songId: 'test', songTitle: '测试', songArtist: '歌手', pages: ['https://example.com/score.jpg'], updatedAt: '2026-09-16', lyrics: '私人歌词', scoreNote: '站主谱子说明', workspaceId: ownerId, privateNote: 'private' };
  const handler = createHandler({
    getSongScores: async id => { assert.equal(id, ownerId); return [score, { ...score, deletedAt: 'today' }]; },
    resolveSongScores: async scores => scores.map(score => ({ ...score, pageUrls: score.pages })),
  });
  const result = await handler({ action: 'songScores:publicPull', alias: 'someone-else' });
  assert.equal(result.ok, true);
  assert.equal(result.scores.length, 1);
  assert.equal(result.scores[0].id, score.id);
  assert.deepEqual(result.scores[0].pageUrls, score.pages);
  for (const key of ['lyrics', 'scoreNote', 'workspaceId', 'privateNote']) assert.equal(key in result.scores[0], false);
});

test('游客不能调用谱子写入或私人记录接口', () => {
  for (const action of ['songScores:save', 'songScores:delete', 'songScores:uploadPage', 'songScores:pull', 'songRecords:pull', 'roadshows:pull']) {
    assert.throws(() => validateRequest({ action }), /INVALID_ALIAS/);
  }
});
