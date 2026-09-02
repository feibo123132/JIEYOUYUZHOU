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

test('同一昵称在新会话中仍能看到旧 userId 留下的历史留言', () => {
  const stars = [
    { id: 'legacy', userId: 'old-session', nickname: '肆无忌惮的薰衣草', message: '历史留言', createdAt: '2025-11-30T00:15:00.000Z' },
    { id: 'other', userId: 'other-session', nickname: '另一个人', message: '别人的留言', createdAt: '2025-12-01T00:15:00.000Z' },
  ]

  assert.deepEqual(
    getMyMessages(stars, 'new-session', '肆无忌惮的薰衣草').map((star) => star.id),
    ['legacy'],
  )
})

test('我的留言页仍由星空接入，但星星详情不再显示误导性的我的入口', () => {
  const starrySky = readFileSync(starrySkyUrl, 'utf8')
  const page = readFileSync(pageUrl, 'utf8')

  assert.match(starrySky, /import MyMessagesPage from '\.\/MyMessagesPage'/)
  assert.doesNotMatch(starrySky, />\s*我的\s*</)
  assert.match(starrySky, /<MyMessagesPage[\s\S]*stars=\{stars\}[\s\S]*userId=\{userId\}[\s\S]*onBack=/)
  assert.match(page, /getMyMessages\(stars, userId, nickname\)/)
  assert.match(page, /\{nickname\}的留言/)
  assert.match(page, /还没有留下留言/)
  assert.match(page, />\s*星空\s*</)
})

test('我的留言页透出全局动态星空并仅保留轻暗渐变', () => {
  const page = readFileSync(pageUrl, 'utf8')
  const sectionClass = page.match(/<section className="([^"]+)"/)?.[1] ?? ''

  assert.match(sectionClass, /\bbg-transparent\b/)
  assert.doesNotMatch(sectionClass, /backdrop-blur/)
  assert.doesNotMatch(sectionClass, /bg-\[#050506\]\/90/)
  assert.match(page, /linear-gradient\(rgba\(2, 2, 7, \.10\), rgba\(2, 2, 7, \.22\)\)/)
})

test('我的留言作为独立页面互斥渲染，不叠加星空主界面', () => {
  const starrySky = readFileSync(starrySkyUrl, 'utf8')
  const page = readFileSync(pageUrl, 'utf8')
  const sectionClass = page.match(/<section className="([^"]+)"/)?.[1] ?? ''

  assert.match(starrySky, /if \(isMyMessagesOpen\) \{[\s\S]*?return \([\s\S]*?<MyMessagesPage/)
  assert.doesNotMatch(starrySky, /\{isMyMessagesOpen && \(\s*<MyMessagesPage/)
  assert.match(starrySky, /\[barrageMode,\s*isMyMessagesOpen,\s*loadState,\s*sidebarOpen,\s*skyView\]/)
  assert.match(sectionClass, /\bmin-h-screen\b/)
  assert.doesNotMatch(sectionClass, /\bfixed\b/)
})

test('我的留言页使用用户名标题、精简返回文案和留言计数', () => {
  const page = readFileSync(pageUrl, 'utf8')

  assert.match(page, />\s*星空\s*</)
  assert.match(page, /\{nickname\}的留言/)
  assert.match(page, /那些在星空留下的思绪或回忆，似乎……让我看到了当时的自己/)
  assert.match(page, /\{messages\.length\}<span[^>]*>条<\/span>/)
  assert.doesNotMatch(page, />\s*返回星空\s*</)
  assert.doesNotMatch(page, /条留言/)
})

test('留言页可在简洁两列与宽大四列之间切换并记住选择', () => {
  const page = readFileSync(pageUrl, 'utf8')

  assert.match(page, /type MessageLayoutMode = 'simple' \| 'wide'/)
  assert.match(page, /localStorage\.getItem\(MESSAGE_LAYOUT_STORAGE_KEY\)/)
  assert.match(page, /localStorage\.setItem\(MESSAGE_LAYOUT_STORAGE_KEY, layoutMode\)/)
  assert.match(page, /aria-label="简洁版"/)
  assert.match(page, /aria-label="宽大版"/)
  assert.match(page, /layoutMode === 'wide' \? 'max-w-\[100rem\]' : 'max-w-5xl'/)
  assert.match(page, /layoutMode === 'wide' \? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'/)
})

test('星空返回键固定悬浮，滚动后仍可直接点击', () => {
  const page = readFileSync(pageUrl, 'utf8')
  const buttonClass = page.match(/aria-label="返回星空"[\s\S]*?className="([^"]+)"/)?.[1] ?? ''

  assert.match(buttonClass, /\bfixed\b/)
  assert.match(buttonClass, /\bz-50\b/)
  assert.match(buttonClass, /\btop-5\b/)
  assert.match(buttonClass, /\bleft-5\b/)
})
