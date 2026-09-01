import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mainUrl = new URL('../src/main.tsx', import.meta.url)

test('主应用只为真正可交互控件播放全局音效并防止重复播放', () => {
  const source = readFileSync(mainUrl, 'utf8')
  const interactionSelector = source.match(/const INTERACTION_SOUND_SELECTOR = '([^']+)'/)?.[1]

  assert.match(source, /document\.addEventListener\('click', handleGlobalClickSound, true\)/)
  assert.match(source, /document\.addEventListener\('keydown', handleGlobalKeySound, true\)/)
  assert.match(source, /closest\(INTERACTION_SOUND_SELECTOR\)/)
  assert.match(source, /if \(!target\) return/)
  assert.match(source, /event\.repeat/)
  assert.match(source, /producesClick/)
  assert.match(source, /delegatedSoundDispatch/)
  assert.match(source, /queueMicrotask/)
  assert.ok(interactionSelector)
  assert.match(interactionSelector, /button/)
  assert.match(interactionSelector, /a\[href\]/)
  assert.match(interactionSelector, /select/)
  assert.doesNotMatch(interactionSelector, /textarea/)
  assert.doesNotMatch(interactionSelector, /(^|,\s*)input(\s*,|$)/)
})

test('主应用只负责自身文档，独立撸猫页面不注入全局音效', () => {
  const source = readFileSync(mainUrl, 'utf8')

  assert.doesNotMatch(source, /meow-generator/)
  assert.doesNotMatch(source, /contentDocument|contentWindow/)
})
