import assert from 'node:assert/strict';
import test from 'node:test';
import { createSamplePeakReader, measureSamplePeak, sampleHeadroomDb } from '../src/components/SongRequest/audioClipping.ts';
import { adjustGainRange, dbToGain } from '../src/components/SongRequest/audioGain.ts';
import { resolveKeptSegments } from '../src/components/SongRequest/songRecordings.ts';

test('measures both channels exactly at trim, cut, selection and gain boundaries', () => {
  const length = 517;
  const sampleRate = 48000;
  const left = new Float32Array(length).fill(0.25);
  const right = new Float32Array(length).fill(0.125);
  right[128] = -1;
  right[255] = -0.5;
  right[256] = 0.875;
  right[length - 1] = 0.75;
  const readPeak = createSamplePeakReader({
    length, sampleRate, numberOfChannels: 2, getChannelData: (channel: number) => channel === 0 ? left : right,
  } as AudioBuffer);
  const time = (frame: number) => frame / sampleRate;
  assert.equal(readPeak(time(127), time(128)), 0.25);
  assert.equal(readPeak(time(128), time(256)), 1);
  assert.equal(readPeak(time(129), time(256)), 0.5);
  assert.equal(readPeak(time(length - 1), time(length)), 0.75);

  // One right-channel transient is cut before the remaining audio is boosted.
  const parts = resolveKeptSegments(0, 4, [{ start: 1, end: 2 }]);
  const sourcePeak = (start: number, end: number) => start <= 1.5 && end > 1.5 ? 1 : 0.25;
  assert.equal(measureSamplePeak(sourcePeak, parts, { overallDb: 6, ranges: [] }), 0.25 * dbToGain(6));
  assert.equal(measureSamplePeak(sourcePeak, parts, { overallDb: 6, ranges: [{ start: 2, end: 3, db: 6 }] }),
    0.25 * dbToGain(12));
});

test('rounds headroom to the loudest setting strictly below 0 dBFS', () => {
  assert.equal(sampleHeadroomDb(0), Infinity);
  assert.equal(sampleHeadroomDb(0.5), 6);
  assert.equal(sampleHeadroomDb(1), -0.1);
  for (const peak of [0.0002, 0.25, 0.5, 0.999, 1, 1.01, 2]) {
    const maxDb = sampleHeadroomDb(peak);
    assert.ok(peak * dbToGain(maxDb) < 1);
    assert.ok(peak * dbToGain(maxDb + 0.1) >= 1);
  }
});

test('accumulates repeated and overlapping local gain changes and resets only the selection', () => {
  const region = { start: 1, end: 3 };
  const first = adjustGainRange([], region, -10)!;
  const second = adjustGainRange(first, region, -10)!;
  assert.deepEqual(second, [{ ...region, db: -20 }]);
  const overlap = adjustGainRange(second, { start: 2, end: 4 }, 3)!;
  assert.deepEqual(overlap, [
    { start: 1, end: 2, db: -20 },
    { start: 2, end: 3, db: -17 },
    { start: 3, end: 4, db: 3 },
  ]);
  assert.equal(adjustGainRange(overlap, { start: 2, end: 4 }, 24), null);
  assert.deepEqual(adjustGainRange(overlap, { start: 2.5, end: 3.5 }, 'reset'), [
    { start: 1, end: 2, db: -20 },
    { start: 2, end: 2.5, db: -17 },
    { start: 3.5, end: 4, db: 3 },
  ]);
  assert.deepEqual(adjustGainRange(first, { start: 3, end: 4 }, -10), [
    { ...region, db: -10 },
    { start: 3, end: 4, db: -10 },
  ]);
});
