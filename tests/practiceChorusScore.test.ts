import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bestChorusScore, chorusStarsToScore, isValidSongRecord, parseSongRecords, rankSongsByPracticeMatch,
} from '../src/components/SongRequest/songRecords.ts';

const base = {
  id: 'practice-chorus-score',
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
} as const;

test('practice records preserve chorus score', () => {
  const record = { ...base, chorusScore: 88 };

  assert.equal(isValidSongRecord(record), true);
  assert.equal(parseSongRecords([record])[0]?.kind, 'practice');
  assert.equal((parseSongRecords([record])[0] as { chorusScore?: number })?.chorusScore, 88);
});

test('legacy chorus stars convert to chorus score on read', () => {
  assert.equal(chorusStarsToScore(1), 76);
  assert.equal(chorusStarsToScore(2), 82);
  assert.equal(chorusStarsToScore(5), 100);
  assert.equal(chorusStarsToScore(0), null);
  assert.equal(chorusStarsToScore(6), null);

  const parsed = parseSongRecords([{ ...base, id: 'legacy-stars', chorusStars: 4 }])[0] as { chorusScore?: number; chorusStars?: number };
  assert.equal(parsed.chorusScore, 94);
  assert.equal(parsed.chorusStars, undefined);
});

test('chorus score accepts 70-100 and rejects out of range', () => {
  for (const chorusScore of [70, 85, 100]) {
    assert.equal(isValidSongRecord({ ...base, chorusScore }), true);
  }
  assert.equal(isValidSongRecord({ ...base, chorusScore: 69 }), false);
  assert.equal(isValidSongRecord({ ...base, chorusScore: 101 }), false);
  assert.equal(isValidSongRecord({ ...base, chorusScore: 88.5 }), false);
});

test('bestChorusScore takes the highest score across practices', () => {
  assert.equal(bestChorusScore([]), null);
  assert.equal(bestChorusScore([{ chorusScore: 82 }, { chorusScore: 96 }, { chorusScore: 88 }]), 96);
  assert.equal(bestChorusScore([{}, { chorusScore: 76 }]), 76);
  assert.equal(bestChorusScore([{ chorusStars: 5 }, { chorusScore: 80 }]), 100);
});

test('practice ranking items carry chorus score for the chorus board', () => {
  const songs = [
    { id: 'song-1', title: '晴天', artist: '周杰伦', category: '华语流行', featured: false },
    { id: 'song-2', title: '稻香', artist: '周杰伦', category: '华语流行', featured: false },
  ] as Parameters<typeof rankSongsByPracticeMatch>[0];
  const records = [
    { id: 'a', kind: 'practice', songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', occurredAt: '2026-09-17T04:22:00.000Z', updatedAt: '2026-09-17T04:22:00.000Z', matchScore: 80, feelings: '', problems: '', improvements: '', needsMorePractice: false, needsImprovement: false, chorusScore: 82 },
    { id: 'b', kind: 'practice', songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', occurredAt: '2026-09-18T04:22:00.000Z', updatedAt: '2026-09-18T04:22:00.000Z', matchScore: 90, feelings: '', problems: '', improvements: '', needsMorePractice: false, needsImprovement: false, chorusScore: 96 },
    { id: 'c', kind: 'practice', songId: 'song-2', songTitle: '稻香', songArtist: '周杰伦', occurredAt: '2026-09-19T04:22:00.000Z', updatedAt: '2026-09-19T04:22:00.000Z', matchScore: 88, feelings: '', problems: '', improvements: '', needsMorePractice: false, needsImprovement: false },
  ] as Parameters<typeof rankSongsByPracticeMatch>[1];

  const ranking = rankSongsByPracticeMatch(songs, records);
  assert.deepEqual(ranking.map(({ song, score, chorusScore }) => [song.id, score, chorusScore]), [['song-1', 90, 96], ['song-2', 88, null]]);
});

test('practice form exposes chorus score as a 70-100 input with quality', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /合唱指数（70–100）/);
  assert.doesNotMatch(source, /合唱星级/);
  assert.doesNotMatch(source, /setChorusStars/);
  assert.match(source, /value=\{chorusScore\}/);
  assert.match(source, /const chorusQuality = getMatchQuality\(Number\(chorusScore\)\)/);
});

test('chorus board renders chorus score instead of stars', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url), 'utf8');

  assert.match(source, /合唱指数<\/small>/);
  assert.doesNotMatch(source, /'⭐'\.repeat\(stars\)/);
  assert.match(source, /按合唱指数/);
});
