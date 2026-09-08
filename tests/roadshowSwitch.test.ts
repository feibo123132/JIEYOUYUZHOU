import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareRoadshowSwitch, type RoadshowRecord } from '../src/components/SongRequest/roadshow.ts';

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
