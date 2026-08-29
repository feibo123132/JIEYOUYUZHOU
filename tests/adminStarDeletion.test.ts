import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const starrySkyUrl = new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url)

test('管理员模式允许删除任意用户的星星且删除函数保留权限校验', () => {
  const source = readFileSync(starrySkyUrl, 'utf8')

  assert.match(source, /const canDeleteStar = \(star: StarData\) => star\.userId === userId \|\| isAdminDevice/)
  assert.match(source, /if \(!starToDelete \|\| !canDeleteStar\(starToDelete\)\)/)
  assert.match(source, /canDelete=\{canDeleteStar\(star\)\}/)
  assert.match(source, /canDeleteStar\(selectedStar\) && \(/)
})
