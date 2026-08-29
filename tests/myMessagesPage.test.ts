import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import { getMyMessages } from '../src/components/StarrySky/myMessages.ts'

const pageUrl = new URL('../src/components/StarrySky/MyMessagesPage.tsx', import.meta.url)
const starrySkyUrl = new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url)

test('我的留言页面组件存在', () => {
  assert.equal(existsSync(pageUrl), true)
})

test('只返回当前用户的非空留言并按时间倒序', () => {
  const stars = [
    { id: 'old', userId: 'me', message: '较早的留言', createdAt: '2026-08-20T08:00:00.000Z' },
    { id: 'other', userId: 'you', message: '别人的留言', createdAt: '2026-08-29T08:00:00.000Z' },
    { id: 'empty', userId: 'me', message: '   ', createdAt: '2026-08-28T08:00:00.000Z' },
    { id: 'new', userId: 'me', message: '最新的留言', createdAt: '2026-08-27T08:00:00.000Z' },
  ]

  assert.deepEqual(getMyMessages(stars, 'me').map((star) => star.id), ['new', 'old'])
})

test('星星详情提供我的入口并接入全屏留言页', () => {
  const starrySky = readFileSync(starrySkyUrl, 'utf8')
  const page = readFileSync(pageUrl, 'utf8')

  assert.match(starrySky, /import MyMessagesPage from '\.\/MyMessagesPage'/)
  assert.match(starrySky, />\s*我的\s*</)
  assert.match(starrySky, /<MyMessagesPage[\s\S]*stars=\{stars\}[\s\S]*userId=\{userId\}[\s\S]*onBack=/)
  assert.match(page, /getMyMessages\(stars, userId\)/)
  assert.match(page, /我的留言/)
  assert.match(page, /还没有留下留言/)
  assert.match(page, /返回星空/)
})
