import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../src/components/SongRequest/songScores.ts', import.meta.url);

const song = {
  id: 'qing-tian',
  title: '晴天',
  artist: '周杰伦',
  category: '周杰伦',
  featured: true,
};

const cloudPage = 'cloud://jieyou.bucket/song-request-scores/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/550e8400-e29b-41d4-a716-446655440000.jpg';
const cloudUrl = 'https://example.test/temporary-score.jpg';
const localPage = 'data:image/jpeg;base64,/9j/2Q==';

test('没有上传谱子时显示页列表为空且不崩溃', async () => {
  const { getSongScoreDisplayPages } = await import(moduleUrl.href);

  assert.deepEqual(getSongScoreDisplayPages(null), []);
  assert.deepEqual(getSongScoreDisplayPages(undefined), []);
});

test('旧 Base64 谱页会保留为待迁移数据，云文件引用视为已同步', async () => {
  const { buildSongScore, hasCloudSongScore, isPendingSongScore, parseSongScores } = await import(moduleUrl.href);

  const legacy = buildSongScore(song, [localPage]);
  const synced = buildSongScore(song, [cloudPage]);

  assert.equal(isPendingSongScore(legacy), true);
  assert.equal(isPendingSongScore(synced), false);
  assert.equal(hasCloudSongScore(legacy), false);
  assert.equal(hasCloudSongScore(synced), true);
  assert.equal(hasCloudSongScore(null), false);
  assert.equal(parseSongScores([legacy])[0].pages[0], localPage);
  assert.equal(parseSongScores([synced])[0].pages[0], cloudPage);
});

test('谱子保持云文件引用并用临时地址显示，新增页面不会丢失旧引用', async () => {
  const {
    appendSongScorePages,
    buildSongScore,
    getSongScoreDisplayPages,
    withResolvedSongScorePages,
  } = await import(moduleUrl.href);

  const resolved = withResolvedSongScorePages(buildSongScore(song, [cloudPage]), [cloudUrl]);
  const updated = appendSongScorePages(song, resolved, [localPage]);

  assert.deepEqual(updated.pages, [cloudPage, localPage]);
  assert.deepEqual(getSongScoreDisplayPages(updated), [cloudUrl, localPage]);
  assert.equal(updated.pendingSync, true);
});

test('移动和删除谱页会同步更新云引用与显示地址', async () => {
  const {
    buildSongScore,
    getSongScoreDisplayPages,
    moveSongScorePage,
    removeSongScorePage,
    withResolvedSongScorePages,
  } = await import(moduleUrl.href);
  const secondCloudPage = cloudPage.replace('550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001');
  const score = withResolvedSongScorePages(
    buildSongScore(song, [cloudPage, secondCloudPage]),
    [cloudUrl, `${cloudUrl}?page=2`],
  );

  const moved = moveSongScorePage(score, 0, 1);
  assert.deepEqual(moved.pages, [secondCloudPage, cloudPage]);
  assert.deepEqual(getSongScoreDisplayPages(moved), [`${cloudUrl}?page=2`, cloudUrl]);
  assert.equal(moved.pendingSync, true);

  const removed = removeSongScorePage(moved, 0);
  assert.deepEqual(removed.pages, [cloudPage]);
  assert.deepEqual(getSongScoreDisplayPages(removed), [cloudUrl]);
  assert.equal(removed.pendingSync, true);
});

test('云端元数据会剥离临时地址和待同步标记', async () => {
  const { buildSongScore, toStoredSongScore, withResolvedSongScorePages } = await import(moduleUrl.href);
  const score = {
    ...withResolvedSongScorePages(buildSongScore(song, [cloudPage]), [cloudUrl]),
    pendingSync: true,
  };

  assert.deepEqual(toStoredSongScore(score), {
    id: 'score-qing-tian',
    songId: 'qing-tian',
    songTitle: '晴天',
    songArtist: '周杰伦',
    pages: [cloudPage],
    updatedAt: score.updatedAt,
  });
});
