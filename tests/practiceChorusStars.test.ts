import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bestChorusStars, isValidSongRecord, parseSongRecords, rankSongsByPracticeMatch } from '../src/components/SongRequest/songRecords.ts';

test('practice records preserve chorus star rating', () => {
  const record = {
    id: 'practice-chorus-stars',
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
    chorusStars: 4,
  } as const;

  assert.equal(isValidSongRecord(record), true);
  assert.equal(parseSongRecords([record])[0]?.kind, 'practice');
  assert.equal((parseSongRecords([record])[0] as { chorusStars?: number })?.chorusStars, 4);
});

test('chorus star rating accepts 0-5 and rejects out of range', () => {
  const base = {
    id: 'practice-chorus-range',
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

  for (const chorusStars of [0, 1, 3, 5]) {
    assert.equal(isValidSongRecord({ ...base, chorusStars }), true);
  }
  assert.equal(isValidSongRecord({ ...base, chorusStars: 6 }), false);
  assert.equal(isValidSongRecord({ ...base, chorusStars: -1 }), false);
  assert.equal(isValidSongRecord({ ...base, chorusStars: 2.5 }), false);
});

test('bestChorusStars takes the highest rating across practices', () => {
  assert.equal(bestChorusStars([]), 0);
  assert.equal(bestChorusStars([{ chorusStars: 2 }, { chorusStars: 5 }, { chorusStars: 3 }]), 5);
  assert.equal(bestChorusStars([{}, { chorusStars: 1 }]), 1);
});

test('practice ranking items carry chorus stars for the chorus board', () => {
  const songs = [
    { id: 'song-1', title: '晴天', artist: '周杰伦', category: '华语流行', featured: false },
    { id: 'song-2', title: '稻香', artist: '周杰伦', category: '华语流行', featured: false },
  ] as Parameters<typeof rankSongsByPracticeMatch>[0];
  const records = [
    { id: 'a', kind: 'practice', songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', occurredAt: '2026-09-17T04:22:00.000Z', updatedAt: '2026-09-17T04:22:00.000Z', matchScore: 80, feelings: '', problems: '', improvements: '', needsMorePractice: false, needsImprovement: false, chorusStars: 2 },
    { id: 'b', kind: 'practice', songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', occurredAt: '2026-09-18T04:22:00.000Z', updatedAt: '2026-09-18T04:22:00.000Z', matchScore: 90, feelings: '', problems: '', improvements: '', needsMorePractice: false, needsImprovement: false, chorusStars: 5 },
    { id: 'c', kind: 'practice', songId: 'song-2', songTitle: '稻香', songArtist: '周杰伦', occurredAt: '2026-09-19T04:22:00.000Z', updatedAt: '2026-09-19T04:22:00.000Z', matchScore: 88, feelings: '', problems: '', improvements: '', needsMorePractice: false, needsImprovement: false },
  ] as Parameters<typeof rankSongsByPracticeMatch>[1];

  const ranking = rankSongsByPracticeMatch(songs, records);
  assert.deepEqual(ranking.map(({ song, score, stars }) => [song.id, score, stars]), [['song-1', 90, 5], ['song-2', 88, 0]]);
});

test('practice form exposes chorus rating as five clickable stars', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /合唱星级/);
  assert.doesNotMatch(source, /异性小伙伴选调/);
  assert.match(source, /\[1, 2, 3, 4, 5\]\.map\(\(star\)/);
  assert.match(source, /aria-pressed=\{chorusStars >= star\}/);
  assert.match(source, /setChorusStars\(\(current\) => \(current === star \? 0 : star\)\)/);
});
