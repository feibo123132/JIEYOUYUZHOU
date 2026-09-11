import test from 'node:test';
import assert from 'node:assert/strict';
import { isReservedStarName, countParticipantStars } from '../src/components/Welcome/starOwner.ts';
test('站长昵称忽略大小写和空白，其他昵称不受影响', () => {
  assert.equal(isReservedStarName(' jieyou '), true);
  assert.equal(isReservedStarName('JIEYOU不解忧'), false);
});
test('普通星星计数排除站长和删除记录', () => {
  assert.equal(countParticipantStars([{ nickname: 'JIEYOU' }, { nickname: 'jieyou' }, { nickname: '路人' }, { nickname: '另一位', deleted_at: 1 }]), 1);
});
