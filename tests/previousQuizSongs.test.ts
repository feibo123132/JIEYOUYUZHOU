import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePreviousQuizSongs, type RecognitionAttempt } from '../src/components/SongRequest/roadshow.ts';

const attempt = (id: string, title: string, artist = '歌手'): RecognitionAttempt => ({ id, title, artist, correct: false, answeredAt: '2026-09-09T00:00:00Z' });

test('此前题目合并次数，排除本轮，保留首次出现顺序', () => {
  const records = [attempt('1', '瞬'), attempt('2', '平凡的一天'), attempt('3', '瞬'), attempt('4', '下完这场雨')];
  assert.deepEqual(summarizePreviousQuizSongs(records, ['4']), [
    { title: '瞬', artist: '歌手', count: 2 },
    { title: '平凡的一天', artist: '歌手', count: 1 },
  ]);
  assert.equal(summarizePreviousQuizSongs(records).length, 3);
});

test('改判及重复记录不重复计数，同名不同歌手分别统计', () => {
  const first = attempt('1', '瞬');
  assert.deepEqual(summarizePreviousQuizSongs([first, { ...first, correct: true }, attempt('2', '瞬', '另一歌手')]), [
    { title: '瞬', artist: '歌手', count: 1 },
    { title: '瞬', artist: '另一歌手', count: 1 },
  ]);
  assert.deepEqual(summarizePreviousQuizSongs([]), []);
});
