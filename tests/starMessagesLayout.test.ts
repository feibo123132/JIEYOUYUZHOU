import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../src/components/StarrySky/StarMessagesPage.tsx', import.meta.url),
  'utf8',
)

test('星星之家删除个人化标题、布局开关和数量统计', () => {
  assert.doesNotMatch(source, /棋士的留言/)
  assert.doesNotMatch(source, /留言排版/)
  assert.doesNotMatch(source, /简洁版/)
  assert.doesNotMatch(source, /宽大版/)
  assert.doesNotMatch(source, /messages\.length\}<span/)
})

test('星语心愿使用星空同款顶部居中标题与两侧闪光标志', () => {
  assert.match(source, /data-star-messages-title/)
  assert.match(source, /top-4 left-1\/2 -translate-x-1\/2/)
  assert.match(source, /<Sparkles[\s\S]*?<h1[^>]*text-2xl md:text-4xl[^>]*>\s*星语心愿\s*<\/h1>[\s\S]*?<Sparkles/)
})

test('星星之家固定使用宽屏四列展示以释放空间', () => {
  assert.match(source, /max-w-\[100rem\]/)
  assert.match(source, /sm:grid-cols-2 xl:grid-cols-4/)
  assert.doesNotMatch(source, /layoutMode/)
})

test('不同长度留言的时间和用户信息固定对齐在卡片底部', () => {
  assert.match(source, /<article[\s\S]*?className="[^"]*flex[^"]*flex-col[^"]*"/)
  assert.match(source, /className="mt-auto flex items-center justify-between border-t/)
})

test('星语心愿使用同款猫咪助手栏切换时间详情且默认显示', () => {
  assert.match(source, /const \[showTimeDetails, setShowTimeDetails\] = useState\(true\)/)
  assert.match(source, /aria-label="打开助手栏"/)
  assert.match(source, /breath-slow/)
  assert.match(source, /💪 助手栏/)
  assert.match(source, /showTimeDetails \? '隐藏' : '显示'/)
  assert.match(source, /formatStarMessageTime\(star\.createdAt, showTimeDetails\)/)
})
