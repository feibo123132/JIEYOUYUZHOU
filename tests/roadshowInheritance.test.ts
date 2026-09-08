import assert from 'node:assert/strict';
import test from 'node:test';
import { inheritRecognitionSongs, mergePreviousRecognitionSongs, getLatestRoadshow, type RoadshowRecord } from '../src/components/SongRequest/roadshow.ts';

const draft = (id: string, date = '2026-09-08'): RoadshowRecord => ({ id, title: id, date, updatedAt: date, performanceSongs: [], recognitionSongs: [], recognitionAttempts: [] });
const source = draft('第一场', '2026-09-03');
source.recognitionSongs = [
  { id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' },
  { id: 'manual:b', title: '手工歌曲', artist: '歌手', source: 'manual' },
];
source.recognitionAttempts = [{ id: 'attempt', catalogId: 'a', title: '晴天', artist: '周杰伦', correct: true, participantName: '小明', answeredAt: source.date }];

test('手动继承保留本场歌曲和成绩，排除自身和未来场次，重复点击不重复添加', () => {
  const current = { ...draft('本场'), recognitionSongs: [source.recognitionSongs[1]], recognitionAttempts: source.recognitionAttempts };
  const result = mergePreviousRecognitionSongs(current, [current, source, draft('未来', '2026-09-09')]);
  assert.equal(result.source?.id, source.id);
  assert.equal(result.added, 1);
  assert.deepEqual(result.record.recognitionSongs.map(song => song.id), ['manual:b', 'catalog:a']);
  assert.deepEqual(result.record.recognitionAttempts, current.recognitionAttempts);
  assert.equal(current.recognitionSongs.length, 1);
  assert.equal(mergePreviousRecognitionSongs(result.record, [source]).added, 0);
});

test('手动继承遇到空的上一场不回溯，没有来源时保持本场数据', () => {
  const current = draft('本场');
  assert.equal(mergePreviousRecognitionSongs(current, [source, draft('空场', '2026-09-07')]).added, 0);
  assert.equal(mergePreviousRecognitionSongs(current, [current]).source, undefined);
  assert.deepEqual(mergePreviousRecognitionSongs(current, []).record, current);
});

test('默认完整继承已使用和未使用歌曲，去重且不带成绩', () => {
  const result = inheritRecognitionSongs(draft('第二场'), { ...source, recognitionSongs: [...source.recognitionSongs, source.recognitionSongs[0]] });
  assert.deepEqual(result.recognitionSongs, source.recognitionSongs);
  assert.deepEqual(result.recognitionAttempts, []);
  assert.deepEqual(result.performanceSongs, []);
  result.recognitionSongs[0].title = '改名';
  assert.equal(source.recognitionSongs[0].title, '晴天');
  assert.equal(source.recognitionAttempts?.length, 1);
});

test('取消只影响本场；没有来源或上一场为空时创建空歌单', () => {
  assert.deepEqual(inheritRecognitionSongs(draft('第二场'), source, false).recognitionSongs, []);
  assert.equal(inheritRecognitionSongs(draft('第三场'), source).recognitionSongs.length, 2);
  assert.deepEqual(inheritRecognitionSongs(draft('首次'), undefined).recognitionSongs, []);
  const latest = getLatestRoadshow([source, draft('空白场')]);
  assert.deepEqual(inheritRecognitionSongs(draft('下一场'), latest).recognitionSongs, []);
});

test('连续传承保留上一场新增歌曲和顺序，并隔离后续增删', () => {
  const second = inheritRecognitionSongs(draft('第二场'), source);
  second.recognitionSongs.push({ id: 'new', title: '新歌', artist: '', source: 'manual' });
  const third = inheritRecognitionSongs(draft('第三场'), second);
  assert.deepEqual(third.recognitionSongs, second.recognitionSongs);
  second.recognitionSongs.splice(0, 1);
  assert.equal(third.recognitionSongs.length, 3);
  assert.equal(source.recognitionSongs.length, 2);
});
