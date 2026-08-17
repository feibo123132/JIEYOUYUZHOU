import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getThemeConfig,
  getThemeHealthApiPath,
  getThemeStarApiPath,
  getThemeTodayCountApiPath,
  THEME_IDS,
  tryGetThemeConfig,
} from '../src/themes/themeConfig.ts'

test('the two themes use distinct content storage', () => {
  const jieyou = getThemeConfig('jieyou')
  const life = getThemeConfig('life')

  assert.deepEqual(THEME_IDS, ['jieyou', 'life'])
  assert.equal(jieyou.data.starsCollection, 'stars')
  assert.equal(life.data.starsCollection, 'life_stars')
  assert.equal(jieyou.data.petCollection, 'pet_stats')
  assert.equal(life.data.petCollection, 'life_pet_stats')
  assert.notEqual(jieyou.data.quotaStorageKey, life.data.quotaStorageKey)
})

test('life REST routes never fall back to generic JIEYOU endpoints', () => {
  assert.equal(getThemeStarApiPath('jieyou'), '/stars')
  assert.equal(getThemeStarApiPath('jieyou', 'star-1'), '/stars/star-1')
  assert.equal(getThemeStarApiPath('life'), '/themes/life/stars')
  assert.equal(getThemeStarApiPath('life', 'star-1'), '/themes/life/stars/star-1')
  assert.equal(getThemeHealthApiPath('life'), '/themes/life/health')
  assert.equal(getThemeTodayCountApiPath('life'), '/themes/life/stats/today')
})

test('runtime theme lookup rejects missing or unknown themes', () => {
  assert.equal(tryGetThemeConfig(null), null)
  assert.equal(tryGetThemeConfig('unknown'), null)
  assert.equal(tryGetThemeConfig('life')?.id, 'life')
})
