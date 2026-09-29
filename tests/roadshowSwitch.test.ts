import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareRoadshowSwitch, prepareRoadshowDetailNavigation, type RoadshowRecord } from '../src/components/SongRequest/roadshow.ts';

const first: RoadshowRecord = { id: '1', title: '第一场', date: '2026-09-01', updatedAt: '', performanceSongs: [], recognitionSongs: [] };
const second = { ...first, id: '2', title: '第二场' };
const records = [first, second];

test('没有修改直接切换，不请求保存；无效目标和当前场次不切换', async () => {
  const save = async () => { throw new Error('不应保存'); };
  assert.equal(await prepareRoadshowSwitch(first, records, '2', save), second);
  assert.equal(await prepareRoadshowSwitch(first, records, '1', save), undefined);
  assert.equal(await prepareRoadshowSwitch(first, records, 'missing', save), undefined);
});

test('未保存修改成功保存后才返回目标，失败保留当前场次', async () => {
  const draft = { ...first, title: '已修改' };
  let saved = false;
  assert.equal(await prepareRoadshowSwitch(draft, records, '2', async candidate => { assert.equal(candidate, draft); saved = true; return true; }), second);
  assert.equal(saved, true);
  assert.equal(await prepareRoadshowSwitch(draft, records, '2', async () => false), undefined);
});

test('尚未入库的新路演草稿也需要先保存', async () => {
  let count = 0;
  assert.equal(await prepareRoadshowSwitch({ ...first, id: 'new' }, records, '2', async () => { count++; return true; }), second);
  assert.equal(count, 1);
});

test('从最新路演看谱子时先保存新地点，保存成功才允许进入详情', async () => {
  const draft = { ...second, location: '南湖' };
  let captured: RoadshowRecord | undefined;
  assert.equal(await prepareRoadshowDetailNavigation(draft, records, async record => { captured = record; return true; }), true);
  assert.equal(captured?.location, '南湖');
  assert.equal(await prepareRoadshowDetailNavigation(draft, records, async () => false), false);
});

test('查看歌曲不会重复保存未修改的路演，新路演草稿则先入库', async () => {
  assert.equal(await prepareRoadshowDetailNavigation(second, records, async () => { throw new Error('不应保存'); }), true);
  let saved = false;
  assert.equal(await prepareRoadshowDetailNavigation({ ...second, id: 'new' }, records, async () => { saved = true; return true; }), true);
  assert.equal(saved, true);
});
