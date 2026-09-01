import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  HAPPINESS_KEYWORDS,
  analyzeHappinessPortrait,
  isHappinessPortraitCloseKey,
  normalizeHappinessText,
  resolveSelectedHappinessKeyword,
  restoreHappinessPortraitFocus,
} from '../src/components/StarrySky/happinessPortrait.ts'

const star = (id: string, message: string, createdAt = '2026-08-31T08:00:00.000Z') => ({
  id,
  nickname: `用户${id}`,
  message,
  createdAt,
})

test('规范化全角字符、大小写、空白和标点', () => {
  assert.equal(normalizeHappinessText(' ＡＢＣ 小 猫，朋\n友！'), 'abc小猫朋友')
})

test('十二类幸福词典均能从同义表达中命中', () => {
  const messages = [
    '有人一直陪着我', '今天和妈妈吃饭', '见到了老同学', '小猫跑来迎接',
    '喝到一杯热茶', '耳机播放喜欢的歌曲', '晚霞铺满天空', '终于睡到自然醒',
    '坚持之后终于做到了', '收到久违的问候', '为生日认真庆祝', '一个人自在散步',
  ]
  const result = analyzeHappinessPortrait(messages.map((message, index) => star(String(index), message)))

  assert.deepEqual(
    result.keywords.map(({ label }) => label).sort(),
    HAPPINESS_KEYWORDS.map(({ label }) => label).sort(),
  )
})

test('每颗星对同一关键词只计一次，同时允许命中多个关键词', () => {
  const result = analyzeHappinessPortrait([
    star('a', '朋友陪着我一起散步，朋友的拥抱让我很自在'),
    star('b', '和朋友一起喝热茶'),
  ])
  const byLabel = Object.fromEntries(result.keywords.map((item) => [item.label, item.count]))

  assert.equal(byLabel.陪伴, 2)
  assert.equal(byLabel.朋友, 2)
  assert.equal(byLabel.自由, 1)
  assert.equal(byLabel.美食, 1)
})

test('按命中星星数降序并以词典顺序稳定排序，最多返回十二项', () => {
  const result = analyzeHappinessPortrait([
    star('a', '妈妈和朋友陪着我一起听音乐看晚霞，抱着小猫吃早餐后睡觉休息，努力成长收到问候，为生日庆祝，自在散步'),
    star('b', '妈妈陪着我'),
  ])

  assert.equal(result.keywords.length, 12)
  assert.deepEqual(result.keywords.slice(0, 2).map(({ label }) => label), ['陪伴', '家人'])
})

test('不足十二项时展示全部，并稳定选取最新三条代表留言', () => {
  const result = analyzeHappinessPortrait([
    star('d', '朋友发来消息', 'not-a-date'),
    star('c', '老朋友见面', '2026-08-31T09:00:00.000Z'),
    star('b', '朋友一起散步', '2026-08-31T10:00:00.000Z'),
    star('a', '朋友一起吃饭', '2026-08-31T10:00:00.000Z'),
  ])
  const friends = result.keywords.find(({ label }) => label === '朋友')

  assert.ok(result.keywords.length < 12)
  assert.deepEqual(friends?.representatives.map(({ id }) => id), ['a', 'b', 'c'])
})

test('空留言不计入总数，无词典命中时保留留言数并返回空关键词', () => {
  assert.deepEqual(analyzeHappinessPortrait([]), { messageCount: 0, keywords: [] })
  assert.deepEqual(analyzeHappinessPortrait([star('blank', '   ')]), { messageCount: 0, keywords: [] })

  const noMatch = analyzeHappinessPortrait([star('plain', '今天发生了一件难以形容的事情')])
  assert.equal(noMatch.messageCount, 1)
  assert.deepEqual(noMatch.keywords, [])
})

test('关键词刷新后保留有效选择，否则回退最高频词或清空', () => {
  const keywords = [{ label: '陪伴' }, { label: '朋友' }]

  assert.equal(resolveSelectedHappinessKeyword('朋友', keywords), '朋友')
  assert.equal(resolveSelectedHappinessKeyword('音乐', keywords), '陪伴')
  assert.equal(resolveSelectedHappinessKeyword('音乐', []), null)
})

test('Escape 关闭判定与关闭后的焦点恢复可执行', () => {
  let focusCount = 0
  assert.equal(isHappinessPortraitCloseKey('Escape'), true)
  assert.equal(isHappinessPortraitCloseKey('Enter'), false)

  restoreHappinessPortraitFocus({ focus: () => { focusCount += 1 } })
  restoreHappinessPortraitFocus(null)
  assert.equal(focusCount, 1)
})

test('幸福星空节点的尺寸、字号与中心距离遵循词频排序', async () => {
  const layoutUrl = new URL('../src/components/StarrySky/happinessSkyLayout.ts', import.meta.url)
  assert.ok(existsSync(layoutUrl), 'happiness sky layout module must exist')

  const { HAPPINESS_SKY_POSITIONS, getHappinessNodeVisual } = await import(layoutUrl.href)
  const distances = HAPPINESS_SKY_POSITIONS.map(({ x, y }: { x: number; y: number }) => Math.hypot(x - 50, y - 50))
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b))

  const low = getHappinessNodeVisual(2, 2, 20, 5)
  const high = getHappinessNodeVisual(20, 2, 20, 0)
  assert.ok(high.ratio > low.ratio)
  assert.ok(high.diameter > low.diameter)
  assert.ok(high.fontSize > low.fontSize)
  assert.ok(Math.hypot(high.x - 50, high.y - 50) < Math.hypot(low.x - 50, low.y - 50))
})

test('幸福的模样使用全屏星空页面、正圆节点与按需留言面板', () => {
  const pageUrl = new URL('../src/components/StarrySky/HappinessSkyPage.tsx', import.meta.url)
  assert.ok(existsSync(pageUrl), 'happiness sky page must exist')
  const source = readFileSync(pageUrl, 'utf8')
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

  assert.match(source, /<main/)
  assert.match(source, /aria-labelledby="happiness-sky-title"/)
  assert.match(source, /onClick=\{onBack\}/)
  assert.match(source, /幸福的模样/)
  assert.doesNotMatch(source, /THE SHAPE OF HAPPINESS/)
  assert.equal(source.match(/data-happiness-title-star/g)?.length, 2)
  const header = source.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''
  assert.doesNotMatch(header, /从 \{analysis\.messageCount\} 颗星星里/)
  assert.match(source, /<div className="happiness-sky-summary">\s*从 \{analysis\.messageCount\} 颗星星里，看见 \{analysis\.keywords\.length\} 种幸福\s*<\/div>/)
  assert.match(source, /autoFocus/)
  assert.match(source, /useMemo\(\(\) => analyzeHappinessPortrait\(stars\), \[stars\]\)/)
  assert.match(source, /isHappinessPortraitCloseKey\(event\.key\)/)
  assert.match(source, /useState<string \| null>\(null\)/)
  assert.match(source, /getHappinessNodeVisual/)
  assert.match(source, /onPointerMove/)
  assert.match(source, /aria-pressed=\{selected\}/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /从 \{analysis\.messageCount\} 颗星星里，看见 \{analysis\.keywords\.length\} 种幸福/)
  assert.match(source, /这片星空正在慢慢长出幸福的模样/)
  assert.match(source, /幸福还没有名字，但它已经在这里发生/)
  assert.match(source, /selectedKeyword\.representatives\.slice\(0, 3\)/)
  assert.match(css, /\.happiness-sky-page/)
  assert.match(css, /\.happiness-sky-node/)
  assert.match(css, /width:\s*var\(--happiness-node-diameter\)/)
  assert.match(css, /height:\s*var\(--happiness-node-diameter\)/)
  assert.match(css, /border-radius:\s*50%/)
  assert.match(css, /font-size:\s*var\(--happiness-node-font-size\)/)
  assert.match(css, /perspective:/)
  assert.match(css, /\.happiness-sky-title-row/)
  assert.match(css, /\.happiness-sky-header h1\s*\{[\s\S]*?color:\s*#fff/)
  assert.match(css, /\.happiness-sky-header h1\s*\{[\s\S]*?font-weight:\s*900/)
  assert.match(css, /\.happiness-sky-summary\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('小工具仅在生命主题提供幸福的模样入口并挂载完整星星数据', () => {
  const sidebar = readFileSync(new URL('../src/components/StarrySky/AssistantSidebar.tsx', import.meta.url), 'utf8')
  const sky = readFileSync(new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url), 'utf8')

  assert.match(sidebar, /showHappinessPortrait: boolean/)
  assert.match(sidebar, /onOpenHappinessPortrait: \(\) => void/)
  assert.match(sidebar, /happinessPortraitTriggerRef: React\.Ref<HTMLButtonElement>/)
  assert.match(sidebar, /管理员模式[\s\S]*showHappinessPortrait &&[\s\S]*幸福的模样/)
  assert.match(sidebar, /ref=\{happinessPortraitTriggerRef\}/)
  assert.match(sidebar, /onClick=\{onOpenHappinessPortrait\}/)
  assert.match(sidebar, />查看</)

  assert.match(sky, /import HappinessSkyPage from '\.\/HappinessSkyPage'/)
  assert.match(sky, /const happinessPortraitTriggerRef = useRef<HTMLButtonElement>\(null\)/)
  assert.match(sky, /const \[isHappinessPortraitOpen, setIsHappinessPortraitOpen\] = useState\(false\)/)
  assert.match(sky, /showHappinessPortrait=\{theme\.id === 'life'\}/)
  assert.match(sky, /happinessPortraitTriggerRef=\{happinessPortraitTriggerRef\}/)
  assert.match(sky, /onOpenHappinessPortrait=\{handleOpenHappinessPortrait\}/)
  assert.match(sky, /restoreHappinessPortraitFocus\(happinessPortraitTriggerRef\.current\)/)
  assert.match(sky, /if \(isHappinessPortraitOpen && theme\.id === 'life'\) \{\s*return \(\s*<HappinessSkyPage/)
  assert.match(sky, /<HappinessSkyPage[\s\S]*stars=\{stars\}[\s\S]*onBack=\{handleCloseHappinessPortrait\}/)
  assert.doesNotMatch(sky, /HappinessPortraitDialog|<HappinessPortrait/)
})
