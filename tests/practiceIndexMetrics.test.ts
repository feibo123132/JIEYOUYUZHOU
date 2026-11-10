import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  indexScoreFromMetrics, INDEX_METRIC_MAX, INDEX_METRIC_MIN, isValidSongRecord,
  parseSongRecords, rankSongsByPracticeMatch,
} from '../src/components/SongRequest/songRecords.ts';

const base = {
  id: 'practice-index-metrics',
  kind: 'practice',
  songId: 'song-1',
  songTitle: '晴天',
  songArtist: '周杰伦',
  occurredAt: '2026-11-10T02:10:00.000Z',
  updatedAt: '2026-11-10T02:10:00.000Z',
  matchScore: 82,
  feelings: '',
  problems: '',
  improvements: '',
  needsMorePractice: false,
  needsImprovement: false,
  singingMoods: [],
} as const;

test('index total converts from joy 80% and ear 20%', () => {
  assert.equal(indexScoreFromMetrics(90, 100), 92);
  assert.equal(indexScoreFromMetrics(88, 95), 89);
  assert.equal(indexScoreFromMetrics(80, 80), 80);
  assert.equal(indexScoreFromMetrics(100, 100), 100);
});

test('joy alone takes 100% when ear is missing', () => {
  assert.equal(indexScoreFromMetrics(90, ''), 90);
  assert.equal(indexScoreFromMetrics(90, null), 90);
  assert.equal(indexScoreFromMetrics(90, undefined), 90);
});

test('no joy means no converted total', () => {
  assert.equal(indexScoreFromMetrics('', 95), null);
  assert.equal(indexScoreFromMetrics(null, null), null);
  assert.equal(indexScoreFromMetrics(undefined, undefined), null);
});

test('metrics outside 80-100 cannot produce a total', () => {
  assert.equal(indexScoreFromMetrics(INDEX_METRIC_MIN - 1, ''), null);
  assert.equal(indexScoreFromMetrics(INDEX_METRIC_MAX + 1, ''), null);
  assert.equal(indexScoreFromMetrics(90, INDEX_METRIC_MIN - 1), null);
  assert.equal(indexScoreFromMetrics(90, INDEX_METRIC_MAX + 1), null);
  assert.equal(indexScoreFromMetrics(90.5, ''), null);
});

test('practice records keep joy, ear and offline feedback per index', () => {
  const record = {
    ...base,
    chorusScore: 90, chorusJoy: 86, chorusEar: 100, chorusOffline: '台下有人跟着唱',
    stoolScore: 88, stoolJoy: 88, stoolEar: 90,
    strumScore: 84, strumJoy: 84,
  };

  assert.equal(isValidSongRecord(record), true);
  const parsed = parseSongRecords([record])[0] as Record<string, unknown>;
  assert.equal(parsed.chorusJoy, 86);
  assert.equal(parsed.chorusEar, 100);
  assert.equal(parsed.chorusOffline, '台下有人跟着唱');
  assert.equal(parsed.stoolJoy, 88);
  assert.equal(parsed.stoolEar, 90);
  assert.equal(parsed.strumJoy, 84);
});

test('metric scores must be 80-100 integers when present', () => {
  for (const joy of [80, 90, 100]) assert.equal(isValidSongRecord({ ...base, chorusJoy: joy }), true);
  assert.equal(isValidSongRecord({ ...base, chorusJoy: 79 }), false);
  assert.equal(isValidSongRecord({ ...base, chorusJoy: 101 }), false);
  assert.equal(isValidSongRecord({ ...base, chorusEar: 79 }), false);
  assert.equal(isValidSongRecord({ ...base, stoolEar: 88.5 }), false);
  assert.equal(isValidSongRecord({ ...base, chorusOffline: 'x'.repeat(1001) }), false);
});

test('offline feedback never changes the index total', () => {
  const songs = [{ id: 'song-1', title: '晴天', artist: '周杰伦', category: '华语流行', featured: false }] as unknown as Parameters<typeof rankSongsByPracticeMatch>[0];
  const records = [
    { ...base, chorusScore: 90, chorusOffline: '全场跟唱' },
    { ...base, id: 'b', occurredAt: '2026-11-09T02:10:00.000Z', chorusScore: 84 },
  ] as unknown as Parameters<typeof rankSongsByPracticeMatch>[1];

  const [entry] = rankSongsByPracticeMatch(songs, records);
  assert.equal(entry?.score, 82);
  assert.equal(entry?.chorusScore, 90);
});

test('practice form exposes joy and ear under each index and folds offline feedback into 练习感受', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /快乐指数（\$\{INDEX_METRIC_MIN\}–\$\{INDEX_METRIC_MAX\} · 占 80%）/);
  assert.match(source, /过耳（\$\{INDEX_METRIC_MIN\}–\$\{INDEX_METRIC_MAX\} · 占 20%）/);
  // 线下反馈不再是独立指标，合并进「练习感受/线下反馈」一个输入框。
  assert.doesNotMatch(source, /label="线下反馈/);
  assert.match(source, /label="练习感受\/线下反馈"/);
  assert.match(source, /updateMetric\(\{ joy: parseMatchScoreInput/);
  assert.match(source, /indexScoreFromMetrics\(merged.joy, merged.ear\)/);
});

test('匹配指数 is the first of the four index pills and owns its own metrics', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /type ScoreField = 'match' \| 'chorus' \| 'strum' \| 'stool'/);
  assert.match(source, /\{ id: 'match', label: '匹配指数', value: matchScore, quality: matchQuality \},\s*\{ id: 'chorus'/);
  assert.match(source, /scoreField === 'match' \? 'sm:col-span-2' : 'hidden'/);
  // 顶部只留练习时间与优点勾选，匹配指数挪进指数卡。
  assert.doesNotMatch(source, /<Field label="匹配指数（70–100）"><input type="number" min="70"/);
  assert.match(source, /match: \{ joy: record.matchJoy \?\? '', ear: record.matchEar \?\? '', offline: '' \}/);
});
