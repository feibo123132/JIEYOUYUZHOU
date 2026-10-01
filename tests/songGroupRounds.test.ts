import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js');
const roadshowUrl = new URL('../src/components/SongRequest/roadshow.ts', import.meta.url);
const roundsUrl = new URL('../src/components/SongRequest/songGroupRounds.ts', import.meta.url);

const record = {
  id: 'roadshow-one', title: '第一场', date: '2026-09-30',
  performanceSongs: [], recognitionSongs: [], updatedAt: new Date().toISOString(),
};
const planned = { id: 'round-one', groupId: 'love-group', round: 1, songIds: ['a', 'b', 'c', 'd'] };

test('轮次保存和撤销已唱只改变真实演唱次数，不把准备歌单算进去', async () => {
  const { countCompletedSongGroupRounds, nextSongGroupRoundNumber, removeSongGroupRound, upsertSongGroupRound } = await import(roundsUrl.href);
  const first = upsertSongGroupRound(record, planned);
  assert.equal(nextSongGroupRoundNumber(first), 2);
  assert.deepEqual(countCompletedSongGroupRounds([first]), {});
  const performed = upsertSongGroupRound(first, { ...planned, sungAt: '2026-09-30T10:00:00.000Z' });
  assert.equal(countCompletedSongGroupRounds([performed]).a, 1);
  assert.equal(countCompletedSongGroupRounds([performed, performed]).d, 2);
  const reversed = upsertSongGroupRound(performed, planned);
  assert.deepEqual(countCompletedSongGroupRounds([reversed]), {});
  assert.deepEqual(removeSongGroupRound(performed, planned.id).funGroupRounds, []);
});

test('轮次在路演缓存和云函数验证中保留，拒绝重复轮号和超过4首', async () => {
  const { parseRoadshowCache } = await import(roadshowUrl.href);
  const withRound = { ...record, funGroupRounds: [planned] };
  assert.deepEqual(parseRoadshowCache(JSON.stringify({ version: 1, records: [withRound] }))[0].funGroupRounds, [planned]);
  const request = { action: 'roadshows:save', alias: 'owner', password: '123456', record: withRound };
  assert.deepEqual(validateRequest(request).record.funGroupRounds, [planned]);
  assert.throws(() => validateRequest({ ...request, record: { ...withRound, funGroupRounds: [planned, { ...planned, id: 'round-two' }] } }), /INVALID_RECORD/);
  assert.throws(() => validateRequest({ ...request, record: { ...withRound, funGroupRounds: [{ ...planned, songIds: ['a', 'b', 'c', 'd', 'e'] }] } }), /INVALID_RECORD/);
});
