import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  LIFE_SEED_STAR_COLORS,
  LIFE_SEED_STAR_SHAPES,
  LIFE_SEED_STARS,
  isLifeSeedStar,
  mergeLifeSeedStars,
  selectVisibleStars,
} from '../src/components/StarrySky/lifeSeedStars.ts'

test('生命主题内置 100 颗字段合法且各自拥有约 50 字的唯一幸福文本', () => {
  assert.equal(LIFE_SEED_STARS.length, 100)
  assert.equal(new Set(LIFE_SEED_STARS.map((star) => star.id)).size, 100)
  assert.equal(new Set(LIFE_SEED_STARS.map((star) => star.user_id)).size, 100)
  assert.equal(new Set(LIFE_SEED_STARS.map((star) => star.nickname)).size, 100)
  assert.equal(new Set(LIFE_SEED_STARS.map((star) => star.message)).size, 100)

  for (const star of LIFE_SEED_STARS) {
    assert.match(star.id, /^life-seed-/)
    assert.match(star.user_id, /^life-seed-/)
    assert.ok(Array.from(star.message).length >= 45 && Array.from(star.message).length <= 55)
    assert.ok(star.position_x >= 12 && star.position_x <= 88)
    assert.ok(star.position_y >= 12 && star.position_y <= 88)
    assert.ok(star.size >= 20 && star.size <= 36)
    assert.ok(LIFE_SEED_STAR_COLORS.includes(star.color))
    assert.ok(LIFE_SEED_STAR_SHAPES.includes(star.shape))
    assert.equal(new Date(star.created_at).toISOString(), star.created_at)
    assert.equal(isLifeSeedStar(star), true)
  }
})

test('生命主题幂等合并内置星星，JIEYOU 主题保持原数据', () => {
  const remote = [{
    id: 'remote-1', user_id: 'user-1', nickname: '真实用户', position_x: 50, position_y: 50,
    color: '#ffffff', size: 24, shape: 'star', message: '真实留言', created_at: '2026-08-31T00:00:00.000Z',
  }]
  const lifeOnce = mergeLifeSeedStars('life', remote)
  const lifeTwice = mergeLifeSeedStars('life', lifeOnce)

  assert.equal(lifeOnce.length, 101)
  assert.deepEqual(lifeTwice, lifeOnce)
  assert.deepEqual(mergeLifeSeedStars('jieyou', remote), remote)
})

test('随机展示优先真实星星，完整与留言模式保留全部合并数据', () => {
  const remote = Array.from({ length: 4 }, (_, index) => ({
    id: `remote-${index}`, user_id: `user-${index}`, nickname: `真实用户${index}`,
    position_x: 20 + index, position_y: 30 + index, color: '#ffffff', size: 24,
    shape: 'star', message: `真实留言${index}`, created_at: '2026-08-31T00:00:00.000Z',
  }))
  const merged = mergeLifeSeedStars('life', remote)
  const random = selectVisibleStars(merged, 'random', () => 0.5)

  assert.equal(random.length, 30)
  remote.forEach((star) => assert.ok(random.some((visible) => visible.id === star.id)))
  assert.equal(selectVisibleStars(merged, 'full').length, 104)
  assert.equal(selectVisibleStars(merged, 'messages').length, 104)
})

test('组件在两处合并生命星星，并阻止内置星星删除', () => {
  const welcome = readFileSync(new URL('../src/components/Welcome/WelcomeScreen.tsx', import.meta.url), 'utf8')
  const sky = readFileSync(new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url), 'utf8')

  assert.match(welcome, /mergeLifeSeedStars\(theme\.id, stars\)\.length/)
  assert.match(sky, /mergeLifeSeedStars\(theme\.id, allStars\)/)
  assert.match(sky, /selectVisibleStars\(filteredStars, selectionMode\)/)
  const visibleBlock = sky.match(/const visibleStars = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[/)?.[1] ?? ''
  assert.doesNotMatch(visibleBlock, /skyView/, '留言页应继续服从已有的随机或完整展示选项')
  assert.match(sky, /if \(isLifeSeedStar\(starToDelete\)\) return/)
  assert.match(sky, /!isLifeSeedStar\(star\) && \(star\.userId === userId \|\| isAdminDevice\)/)
})
