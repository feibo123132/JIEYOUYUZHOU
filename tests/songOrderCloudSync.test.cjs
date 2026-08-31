const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const validationPath = path.join(__dirname, '..', 'cloudfunctions', 'songRequestSync', 'validation.js');

const payload = (songOrder) => ({
  version: 1,
  artistOrder: ['周杰伦'],
  songOrder,
  customAvatars: {},
  avatarAdjustments: {},
});

test('云函数校验并保留歌曲顺序且兼容旧设置', () => {
  const { validateRequest } = require(validationPath);
  const request = {
    action: 'artistSettings:push',
    alias: 'JIEYOU',
    password: 'guitar-2026',
    expectedRevision: null,
    snapshot: payload(['song-a', 'song-b']),
  };

  assert.deepEqual(validateRequest(request).snapshot.songOrder, ['song-a', 'song-b']);
  assert.deepEqual(validateRequest({
    ...request,
    snapshot: { version: 1, artistOrder: ['周杰伦'], customAvatars: {}, avatarAdjustments: {} },
  }).snapshot.songOrder, []);
  assert.throws(() => validateRequest({ ...request, snapshot: payload(['song-a', 'song-a']) }), /INVALID_ARTIST_SETTINGS/);
});
