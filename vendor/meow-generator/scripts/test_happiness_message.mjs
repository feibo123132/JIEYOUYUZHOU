import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_HAPPINESS_MESSAGE,
  DEFAULT_HAPPINESS_DATE,
  formatHappinessDate,
  HAPPINESS_CONTEXT_STORAGE_KEY,
  readHappinessMessageContext,
} from '../src/happinessMessage.js';

assert.deepEqual(
  readHappinessMessageContext({
    search: '',
    getStorage: () => ({ getItem: () => '不应读取' }),
  }),
  { active: false, message: '', dateLabel: '' },
);

assert.deepEqual(
  readHappinessMessageContext({
    search: '?source=happiness-star',
    getStorage: () => ({
      getItem: (key) => key === HAPPINESS_CONTEXT_STORAGE_KEY
        ? JSON.stringify({ message: '  我喜欢晚上边跑步边听歌  ', createdAt: '2026-08-18T13:39:00+08:00' })
        : null,
    }),
  }),
  { active: true, message: '我喜欢晚上边跑步边听歌', dateLabel: '2026年8月18日' },
);

assert.equal(formatHappinessDate('2026-08-18T13:39:00+08:00'), '2026年8月18日');
assert.equal(formatHappinessDate('not-a-date'), DEFAULT_HAPPINESS_DATE);

assert.equal(
  readHappinessMessageContext({
    search: '?source=happiness-star',
    getStorage: () => ({ getItem: () => JSON.stringify({ message: '长'.repeat(205), createdAt: '' }) }),
  }).message.length,
  200,
);

for (const getStorage of [
  () => undefined,
  () => { throw new Error('blocked'); },
  () => ({ getItem: () => { throw new Error('denied'); } }),
  () => ({ getItem: () => '{broken-json' }),
  () => ({ getItem: () => JSON.stringify({ message: '   ', createdAt: 'invalid' }) }),
]) {
  assert.deepEqual(
    readHappinessMessageContext({ search: '?source=happiness-star', getStorage }),
    { active: true, message: DEFAULT_HAPPINESS_MESSAGE, dateLabel: DEFAULT_HAPPINESS_DATE },
  );
}

const styles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const speechBubbleRule = styles.match(/\.scene-speech-bubble\s*\{([\s\S]*?)\}/)?.[1] ?? '';
assert.match(speechBubbleRule, /overflow-wrap:\s*anywhere/);

console.log('happiness message context checks passed');
