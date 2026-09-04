import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readSource = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('两个主题欢迎页使用等宽的点亮星星、我的星星和星星之家按钮', () => {
  const welcome = readSource('src/components/Welcome/WelcomeScreen.tsx')
  const nicknameInput = readSource('src/components/Welcome/NicknameInput.tsx')
  const themeConfig = readSource('src/themes/themeConfig.ts')

  assert.doesNotMatch(welcome, /theme\.welcome\.enterLabel/)
  assert.match(nicknameInput, /grid grid-cols-3/)
  assert.match(nicknameInput, /theme\.nickname\.submitLabel/)
  assert.match(nicknameInput, />\s*我的星星\s*</)
  assert.match(nicknameInput, /我的星星[\s\S]*星星之家/)
  assert.match(nicknameInput, /submitNickname\('star-messages'\)/)
  assert.match(nicknameInput, /onSubmit\(value, target\)/)
  assert.equal((themeConfig.match(/submitLabel: '点亮星星'/g) ?? []).length, 2)
})

test('我的星星复用星空内的我的留言页面', () => {
  const app = readSource('src/App.tsx')
  const starrySky = readSource('src/components/StarrySky/StarrySky.tsx')

  assert.match(app, /setStarrySkyInitialView\(destination\)/)
  assert.match(app, /<NicknameInput[\s\S]*onSubmit=\{handleNicknameSubmit\}/)
  assert.match(app, /<StarrySky[\s\S]*initialView=\{starrySkyInitialView\}/)
  assert.match(starrySky, /initialView\?: 'stars' \| 'my-messages' \| 'star-messages'/)
  assert.match(starrySky, /useState\(initialView === 'my-messages'\)/)
  assert.match(starrySky, /setIsMyMessagesOpen\(initialView === 'my-messages'\)/)
})

test('星空内只保留与欢迎页同款且不带加号的点亮星星按钮', () => {
  const nicknameInput = readSource('src/components/Welcome/NicknameInput.tsx')
  const starrySky = readSource('src/components/StarrySky/StarrySky.tsx')

  assert.doesNotMatch(starrySky, /<span>星星之家<\/span>/)
  assert.doesNotMatch(starrySky, /<Plus className=/)
  assert.match(starrySky, /data-sky-create-button[\s\S]*?rounded-xl px-3 py-3 font-semibold/)
  assert.match(nicknameInput, /type="submit"[\s\S]*?rounded-xl px-3 py-3 font-semibold/)
})

test('删除旧入口后，两个主题共用的昵称操作区向上填补空白', () => {
  const app = readSource('src/App.tsx')

  assert.match(app, /id="nickname-input" className="[^"]*-mt-48[^"]*md:-mt-52/)
  assert.doesNotMatch(app, /id="nickname-input" className="[^"]*-mt-36/)
})

test('JIEYOU 欢迎页标题与两侧星星使用紫色系', () => {
  const welcome = readSource('src/components/Welcome/WelcomeScreen.tsx')
  const themeConfig = readSource('src/themes/themeConfig.ts')

  assert.match(themeConfig, /titleClass: 'text-purple-500'/)
  assert.match(welcome, /theme\.visual\.titleClass/)
  assert.match(welcome, /isLife \? 'text-amber-200' : 'text-purple-500'/)
  assert.match(welcome, /isLife \? 'text-orange-300' : 'text-purple-500'/)
})
