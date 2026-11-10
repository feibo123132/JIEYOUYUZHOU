import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bestStoolScore, getMatchQuality, isValidSongRecord, parsePublicPracticeRanking, parseSongRecords,
  rankSongsByPracticeMatch,
} from '../src/components/SongRequest/songRecords.ts';

const base = {
  id: 'practice-stool-score',
  kind: 'practice',
  songId: 'song-1',
  songTitle: '晴天',
  songArtist: '周杰伦',
  occurredAt: '2026-11-05T04:22:00.000Z',
  updatedAt: '2026-11-05T04:22:00.000Z',
  matchScore: 80,
  feelings: '',
  problems: '',
  improvements: '',
  needsMorePractice: false,
  needsImprovement: false,
  singingMoods: [],
} as const;

test('practice records preserve the stool score', () => {
  const record = { ...base, stoolScore: 92 };

  assert.equal(isValidSongRecord(record), true);
  const parsed = parseSongRecords([record])[0] as { stoolScore?: number };
  assert.equal(parsed.stoolScore, 92);
});

test('stool score accepts 70-100 and rejects out of range', () => {
  for (const stoolScore of [70, 85, 100]) {
    assert.equal(isValidSongRecord({ ...base, stoolScore }), true);
  }
  assert.equal(isValidSongRecord({ ...base, stoolScore: 69 }), false);
  assert.equal(isValidSongRecord({ ...base, stoolScore: 101 }), false);
  assert.equal(isValidSongRecord({ ...base, stoolScore: 88.5 }), false);
});

test('bestStoolScore takes the highest score across practices', () => {
  assert.equal(bestStoolScore([]), null);
  assert.equal(bestStoolScore([{ stoolScore: 82 }, { stoolScore: 96 }, { stoolScore: 88 }]), 96);
  assert.equal(bestStoolScore([{}, { stoolScore: 76 }]), 76);
  assert.equal(bestStoolScore([{}, {}]), null);
});

test('stool score shares the ranking quality scale', () => {
  assert.equal(getMatchQuality(96)?.label, '传奇');
  assert.equal(getMatchQuality(92)?.label, '稀有');
  assert.equal(getMatchQuality(88)?.label, '精良');
  assert.equal(getMatchQuality(78)?.label, '优秀');
  assert.equal(getMatchQuality(72)?.label, '普通');
});

test('practice ranking items carry the stool score for the stool board', () => {
  const songs = [
    { id: 'song-1', title: '晴天', artist: '周杰伦', category: '华语流行', featured: false },
    { id: 'song-2', title: '稻香', artist: '周杰伦', category: '华语流行', featured: false },
  ] as unknown as Parameters<typeof rankSongsByPracticeMatch>[0];
  const records = [
    { ...base, id: 'a', songId: 'song-1', matchScore: 80, stoolScore: 86 },
    { ...base, id: 'b', songId: 'song-1', matchScore: 90, occurredAt: '2026-11-06T04:22:00.000Z', stoolScore: 97 },
    { ...base, id: 'c', songId: 'song-2', matchScore: 88 },
  ] as unknown as Parameters<typeof rankSongsByPracticeMatch>[1];

  const ranking = rankSongsByPracticeMatch(songs, records);
  assert.deepEqual(
    ranking.map(({ song, score, stoolScore }) => [song.id, score, stoolScore]),
    [['song-1', 90, 97], ['song-2', 88, null]],
  );
});

test('public ranking keeps the stool score and tolerates old payloads', () => {
  const [fresh] = parsePublicPracticeRanking([{
    songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', score: 88, chorusScore: 90, strumScore: 94, strumBpm: 132, stoolScore: 91,
  }]);
  assert.equal(fresh?.stoolScore, 91);

  const [legacy] = parsePublicPracticeRanking([{ songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', score: 88 }]);
  assert.equal(legacy?.stoolScore, null);
});

test('practice form exposes the stool score with quality', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /板凳指数（70–100）/);
  assert.match(source, /value=\{stoolScore\}/);
  assert.match(source, /const stoolQuality = getMatchQuality\(Number\(stoolScore\)\)/);
});

test('ranking panel exposes an independent stool board', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url), 'utf8');

  assert.match(source, /板凳榜/);
  assert.match(source, /按板凳指数/);
  assert.match(source, /板凳指数<\/small>/);
});
