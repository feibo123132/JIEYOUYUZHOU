import assert from 'node:assert/strict';
import test from 'node:test';
import { findRecognitionUsageRoadshows, type RoadshowRecord, type RecognitionAttempt } from '../src/components/SongRequest/roadshow.ts';

const song = { id: 'catalog:a', catalogId: 'a', title: '天外来物', artist: '薛之谦', source: 'catalog' as const };
const attempt = (id: string, correct: boolean): RecognitionAttempt => ({ id, catalogId: 'a', title: song.title, artist: song.artist, correct, answeredAt: '2026-09-08', participantName: id });
const record = (id: string, recognitionAttempts?: RecognitionAttempt[]): RoadshowRecord => ({ id, title: id, date: '2026-09-08', updatedAt: '', performanceSongs: [], recognitionSongs: [song], recognitionAttempts });

test('仅收录、继承或选中但没有答题记录，不产生历史数字', () => {
  assert.deepEqual(findRecognitionUsageRoadshows([record('第一场'), record('第二场', [])], song, '第三场'), []);
});

test('答对答错都算使用，同场多次只算一场，排除本场', () => {
  const first = record('第一场', [attempt('a', true), attempt('b', false)]);
  const second = record('第二场', [attempt('c', false)]);
  const current = record('第三场', [attempt('d', true)]);
  assert.deepEqual(findRecognitionUsageRoadshows([first, first, second, current], song, current.id), ['第一场', '第二场']);
});

test('手工歌曲按歌名歌手匹配；移出歌单仍保留实际使用历史，删除答题记录后不再计入', () => {
  const manual = { ...attempt('a', false), catalogId: undefined };
  const past = { ...record('第一场', [manual]), recognitionSongs: [] };
  assert.deepEqual(findRecognitionUsageRoadshows([past], song), ['第一场']);
  assert.deepEqual(findRecognitionUsageRoadshows([{ ...past, recognitionAttempts: [] }], song), []);
  assert.deepEqual(findRecognitionUsageRoadshows([past], { ...song, artist: '其他歌手' }), []);
});
