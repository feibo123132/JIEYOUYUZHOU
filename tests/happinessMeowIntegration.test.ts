import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url);

test('life-theme star details open Meow Generator with the selected message', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /theme\.id === 'life'/);
  assert.match(source, /openHappinessMeowGenerator\(\{\s*message: selectedStar\.message,\s*createdAt: selectedStar\.createdAt,\s*nickname: selectedStar\.nickname/);
  assert.match(source, />\s*找杰宝\s*</);
  assert.match(source, /aria-label="关闭幸福星详情"/);
});

test('the original close action remains available outside the life theme', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /theme\.id === 'life'[\s\S]*?找杰宝[\s\S]*?:[\s\S]*?关闭/);
});
