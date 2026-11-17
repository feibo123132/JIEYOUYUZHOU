import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAudioMarkers } from '../src/components/SongRequest/audioMarkers.ts';

test('reads legacy timestamp markers and round-trips a marker note and color', () => {
  const markers = parseAudioMarkers('[21, 7, 7]', 30);
  assert.deepEqual(markers.map(marker => [marker.time, marker.note]), [[7, ''], [21, '']]);

  const edited = [{ ...markers[0], note: '这句进得太急了\n下次多留半拍', color: '#fda4af' }, markers[1]];
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
