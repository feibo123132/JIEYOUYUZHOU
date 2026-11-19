import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectRecordingScores, isRecordingScore, mergeSongRecordings, parseRecordingScoreInput, parseSongRecordings,
  RECORDING_CACHE_LIMIT, trimRecordingCache,
  type SongRecording,
} from '../src/components/SongRequest/songRecordings.ts';

const recording = (overrides: Partial<SongRecording>): SongRecording => ({
  id: 'rec-1',
  songId: 'song-1',
  songTitle: '后来的我们',
  songArtist: '五月天',
  title: '第一段',
  fileID: 'cloud://env.bucket/song-request-recordings/ws/song-1/rec-1.mp3',
  fileName: 'rec-1.mp3',
  mimeType: 'audio/mpeg',
  size: 1024,
  duration: 200,
  clipStart: 0,
  clipEnd: 200,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

test('录音指数只认 70–100 的整数', () => {
  assert.equal(isRecordingScore(70), true);
  assert.equal(isRecordingScore(100), true);
  assert.equal(isRecordingScore(92), true);
  assert.equal(isRecordingScore(69), false);
  assert.equal(isRecordingScore(101), false);
  assert.equal(isRecordingScore(92.5), false);
  assert.equal(isRecordingScore(0), false);
  assert.equal(isRecordingScore(undefined), false);
  assert.equal(isRecordingScore('92'), false);
});

test('输入框内容只收 70–100 整数，其余一律当作没评', () => {
  assert.equal(parseRecordingScoreInput('92'), 92);
  assert.equal(parseRecordingScoreInput(' 88 '), 88);
  assert.equal(parseRecordingScoreInput(''), null);
  assert.equal(parseRecordingScoreInput('101'), null);
  assert.equal(parseRecordingScoreInput('69'), null);
  assert.equal(parseRecordingScoreInput('9e1'), 90, '数字输入框的科学计数法按数值收');
  assert.equal(parseRecordingScoreInput('abc'), null);
});

test('录音榜每首歌取最高的录音指数，并记住已评段数', () => {
  const map = collectRecordingScores([
    recording({ id: 'a', songId: 'song-1', score: 88 }),
    recording({ id: 'b', songId: 'song-1', score: 94 }),
    recording({ id: 'c', songId: 'song-1' }),
    recording({ id: 'd', songId: 'song-2', score: 76 }),
    recording({ id: 'e', songId: 'song-3', score: 0 }),
  ]);
  assert.deepEqual(map.get('song-1'), { score: 94, count: 2, scores: [94, 88] });
  assert.deepEqual(map.get('song-2'), { score: 76, count: 1, scores: [76] });
  assert.equal(map.has('song-3'), false, '0 表示这段没评，不该进榜');
});

test('云端 0 分与省略字段都不会变成录音指数', () => {
  const parsed = parseSongRecordings([
    recording({ id: 'a', score: 0 }),
    recording({ id: 'b' }),
    recording({ id: 'c', score: 91 }),
    recording({ id: 'd', score: 120 }),
  ]);
  assert.equal(parsed[0].score, undefined);
  assert.equal(parsed[1].score, undefined);
  assert.equal(parsed[2].score, 91);
  assert.equal(parsed[3].score, undefined);
});

test('本机刚评的分不会被云端旧记录盖掉', () => {
  const merged = mergeSongRecordings(
    [recording({ id: 'a', score: 95, updatedAt: '2026-11-10T10:00:00.000Z', localBlobId: 'blob-a' })],
    [recording({ id: 'a', updatedAt: '2026-11-02T10:00:00.000Z' }), recording({ id: 'b', score: 82 })],
  );
  const byId = new Map(merged.map((item) => [item.id, item]));
  assert.equal(byId.get('a')?.score, 95);
  assert.equal(byId.get('a')?.localBlobId, 'blob-a');
  assert.equal(byId.get('b')?.score, 82);
});

test('本机缓存裁剪：未同步的一条都不丢，其余留最新的', () => {
  const synced = Array.from({ length: 500 }, (_, index) => recording({
    id: `rec-${index}`,
    updatedAt: `2026-01-01T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
  }));
  const pending = [recording({ id: 'pending-old', updatedAt: '2025-01-01T00:00:00.000Z', pendingSync: true })];
  const trimmed = trimRecordingCache([...synced, ...pending]);
  assert.equal(trimmed.length, RECORDING_CACHE_LIMIT);
  assert.equal(trimmed[0].id, 'pending-old', '未同步的排在最前，任何情况下都不被裁掉');
  assert.equal(trimmed.some((item) => item.id === 'rec-499'), true, '最新的一段要留下');
  assert.equal(trimmed.some((item) => item.id === 'rec-0'), false, '最老的一段可以被裁掉');
  // 没超过上限时原样返回，不动顺序。
  const small = [recording({ id: 'x' }), recording({ id: 'y' })];
  assert.equal(trimRecordingCache(small), small);
});
