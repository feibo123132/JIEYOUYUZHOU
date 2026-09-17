const assert = require('node:assert/strict');
const test = require('node:test');
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js');

test('song record cloud validation keeps practice female key text', () => {
  const auth = { alias: 'tester@example.com', password: '123456' };
  const record = {
    id: 'practice-female-key',
    kind: 'practice',
    songId: 'song-1',
    songTitle: '晴天',
    songArtist: '周杰伦',
    occurredAt: '2026-09-17T04:22:00.000Z',
    updatedAt: '2026-09-17T04:22:00.000Z',
    matchScore: 80,
    feelings: '',
    problems: '',
    improvements: '',
    needsMorePractice: false,
    needsImprovement: false,
    singingMoods: [],
    femaleKey: '女生降半音',
  };

  const result = validateRequest({ action: 'songRecords:save', ...auth, record });
  assert.equal(result.record.femaleKey, '女生降半音');
  assert.throws(() => validateRequest({ action: 'songRecords:save', ...auth, record: { ...record, femaleKey: 'x'.repeat(81) } }), /INVALID_SONG_RECORD/);
});
