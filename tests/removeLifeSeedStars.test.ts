import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const seedModuleUrl = new URL('../src/components/StarrySky/lifeSeedStars.ts', import.meta.url)
const skyUrl = new URL('../src/components/StarrySky/StarrySky.tsx', import.meta.url)
const welcomeUrl = new URL('../src/components/Welcome/WelcomeScreen.tsx', import.meta.url)

test('此前生成的 100 颗内置星星已从应用中完全移除', () => {
  assert.equal(existsSync(seedModuleUrl), false)

  const source = `${readFileSync(skyUrl, 'utf8')}\n${readFileSync(welcomeUrl, 'utf8')}`
  assert.doesNotMatch(source, /lifeSeedStars|LIFE_SEED_STARS|mergeLifeSeedStars|isLifeSeedStar|life-seed-/)
})
