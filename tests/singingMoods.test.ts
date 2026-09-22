import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizeSingingMoods, isValidSongRecord } from '../src/components/SongRequest/songRecords.ts';
const { validateRequest } = createRequire(import.meta.url)('../cloudfunctions/songRequestSync/validation.js');
const record = { id: 'mood-test', kind: 'practice', songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', occurredAt: '2026-09-17T04:22:00.000Z', updatedAt: '2026-09-17T04:22:00.000Z', matchScore: 80, feelings: '', problems: '', improvements: '' };
test('six singing moods can be saved together in browser and cloud', () => {
  const singingMoods = ['欢快', '感动', '爆款', '爽歌', '音色', '歌词'];
  assert.equal(isValidSongRecord({ ...record, singingMoods }), true);
  const result = validateRequest({ action: 'songRecords:save', alias: 'test', password: '123456', record: { ...record, singingMoods } });
  assert.deepEqual(result.record.singingMoods, singingMoods);
});
test('old singing moods normalize and deduplicate without losing selections', () => {
  assert.deepEqual(normalizeSingingMoods(['快乐', '欢快', '舒服', '音色', '歌词', '想哭', '爆款']), ['欢快', '音色', '歌词', '爆款']);
  const result = validateRequest({ action: 'songRecords:save', alias: 'test', password: '123456', record: { ...record, singingMoods: ['快乐', '舒服', '想哭'] } });
  assert.deepEqual(result.record.singingMoods, ['欢快', '音色', '爆款']);
});
