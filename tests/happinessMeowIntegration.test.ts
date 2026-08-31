import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url);

test('both themes share find and close actions without a misleading mine action', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /openHappinessMeowGenerator\(\{\s*message: selectedStar\.message,\s*createdAt: selectedStar\.createdAt,\s*nickname: selectedStar\.nickname/);
  assert.match(source, />\s*找杰宝\s*</);
  assert.match(source, /onClick=\{handleFindJiebao\}[\s\S]*?className=\{`flex-1/);
  assert.doesNotMatch(source, />\s*我的\s*</);
  assert.doesNotMatch(source, /onClick=\{handleOpenMyMessages\}/);
  assert.match(source, /aria-label="关闭星星详情"/);
  assert.doesNotMatch(source, /theme\.id !== 'life'/);
  assert.doesNotMatch(source, /theme\.id === 'life' \? \(/);
  assert.doesNotMatch(source, />\s*关闭\s*</);
});
