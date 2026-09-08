import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { addFixedQuizSong, groupRoadshowRecognitionSongs, inheritRecognitionSongs, mergePreviousRecognitionSongs, parseRoadshowCache, removeFixedQuizSong, type RoadshowRecord } from '../src/components/SongRequest/roadshow.ts';
const { validateRequest } = createRequire(import.meta.url)('../cloudfunctions/songRequestSync/validation.js');
const song = { id: 'catalog:a', catalogId: 'a', title: '小星星', artist: '童谣', source: 'catalog' as const };
const empty: RoadshowRecord = { id: 'first', title: '第一场', date: '2026-09-08', updatedAt: '', performanceSongs: [], recognitionSongs: [] };

test('送分是独立标签，歌曲同时保留在原难度档且重复添加去重', () => {
  const first = addFixedQuizSong({ ...empty, recognitionSongs: [song] }, song);
  assert.equal(first.recognitionSongs.length, 1);
  assert.equal(first.recognitionSongs[0].fixedBonus, true);
  assert.deepEqual(groupRoadshowRecognitionSongs(first.recognitionSongs, { a: 'warmup' }).warmup, first.recognitionSongs);
  assert.deepEqual(addFixedQuizSong(first, song), first);
  assert.equal(addFixedQuizSong(empty, song).recognitionSongs.length, 1);
  assert.equal('fixedBonus' in song, false);
});

test('从固定送分移除只取消标签，歌曲仍留在原难度档', () => {
  const fixed = addFixedQuizSong(empty, song);
  const restored = removeFixedQuizSong(fixed, song.id);
  assert.equal(restored.recognitionSongs.length, 1);
  assert.equal(restored.recognitionSongs[0].fixedBonus, undefined);
  assert.deepEqual(groupRoadshowRecognitionSongs(restored.recognitionSongs, { a: 'warmup' }).warmup, restored.recognitionSongs);
  assert.equal(fixed.recognitionSongs[0].fixedBonus, true);
});

test('自动和手动继承保留送分标记，兼容旧缓存', () => {
  const source = addFixedQuizSong(empty, song);
  const next = { ...empty, id: 'next' };
  assert.equal(inheritRecognitionSongs(next, source).recognitionSongs[0].fixedBonus, true);
  assert.equal(mergePreviousRecognitionSongs(next, [source]).record.recognitionSongs[0].fixedBonus, true);
  assert.equal(parseRoadshowCache(JSON.stringify({ version: 1, records: [empty, source] })).length, 2);
});

test('云端保存保留送分标记，拒绝非法标记', () => {
  const payload = { action: 'roadshows:save', alias: 'test', password: 'secret123', record: addFixedQuizSong(empty, song) };
  assert.equal(validateRequest(payload).record.recognitionSongs[0].fixedBonus, true);
  assert.throws(() => validateRequest({ ...payload, record: { ...empty, recognitionSongs: [{ ...song, fixedBonus: 'yes' }] } }));
});

test('达到100首后不能新增，但仍能将已有歌曲设为送分', () => {
  const full = { ...empty, recognitionSongs: Array.from({ length: 100 }, (_, i) => ({ ...song, id: String(i), catalogId: String(i), title: String(i) })) };
  assert.throws(() => addFixedQuizSong(full, song), /100/);
  assert.equal(addFixedQuizSong(full, full.recognitionSongs[0]).recognitionSongs.length, 100);
});
