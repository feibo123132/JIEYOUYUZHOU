import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('roadshow performance counters use a separate store from request sung counts', () => {
  const station = readFileSync(new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url), 'utf8');
  const requestButton = station.match(/requestSungCounts\[song\.id\][\s\S]*adjustRequestSungCount\(song\.id\)[\s\S]*>已唱\{sungCount\}次/);
  const requestMinusButton = station.match(/adjustRequestSungCount\(song\.id, -1\)/);
  const roadshowPanel = station.match(/onIncrementSingCount=\{\(songId, delta = 1\) => \{ void adjustRoadshowSingCount\(songId, delta\); \}\}[\s\S]*?pendingSingCounts=\{roadshowSingCounts\}/);

  assert.ok(requestButton, 'pending visitor requests should have a button that increments request sung counts');
  assert.ok(requestMinusButton, 'pending visitor requests should have a button that decrements request sung counts');
  assert.doesNotMatch(station, />已唱\{sungVotes\[song\.id\]/, 'pending visitor requests should not read the legacy mixed sung count directly');
  assert.ok(roadshowPanel, 'roadshow panel should use dedicated roadshow sing counts');
  assert.doesNotMatch(station, /pendingSingCounts=\{sungVotes\}/);
});
