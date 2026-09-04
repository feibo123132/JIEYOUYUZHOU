import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const starrySkyUrl = new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url)

test('管理员模式允许删除任意用户的星星且删除函数保留权限校验', () => {
  const source = readFileSync(starrySkyUrl, 'utf8')

  assert.match(source, /const canDeleteStar = \(star: StarData\) => star\.userId === userId \|\| isAdminDevice/)
  assert.match(source, /if \(!starToDelete\) return/)
  assert.doesNotMatch(source, /isLifeSeedStar/)
  assert.match(source, /if \(!canDeleteStar\(starToDelete\)\)/)
  assert.match(source, /canDelete=\{canDeleteStar\(star\)\}/)
  assert.match(source, /canDeleteStar\(selectedStar\) && \(/)
})

test('删除星星必须经过站内二次确认', () => {
  const source = readFileSync(starrySkyUrl, 'utf8')

  assert.match(source, /const \[pendingDeleteStarId, setPendingDeleteStarId\] = useState<string \| null>\(null\)/)
  assert.match(source, /requestDeleteStar\(selectedStar\.id\)/)
  assert.match(source, /onDelete=\{\(\) => requestDeleteStar\(star\.id\)\}/)
  assert.match(source, /role="alertdialog"/)
  assert.match(source, /移入回收站/)
  assert.match(source, /可在 7 天内恢复/)
  assert.match(source, />\s*取消\s*<\/button>/)
  assert.match(source, />\s*移入回收站\s*<\/button>/)
  assert.match(source, /handleConfirmDelete/)
  assert.doesNotMatch(source, /handleDeleteStar\(selectedStar\.id\)/)
})
