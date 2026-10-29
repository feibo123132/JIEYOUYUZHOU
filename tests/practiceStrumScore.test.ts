import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bestStrumBpm, bestStrumScore, isValidSongRecord, parsePublicPracticeRanking, parseSongRecords,
  rankSongsByPracticeMatch, STRUM_BPM_MAX, STRUM_BPM_MIN,
} from '../src/components/SongRequest/songRecords.ts';

const base = {
  id: 'practice-strum-score',
  kind: 'practice',
  songId: 'song-1',
  songTitle: '晴天',
  songArtist: '周杰伦',
  occurredAt: '2026-10-29T04:22:00.000Z',
  updatedAt: '2026-10-29T04:22:00.000Z',
  matchScore: 80,
  feelings: '',
  problems: '',
  improvements: '',
  needsMorePractice: false,
  needsImprovement: false,
  singingMoods: [],
} as const;

test('practice records preserve strum score and bpm', () => {
  const record = { ...base, strumScore: 91, strumBpm: 128 };

  assert.equal(isValidSongRecord(record), true);
  const parsed = parseSongRecords([record])[0] as { strumScore?: number; strumBpm?: number };
  assert.equal(parsed.strumScore, 91);
  assert.equal(parsed.strumBpm, 128);
});

test('strum score accepts 70-100 and rejects out of range', () => {
  for (const strumScore of [70, 85, 100]) {
    assert.equal(isValidSongRecord({ ...base, strumScore }), true);
  }
  assert.equal(isValidSongRecord({ ...base, strumScore: 69 }), false);
  assert.equal(isValidSongRecord({ ...base, strumScore: 101 }), false);
  assert.equal(isValidSongRecord({ ...base, strumScore: 88.5 }), false);
});

test('strum bpm accepts the configured range and rejects out of range', () => {
  for (const strumBpm of [STRUM_BPM_MIN, 128, STRUM_BPM_MAX]) {
    assert.equal(isValidSongRecord({ ...base, strumBpm }), true);
  }
  assert.equal(isValidSongRecord({ ...base, strumBpm: STRUM_BPM_MIN - 1 }), false);
  assert.equal(isValidSongRecord({ ...base, strumBpm: STRUM_BPM_MAX + 1 }), false);
  assert.equal(isValidSongRecord({ ...base, strumBpm: 128.5 }), false);
});

test('bestStrumScore takes the highest score across practices', () => {
  assert.equal(bestStrumScore([]), null);
  assert.equal(bestStrumScore([{ strumScore: 82 }, { strumScore: 96 }, { strumScore: 88 }]), 96);
  assert.equal(bestStrumScore([{}, { strumScore: 76 }]), 76);
  assert.equal(bestStrumScore([{}, {}]), null);
});

test('bestStrumBpm follows the best scoring take, ties go to the later one', () => {
  assert.equal(bestStrumBpm([]), null);
  assert.equal(bestStrumBpm([
    { strumScore: 80, strumBpm: 96, occurredAt: '2026-10-29T04:22:00.000Z' },
    { strumScore: 95, strumBpm: 132, occurredAt: '2026-10-29T04:22:00.000Z' },
  ]), 132);
  assert.equal(bestStrumBpm([
    { strumScore: 95, strumBpm: 100, occurredAt: '2026-10-01T04:22:00.000Z' },
    { strumScore: 95, strumBpm: 140, occurredAt: '2026-10-29T04:22:00.000Z' },
  ]), 140);
  // 没有狂扫指数的记录不贡献 BPM，避免拼出「没分却有速度」。
  assert.equal(bestStrumBpm([{ strumBpm: 120, occurredAt: '2026-10-29T04:22:00.000Z' }]), null);
});

test('practice ranking items carry strum score and bpm for the strum board', () => {
  const songs = [
    { id: 'song-1', title: '晴天', artist: '周杰伦', category: '华语流行', featured: false },
    { id: 'song-2', title: '稻香', artist: '周杰伦', category: '华语流行', featured: false },
  ] as unknown as Parameters<typeof rankSongsByPracticeMatch>[0];
  const records = [
    { ...base, id: 'a', songId: 'song-1', matchScore: 80, strumScore: 86, strumBpm: 96 },
    { ...base, id: 'b', songId: 'song-1', matchScore: 90, occurredAt: '2026-10-30T04:22:00.000Z', strumScore: 97, strumBpm: 140 },
    { ...base, id: 'c', songId: 'song-2', matchScore: 88 },
  ] as unknown as Parameters<typeof rankSongsByPracticeMatch>[1];

  const ranking = rankSongsByPracticeMatch(songs, records);
  assert.deepEqual(
    ranking.map(({ song, score, strumScore, strumBpm }) => [song.id, score, strumScore, strumBpm]),
    [['song-1', 90, 97, 140], ['song-2', 88, null, null]],
  );
});

test('public ranking keeps strum fields and tolerates old payloads', () => {
  const [fresh] = parsePublicPracticeRanking([{
    songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', score: 88, chorusScore: 90, strumScore: 94, strumBpm: 132,
  }]);
  assert.equal(fresh?.strumScore, 94);
  assert.equal(fresh?.strumBpm, 132);

  const [legacy] = parsePublicPracticeRanking([{ songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', score: 88 }]);
  assert.equal(legacy?.strumScore, null);
  assert.equal(legacy?.strumBpm, null);
});

test('practice form exposes strum score with quality and a bpm input', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /狂扫指数（70–100）/);
  assert.match(source, /value=\{strumScore\}/);
  assert.match(source, /value=\{strumBpm\}/);
  assert.match(source, /const strumQuality = getMatchQuality\(Number\(strumScore\)\)/);
});

test('ranking panel exposes an independent strum board', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url), 'utf8');

  assert.match(source, /狂扫榜/);
  assert.match(source, /按狂扫指数/);
  assert.match(source, /狂扫指数<\/small>/);
});
