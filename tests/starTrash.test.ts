import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  getTrashDaysRemaining,
  isTrashExpired,
  selectAccessibleTrashStars,
} from '../src/components/StarrySky/starTrash.ts'

test('回收站保留七天并在到期后清理', () => {
  const day = 24 * 60 * 60 * 1000
  const now = Date.UTC(2026, 8, 4, 12)

  assert.equal(getTrashDaysRemaining(now - 2 * day, now), 5)
  assert.equal(getTrashDaysRemaining(now - 6.5 * day, now), 1)
  assert.equal(isTrashExpired(now - 7 * day - 1, now), true)
  assert.equal(isTrashExpired(now - 7 * day + 1, now), false)
})

test('普通用户只能查看自己的回收项，管理员可以查看当前企划全部回收项', () => {
  const stars = [
    { id: 'mine-id', user_id: 'u-1', nickname: '小宇', deleted_at: 3 },
    { id: 'mine-name', user_id: 'old-id', nickname: '小宇', deleted_at: 2 },
    { id: 'other', user_id: 'u-2', nickname: '小生', deleted_at: 1 },
    { id: 'active', user_id: 'u-1', nickname: '小宇' },
  ]

  assert.deepEqual(
    selectAccessibleTrashStars(stars, 'u-1', '小宇', false).map((star) => star.id),
    ['mine-id', 'mine-name'],
  )
  assert.deepEqual(
    selectAccessibleTrashStars(stars, 'u-1', '小宇', true).map((star) => star.id),
    ['mine-id', 'mine-name', 'other'],
  )
})

test('回收站入口位于小工具内部并与管理员模式同层级', () => {
  const source = readFileSync(
    new URL('../src/components/StarrySky/AssistantSidebar.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /onOpenTrash/)
  assert.match(source, /回收站/)
  assert.match(source, /\{toolsFoldOpen && \([\s\S]*?管理员模式[\s\S]*?onClick=\{onOpenTrash\}[\s\S]*?\)\}/)
})

test('删除提示明确说明可从回收站恢复', () => {
  const source = readFileSync(
    new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /移入回收站/)
  assert.match(source, /可在 7 天内恢复/)
})
