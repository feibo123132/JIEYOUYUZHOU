import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_HAPPINESS_MESSAGE,
  getHappinessMeowGeneratorUrl,
  getMeowGeneratorUrl,
  HAPPINESS_CONTEXT_STORAGE_KEY,
  normalizeHappinessMessage,
  openHappinessMeowGenerator,
  storeHappinessContext,
} from '../src/utils/meowGenerator.ts';

test('builds the Meow Generator URL from a relative base path', () => {
  assert.equal(getMeowGeneratorUrl('./'), './meow-generator/index.html');
});

test('builds the Meow Generator URL from a nested base path', () => {
  assert.equal(getMeowGeneratorUrl('/jieyou/'), '/jieyou/meow-generator/index.html');
});

test('adds a trailing slash to the base path before building the URL', () => {
  assert.equal(getMeowGeneratorUrl('/jieyou'), '/jieyou/meow-generator/index.html');
});

test('uses the root base path by default outside Vite', () => {
  assert.equal(getMeowGeneratorUrl(), '/meow-generator/index.html');
});

test('builds the happiness-star Meow Generator URL without putting the message in it', () => {
  assert.equal(
    getHappinessMeowGeneratorUrl('/jieyou/'),
    '/jieyou/meow-generator/index.html?source=happiness-star',
  );
});

test('normalizes happiness messages and provides a safe fallback', () => {
  assert.equal(normalizeHappinessMessage('  跑步听歌  '), '跑步听歌');
  assert.equal(normalizeHappinessMessage('   '), DEFAULT_HAPPINESS_MESSAGE);
  assert.equal(normalizeHappinessMessage('长'.repeat(205)).length, 200);
});

test('stores the normalized happiness message and selected-star date atomically', () => {
  const entries = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => entries.set(key, value) };

  assert.deepEqual(storeHappinessContext(storage, '  跑步听歌  ', '2026-08-18T13:39:00+08:00'), {
    message: '跑步听歌',
    createdAt: '2026-08-18T13:39:00+08:00',
  });
  assert.deepEqual(JSON.parse(entries.get(HAPPINESS_CONTEXT_STORAGE_KEY) ?? ''), {
    message: '跑步听歌',
    createdAt: '2026-08-18T13:39:00+08:00',
  });
});

test('replaces message and date together when different stars are selected', () => {
  const stored: Array<{ message: string; createdAt: string }> = [];
  const navigated: string[] = [];
  const storage = { setItem: (_key: string, value: string) => stored.push(JSON.parse(value)) };
  const navigate = (url: string) => navigated.push(url);

  openHappinessMeowGenerator({ message: '第一颗星', createdAt: '2026-08-18T08:00:00Z', getStorage: () => storage, navigate });
  openHappinessMeowGenerator({ message: '第二颗星', createdAt: '2026-08-19T09:00:00Z', getStorage: () => storage, navigate });

  assert.deepEqual(stored, [
    { message: '第一颗星', createdAt: '2026-08-18T08:00:00Z' },
    { message: '第二颗星', createdAt: '2026-08-19T09:00:00Z' },
  ]);
  assert.deepEqual(navigated, [
    '/meow-generator/index.html?source=happiness-star',
    '/meow-generator/index.html?source=happiness-star',
  ]);
});

test('still navigates when temporary storage cannot be accessed or written', () => {
  const navigated: string[] = [];
  const navigate = (url: string) => navigated.push(url);

  openHappinessMeowGenerator({
    message: '获取失败',
    createdAt: '2026-08-18T08:00:00Z',
    getStorage: () => { throw new Error('blocked'); },
    navigate,
  });
  openHappinessMeowGenerator({
    message: '写入失败',
    createdAt: '2026-08-19T09:00:00Z',
    getStorage: () => ({ setItem: () => { throw new Error('quota'); } }),
    navigate,
  });

  assert.equal(navigated.length, 2);
});
