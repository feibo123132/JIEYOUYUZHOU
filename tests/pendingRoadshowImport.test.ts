import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadshowSong, deduplicateRoadshowSongs, nextQuizParticipantName, prepareLatestRoadshowPerformanceSong, type RoadshowRecord } from '../src/components/SongRequest/roadshow.ts';
import type { Song } from '../src/components/SongRequest/songCatalog.ts';

const song: Song = { id: 'test-a', title: '心墙', artist: '林俊杰', category: '测试', featured: false };
const latest: RoadshowRecord = { id: 'latest', title: '最新路演', date: '2026-09-11', updatedAt: '', performanceSongs: [], recognitionSongs: [] };

test('参与编号按去重用户数递增，跨路演计数并避开已有编号', () => {
  const records = (names: string[]) => [{ recognitionAttempts: names.map((participantName, index) => ({ id: String(index), songId: 'song', songTitle: '歌曲', songArtist: '歌手', correct: true, participantName, answeredAt: '2026-09-09T00:00:00.000Z' })) }];
  assert.equal(nextQuizParticipantName([]), '001');
  assert.equal(nextQuizParticipantName(records(['001'])), '002');
  assert.equal(nextQuizParticipantName(records(['001', '001'])), '002');
  assert.equal(nextQuizParticipantName([...records(['001']), ...records(['002'])]), '003');
  assert.equal(nextQuizParticipantName(records(['小明'])), '002');
  assert.equal(nextQuizParticipantName(records(['002'])), '003');
});

test('单曲加入最新路演后标记已加入，重复加入不改变歌曲列表', () => {
  const result = prepareLatestRoadshowPerformanceSong([latest], song);
  assert.equal(result.kind, 'updated');
  if (result.kind !== 'updated') return;
  assert.equal(result.record.performanceSongs.length, 1);
  assert.equal(prepareLatestRoadshowPerformanceSong([result.record], song).kind, 'duplicate');
  assert.equal(latest.performanceSongs.length, 0);
  assert.equal(prepareLatestRoadshowPerformanceSong([], song).kind, 'missing');
});

test('一键导入已存在的歌曲和同名同歌手歌曲不会重复，保留原有信息', () => {
  const existing = { ...createRoadshowSong(song), id: 'manual-a', catalogId: undefined, title: ' 心墙 ', artist: ' 林俊杰 ' };
  const additions = [song, { ...song, id: 'test-b', title: '她说' }].map(createRoadshowSong);
  const once = deduplicateRoadshowSongs([existing, ...additions]);
  assert.equal(once.length, 2);
  assert.equal(once[0], existing);
  assert.deepEqual(deduplicateRoadshowSongs([...once, ...additions]), once);
  assert.equal(prepareLatestRoadshowPerformanceSong([{ ...latest, performanceSongs: [existing] }], song).kind, 'duplicate');
});
