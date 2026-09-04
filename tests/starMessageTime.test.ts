import assert from 'node:assert/strict'
import test from 'node:test'

const timeModuleUrl = new URL('../src/components/StarrySky/starMessageTime.ts', import.meta.url)

test('时间详情开启时显示完整日期时间，隐藏时仅显示年月', async () => {
  let timeModule: Record<string, any> | undefined
  try {
    timeModule = await import(timeModuleUrl.href)
  } catch {}

  assert.equal(typeof timeModule?.formatStarMessageTime, 'function')
  const timestamp = '2026-09-03T22:41:00'
  assert.equal(timeModule!.formatStarMessageTime(timestamp, false), '2026年9月')
  assert.match(timeModule!.formatStarMessageTime(timestamp, true), /2026年9月3日/)
})

test('无效时间保持原文字，避免卡片显示 Invalid Date', async () => {
  let timeModule: Record<string, any> | undefined
  try {
    timeModule = await import(timeModuleUrl.href)
  } catch {}

  assert.equal(typeof timeModule?.formatStarMessageTime, 'function')
  assert.equal(timeModule!.formatStarMessageTime('未知时间', false), '未知时间')
})
