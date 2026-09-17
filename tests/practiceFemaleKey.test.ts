import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isValidSongRecord, parseSongRecords } from '../src/components/SongRequest/songRecords.ts';

test('practice records preserve free-text female key', () => {
  const record = {
    id: 'practice-female-key',
    kind: 'practice',
    songId: 'song-1',
    songTitle: '晴天',
    songArtist: '周杰伦',
    occurredAt: '2026-09-17T04:22:00.000Z',
    updatedAt: '2026-09-17T04:22:00.000Z',
    matchScore: 80,
    feelings: '',
    problems: '',
    improvements: '',
    needsMorePractice: false,
    needsImprovement: false,
    singingMoods: [],
    femaleKey: '女生夹三品',
  } as const;

  assert.equal(isValidSongRecord(record), true);
  assert.equal(parseSongRecords([record])[0]?.kind, 'practice');
  assert.equal(parseSongRecords([record])[0]?.femaleKey, '女生夹三品');
});

test('practice form exposes female key as a free text input', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /女生选调/);
  assert.match(source, /value=\{femaleKey\}/);
  assert.match(source, /onChange=\{\(event\) => setFemaleKey\(event\.target\.value\)\}/);
  assert.doesNotMatch(source, /aria-label="女生选调"[\s\S]{0,160}<details/);
});
