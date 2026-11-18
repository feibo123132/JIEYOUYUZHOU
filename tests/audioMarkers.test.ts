import assert from 'node:assert/strict';
import test from 'node:test';
import {
  audioMarkerEnd, isAudioMarkerSpan, loadLegacyAudioMarkers, parseAudioMarkers,
} from '../src/components/SongRequest/audioMarkers.ts';

test('reads legacy timestamp markers and round-trips a marker note and color', () => {
  const markers = parseAudioMarkers('[21, 7, 7]', 30);
  assert.deepEqual(markers.map(marker => [marker.time, marker.note]), [[7, ''], [21, '']]);

  const edited = [{ ...markers[0], topic: '副歌入口', note: '这句进得太急了\n下次多留半拍', color: '#fda4af' }, markers[1]];
  assert.deepEqual(parseAudioMarkers(JSON.stringify(edited), 30), edited);
});

test('skips invalid times and preserves notes when a saved color is unavailable', () => {
  assert.deepEqual(parseAudioMarkers('broken storage', 30), []);
  const markers = parseAudioMarkers(JSON.stringify([
    31, -1, null, { time: 12, note: '保留这句', color: 'unknown' },
  ]), 30);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].time, 12);
  assert.equal(markers[0].note, '保留这句');
  assert.equal(markers[0].color, parseAudioMarkers('[12]', 30)[0].color);
});

test('loads the old browser markers for the same account and recording', () => {
  const markers = [{ time: 23.456, note: '✅ 原调', color: '#fcd34d' }];
  const storage = {
    getItem: (key: string) => key === 'jieyou-recording-markers-v1:owner%40example.com:rec-1'
      ? JSON.stringify(markers)
      : null,
  };
  assert.deepEqual(loadLegacyAudioMarkers(storage, ' Owner@Example.com ', 'rec-1', 30), markers);
  assert.deepEqual(loadLegacyAudioMarkers(storage, 'other@example.com', 'rec-1', 30), []);
  assert.deepEqual(loadLegacyAudioMarkers(storage, 'owner@example.com', 'rec-2', 30), []);
});

test('keeps the end of a segment comment and round-trips it', () => {
  const span = { time: 12, end: 18.5, topic: '副歌', note: '这段气不够', color: '#6ee7b7' };
  const markers = parseAudioMarkers(JSON.stringify([span]), 30);
  assert.deepEqual(markers, [span]);
  // 点标记不带 end，和旧数据完全一样。
  assert.deepEqual(parseAudioMarkers(JSON.stringify([{ time: 3, note: '', color: '#7dd3fc' }]), 30),
    [{ time: 3, note: '', color: '#7dd3fc' }]);
});

test('degrades a broken segment to a point marker instead of dropping the comment', () => {
  const base = { note: '这句太赶', color: '#fcd34d' };
  // 终点在起点之前 / 太短 / 超出时长：都退化成点标记，评论内容保留。
  for (const end of [9, 12.01, 31]) {
    const [marker] = parseAudioMarkers(JSON.stringify([{ time: 12, end, ...base }]), 30);
    assert.equal(marker.time, 12);
    assert.equal(marker.end, undefined);
    assert.equal(marker.note, '这句太赶');
  }
  const [span] = parseAudioMarkers(JSON.stringify([{ time: 12, end: 20, ...base }]), 30);
  assert.equal(span.end, 20);
  assert.equal(audioMarkerEnd(span), 20);
  assert.equal(isAudioMarkerSpan(span), true);
  assert.equal(isAudioMarkerSpan({ time: 12 }), false);
  assert.equal(audioMarkerEnd({ time: 12 }), 12);
});
