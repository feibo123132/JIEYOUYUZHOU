import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/SongRequest/AudioTrimDialog.tsx', import.meta.url), 'utf8');

test('片段评论把选区的起点与终点一起写进标记', () => {
  // 评论选区生成的标记必须带 end，否则就退回成普通 M 标记了。
  assert.match(source, /const commentSelection = \(\) => \{/);
  assert.match(source, /time, end: Math\.max\(time \+ MIN_AUDIO_MARKER_SPAN, to\), topic: '', note: '', color: DEFAULT_AUDIO_MARKER_COLOR/);
  // 三个模式里的入口都指向同一个函数。
  assert.equal((source.match(/onClick=\{commentSelection\}/g) ?? []).length, 2);
  assert.match(source, /disabled=\{!canCommentSelection\}/);
  // 「用当前选区」把已有评论改成新范围。
  assert.match(source, /const retargetMarker = \(from: number\) => \{/);
  assert.match(source, /marker\.time === from \? \{ \.\.\.marker, time, end: spanEnd \}/);
});

test('两个增益都记进同一摞可撤回的历史', () => {
  // 整段增益：拖滑块与归零。
  assert.match(source, /commitEdit\('gain-overall', base => \(\{ gain: \{ \.\.\.base\.gain, overallDb \} \}\)\)/);
  assert.match(source, /commitEdit\('gain-overall-reset', base => \(\{ gain: \{ \.\.\.base\.gain, overallDb: 0 \} \}\)\)/);
  // 局部增益：叠加与还原。
  assert.match(source, /commitEdit\(adjustment === 'reset' \? 'gain-range-reset' : 'gain-range'/);
  // 按钮的悬停说明也点明「两个增益算一步」。
  assert.match(source, /撤回（Ctrl\+Z）：删段与两个增益都算一步/);
});

test('撤销快捷键不被增益控件抢走', () => {
  // 关键：不能再用「只要焦点在 INPUT 上就 return」，否则拖完滑块焦点停在 range 上，Ctrl+Z 直接失灵。
  assert.doesNotMatch(source, /if \(target && \(target\.tagName === 'INPUT' \|\| target\.tagName === 'TEXTAREA'/);
  assert.match(source, /if \(isTextEntryTarget\(target\)\) return;/);
  assert.match(source, /const TEXT_INPUT_TYPES = new Set\(\['text', 'search', 'email', 'url', 'tel', 'password', ''\]\)/);
  assert.match(source, /const isTextEntryTarget = \(target: HTMLElement \| null\) => \{/);
  // Ctrl+S 仍然先于焦点判断，留言框里也能存。
  assert.match(source, /Ctrl\+S 先处理：保存不该被输入框抢走/);
});

test('滑块上的方向键 / 退格 / Home 仍然归控件自己', () => {
  // 撤销能被控件外的情况处理，反过来也不能让弹窗把滑块的原生按键吃掉。
  assert.match(source, /const isFormControlTarget = \(target: HTMLElement \| null\) => Boolean\(/);
  assert.match(source, /!isFormControlTarget\(target\) && \(event\.key === 'ArrowLeft' \|\| event\.key === 'ArrowRight'\)/);
  assert.match(source, /!isFormControlTarget\(target\) && \(event\.key === 'Delete' \|\| event\.key === 'Backspace'\)/);
  assert.match(source, /!isFormControlTarget\(target\) && event\.key === 'Home'/);
  assert.match(source, /!isFormControlTarget\(target\) && event\.key === 'End'/);
});

test('数值框的草稿会跟着增益被撤回而清掉', () => {
  // 撤回后若还显示旧草稿，一失焦就会把刚撤回的增益写回去。
  assert.match(source, /useEffect\(\(\) => \{ setInput\(null\); \}, \[db\]\);/);
});

test('保存后把当前这一步的历史对齐到裁完的删段', () => {
  assert.match(source, /entries: current\.entries\.map\(\(entry, index\) => \(index === current\.index \? \{ \.\.\.entry, cuts: visibleCuts \} : entry\)\)/);
  assert.match(source, /saveRef\.current = save;/);
});
