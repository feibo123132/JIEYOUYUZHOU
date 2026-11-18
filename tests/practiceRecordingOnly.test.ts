import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  rankSongsByPracticeMatch, rankSongsByRecordings, type PracticeRecord,
} from '../src/components/SongRequest/songRecords.ts';

const songs = [
  { id: 'song-1', title: '简单爱', artist: '周杰伦', category: '华语流行', featured: false },
  { id: 'song-2', title: '雨爱', artist: '杨丞琳', category: '华语流行', featured: false },
  { id: 'song-3', title: '晴天', artist: '周杰伦', category: '华语流行', featured: false },
] as unknown as Parameters<typeof rankSongsByPracticeMatch>[0];

const practice = (patch: Partial<PracticeRecord>): PracticeRecord => ({
  id: 'practice-1',
  kind: 'practice',
  songId: 'song-1',
  songTitle: '简单爱',
  songArtist: '周杰伦',
  occurredAt: '2026-11-18T10:18:00.000Z',
  updatedAt: '2026-11-18T10:18:00.000Z',
  feelings: '',
  problems: '',
  improvements: '',
  needsMorePractice: false,
  needsImprovement: false,
  singingMoods: [],
  ...patch,
});

test('有录音但没评过任何指数的歌也要占一行（分记 0）', () => {
  // 只写了一句感想：rankSongsByPracticeMatch 不收，但歌曲确实传过录音。
  const ranking = rankSongsByPracticeMatch(songs, [practice({ feelings: '今天状态一般' })]);
  assert.deepEqual(ranking, []);

  const rows = rankSongsByRecordings(songs, new Set(['song-1']), ranking);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.song.id, 'song-1');
  assert.equal(rows[0]?.score, 0);
  assert.equal(rows[0]?.chorusScore, null);
  assert.equal(rows[0]?.practiceCount, 0);
});

test('评过分的歌沿用榜上的分，没录音的歌一条都不进', () => {
  const ranking = rankSongsByPracticeMatch(songs, [
    practice({ matchScore: 88, chorusScore: 91 }),
    practice({ id: 'practice-2', songId: 'song-2', chorusScore: 92 }),
  ]);
  const rows = rankSongsByRecordings(songs, new Set(['song-1', 'song-3']), ranking);

  // 简单爱有录音也有分：照旧 88 / 合唱 91；晴天有录音但没评过：0 分垫底；雨爱没录音：不出现。
  assert.deepEqual(rows.map(({ song, score, chorusScore }) => [song.id, score, chorusScore]), [
    ['song-1', 88, 91],
    ['song-3', 0, null],
  ]);
});

test('没分的行排在有分的后面', () => {
  const ranking = rankSongsByPracticeMatch(songs, [
    practice({ songId: 'song-1', matchScore: 88 }),
  ]);
  const board = rankSongsByRecordings(songs, new Set(['song-1', 'song-2']), ranking)
    .sort((left, right) => right.score - left.score);
  assert.deepEqual(board.map(({ song, score }) => [song.id, score]), [['song-1', 88], ['song-2', 0]]);
});

test('歌手子榜只留这位歌手的歌，练习次数可单独兜底', () => {
  const ranking = rankSongsByPracticeMatch(songs, [practice({ songId: 'song-3', feelings: '随手记' })]);
  const jay = rankSongsByRecordings(songs, new Set(['song-1', 'song-2', 'song-3']), ranking, { artist: '周杰伦' });
  assert.deepEqual(jay.map(({ song }) => song.id), ['song-1', 'song-3']);

  const counts = new Map([['song-2', 3]]);
  const withCounts = rankSongsByRecordings(songs, new Set(['song-2']), ranking, { practiceCounts: counts });
  assert.equal(withCounts[0]?.practiceCount, 3);
});

test('点亮录音按钮时每个分榜都放宽「必须有分」这一关', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url), 'utf8');
  assert.match(source, /const allowUnscored = personalRankingRecordingsOnly/);
  assert.match(source, /base\.filter\(\(item\) => allowUnscored \|\| item\.chorusScore != null\)/);
  assert.match(source, /base\.filter\(\(item\) => allowUnscored \|\| item\.strumScore != null\)/);
  assert.match(source, /base\.filter\(\(item\) => allowUnscored \|\| item\.stoolScore != null\)/);
  assert.match(source, /base\.filter\(\(item\) => allowUnscored \|\| item\.score > 0\)/);
  // 没分的行不能显示成「0 匹配指数」。
  assert.match(source, /\) : score > 0 \? \(/);
  assert.match(source, /还没评过匹配指数/);
});
