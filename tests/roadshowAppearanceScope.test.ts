import assert from 'node:assert/strict';
import test from 'node:test';
import { findSongAppearances, findSongRoadshowHistory, type RoadshowRecord, type RoadshowSong } from '../src/components/SongRequest/roadshow.ts';

const song: RoadshowSong = { id: 'catalog:a', catalogId: 'a', title: '搁浅', artist: '周杰伦', source: 'catalog' };
const record = (id: string, performanceSongs: RoadshowSong[], recognitionSongs: RoadshowSong[]): RoadshowRecord => ({ id, title: id, date: '2026-09-08', updatedAt: '', performanceSongs, recognitionSongs });

test('路演歌曲徽标不计入识曲收录，详情仍包含本场', () => {
  const records = [record('第一场', [], [song]), record('第二场', [], [song]), record('第三场', [song], [song])];
  assert.deepEqual(findSongAppearances(records, song, '第三场', 'performanceSongs'), []);
  assert.deepEqual(findSongAppearances(records, song, '第三场', 'recognitionSongs'), ['第一场', '第二场']);
  assert.equal(findSongRoadshowHistory(records, { id: 'a', title: song.title, artist: song.artist }).length, 1);
});

test('按场次ID计数，同场重复歌曲算一次，同名不同场各算一次', () => {
  const records = [record('a', [song, song], []), record('b', [song], [])].map(item => ({ ...item, title: '同名路演' }));
  assert.equal(findSongAppearances([...records, records[0]], song, undefined, 'performanceSongs').length, 2);
  assert.deepEqual(findSongAppearances(records, song, undefined, 'recognitionSongs'), []);
});
