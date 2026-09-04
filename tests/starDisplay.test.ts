import assert from 'node:assert/strict'
import test from 'node:test'

import { selectVisibleStars } from '../src/components/StarrySky/starDisplay.ts'

test('随机模式最多展示 30 颗真实星星，完整和留言模式保留全部', () => {
  const stars = Array.from({ length: 40 }, (_, index) => ({ id: `remote-${index}` }))

  assert.equal(selectVisibleStars(stars, 'random', () => 0.5).length, 30)
  assert.deepEqual(selectVisibleStars(stars, 'full'), stars)
  assert.deepEqual(selectVisibleStars(stars, 'messages'), stars)
})

test('不足 30 颗时保持原顺序', () => {
  const stars = [{ id: 'one' }, { id: 'two' }]
  assert.deepEqual(selectVisibleStars(stars, 'random', () => 0), stars)
})
