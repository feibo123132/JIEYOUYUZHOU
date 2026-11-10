import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  averageMatchScore, bestMatchScore, isValidSongRecord, parsePublicPracticeRanking,
  PRACTICE_INDEX_ORDER, primaryPracticeIndex, rankSongsByPracticeMatch,
  type PracticeRecord,
} from '../src/components/SongRequest/songRecords.ts';

const practice = (patch: Partial<PracticeRecord>): PracticeRecord => ({
  id: 'practice-optional',
  kind: 'practice',
  songId: 'song-1',
  songTitle: '晴天',
  songArtist: '周杰伦',
  occurredAt: '2026-11-10T02:10:00.000Z',
  updatedAt: '2026-11-10T02:10:00.000Z',
  feelings: '',
  problems: '',
  improvements: '',
  needsMorePractice: false,
  needsImprovement: false,
  singingMoods: [],
  ...patch,
});

const songs = [{ id: 'song-1', title: '晴天', artist: '周杰伦', category: '华语流行', featured: false }] as unknown as Parameters<typeof rankSongsByPracticeMatch>[0];

test('任何一个指数都能单独撑起一条练习记录', () => {
  assert.equal(isValidSongRecord(practice({ chorusScore: 88 })), true);
  assert.equal(isValidSongRecord(practice({ strumScore: 88 })), true);
  assert.equal(isValidSongRecord(practice({ stoolScore: 93 })), true);
  assert.equal(isValidSongRecord(practice({ matchScore: 93 })), true);
});

test('一个指数都不填、只写一句感想也能存成练习记录', () => {
  assert.equal(isValidSongRecord(practice({ feelings: '😍有爽又好听就完事了！' })), true);
  assert.equal(isValidSongRecord(practice({ problems: '副歌换把慢了' })), true);
  assert.equal(isValidSongRecord(practice({ singingMoods: ['爽歌'] })), true);
});

test('彻底空白或分数越界的记录仍然被拒绝', () => {
  assert.equal(isValidSongRecord(practice({})), false);
  assert.equal(isValidSongRecord(practice({ feelings: '   ' })), false);
  assert.equal(isValidSongRecord(practice({ matchScore: 69 })), false);
  assert.equal(isValidSongRecord(practice({ matchScore: 101, stoolScore: 60 })), false);
});

test('主指数优先匹配指数，没评就让位给已评的下一项', () => {
  assert.deepEqual(primaryPracticeIndex(practice({ matchScore: 93, stoolScore: 92 })), { label: '匹配指数', score: 93 });
  assert.deepEqual(primaryPracticeIndex(practice({ stoolScore: 93 })), { label: '板凳指数', score: 93 });
  assert.deepEqual(primaryPracticeIndex(practice({ strumScore: 91, stoolScore: 93 })), { label: '狂扫指数', score: 91 });
  assert.deepEqual(primaryPracticeIndex(practice({ chorusScore: 88 })), { label: '合唱指数', score: 88 });
  assert.equal(primaryPracticeIndex(practice({})), null);
  assert.deepEqual(PRACTICE_INDEX_ORDER.map(([, label]) => label), ['匹配指数', '合唱指数', '狂扫指数', '板凳指数']);
});

test('平均分与最高分只统计填过匹配指数的练习', () => {
  const records = [practice({ id: 'a', matchScore: 90 }), practice({ id: 'b', stoolScore: 93 }), practice({ id: 'c', matchScore: 80 })];
  assert.equal(averageMatchScore(records), 85);
  assert.equal(bestMatchScore(records), 90);
  assert.equal(averageMatchScore([practice({ stoolScore: 93 })]), null);
  assert.equal(bestMatchScore([practice({ stoolScore: 93 })]), null);
});

test('只评了其它指数的歌曲不进练习榜，但仍保留自己的指数分', () => {
  const ranking = rankSongsByPracticeMatch(songs, [practice({ stoolScore: 93, chorusScore: 88 })]);
  assert.deepEqual(ranking, []);
  const withMatch = rankSongsByPracticeMatch(songs, [practice({ matchScore: 93, stoolScore: 88 })]);
  assert.equal(withMatch[0]?.score, 93);
});

test('云端把「没有匹配指数」的歌曲记为 0 分，解析后仍然保留', () => {
  const parsed = parsePublicPracticeRanking([
    { songId: 'song-1', songTitle: '晴天', songArtist: '周杰伦', score: 0, chorusScore: 0, strumScore: 0, stoolScore: 93 },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.score, 0);
  assert.equal(parsed[0]?.stoolScore, 93);
});

test('practice form leaves 匹配指数 blank by default and pages it into the index card', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /const \[matchScore, setMatchScore\] = useState<number \| ''>\(''\)/);
  assert.match(source, /matchScore === '' \? \{\} : \{ matchScore: Number\(matchScore\) \}/);
  assert.match(source, /setMatchScore\(record\.matchScore \?\? ''\)/);
  // 时间线的主指数由 primaryPracticeIndex 决定，样式固定，缺匹配指数时不会留空。
  assert.match(source, /const primary = primaryPracticeIndex\(record\)/);
  assert.match(source, /\{primary\.label\} \{primary\.score\}/);
  assert.doesNotMatch(source, />匹配指数 \{record\.matchScore\}/);
});

test('云端校验与聚合都允许缺匹配指数', () => {
  const validation = readFileSync(new URL('../cloudfunctions/songRequestSync/validation.js', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../cloudfunctions/songRequestSync/index.js', import.meta.url), 'utf8');

  assert.match(validation, /if \(value\.matchScore !== undefined && \(!Number\.isInteger\(value\.matchScore\)/);
  // 云函数同样放开了「至少一项指数」：只有完全空白的记录才会被拒。
  assert.match(validation, /const hasIndexScore = \[value\.matchScore, value\.chorusScore, value\.strumScore, value\.stoolScore\]/);
  assert.match(validation, /if \(!hasIndexScore && !feelings && !problems/);
  assert.doesNotMatch(validation, /至少要有/);
  assert.match(index, /const hasAnyScore = \[record\.matchScore, record\.chorusScore, record\.strumScore, record\.stoolScore\]/);
  assert.match(index, /score: count \? Math\.round\(\(total \/ count\) \* 10\) \/ 10 : 0,/);
});
