import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appearanceUrl = new URL('../src/components/StarrySky/starAppearance.ts', import.meta.url)
const modalUrl = new URL('../src/components/StarrySky/CreateStarModal.tsx', import.meta.url)

test('随机外观生成合法颜色、20–36px 整数大小，并排除需要用户自选的星座', async () => {
  let appearanceModule: Record<string, any> | undefined
  try {
    appearanceModule = await import(appearanceUrl.href)
  } catch {}

  assert.equal(typeof appearanceModule?.createRandomStarAppearance, 'function')
  assert.equal(Array.isArray(appearanceModule?.RANDOM_STAR_APPEARANCE_SHAPES), true)
  const zodiacShapes = [
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ]
  zodiacShapes.forEach((shape) => {
    assert.equal(appearanceModule!.RANDOM_STAR_APPEARANCE_SHAPES.includes(shape), false)
    assert.equal(appearanceModule!.STAR_APPEARANCE_SHAPES.includes(shape), true)
  })
  const values = [0, 0.5, 0.999999]
  const result = appearanceModule!.createRandomStarAppearance(() => values.shift() ?? 0)

  assert.equal(result.color, appearanceModule!.STAR_APPEARANCE_COLORS[0])
  assert.equal(result.size, 28)
  assert.equal(result.shape, appearanceModule!.RANDOM_STAR_APPEARANCE_SHAPES.at(-1))
  assert.match(result.color, /^#[0-9A-F]{6}$/)
  assert.ok(Number.isInteger(result.size) && result.size >= 20 && result.size <= 36)
})

test('创建弹窗每次打开都会随机外观，但编辑模式保持原值', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /createRandomStarAppearance/)
  assert.match(source, /if \(!open \|\| mode !== 'create'\) return/)
  assert.match(source, /setColor\(appearance\.color\)/)
  assert.match(source, /setSize\(appearance\.size\)/)
  assert.match(source, /setShape\(appearance\.shape\)/)
})
