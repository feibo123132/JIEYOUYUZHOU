import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const starrySkyUrl = new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url)

test('星星视图默认随机部分，留言弹幕默认完全展示并开启填充模式', () => {
  const source = readFileSync(starrySkyUrl, 'utf8')

  assert.match(source, /const \[starDisplayMode, setStarDisplayMode\] = useState<'random' \| 'full'>\('random'\)/)
  assert.match(source, /const \[messageDisplayMode, setMessageDisplayMode\] = useState<'random' \| 'full'>\('full'\)/)
  assert.match(source, /const displayMode = skyView === 'messages' \? messageDisplayMode : starDisplayMode/)
  assert.match(source, /if \(skyView === 'messages'\) setMessageDisplayMode\(mode\)/)
  assert.match(source, /else setStarDisplayMode\(mode\)/)
  assert.match(source, /onChangeDisplayMode=\{handleDisplayModeChange\}/)
  assert.match(source, /return visibleStars\.flatMap/)
  assert.match(source, /const createInitialStarrySkyBarragePreferences = \(\) => \(\{[\s\S]*fill: true/)
  assert.match(source, /useState\(createInitialStarrySkyBarragePreferences\)/)
  assert.match(source, /setBarragePreferences\(createInitialStarrySkyBarragePreferences\(\)\)/)
})
