import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const viteConfigUrl = new URL('../vite.config.ts', import.meta.url)
const packageJsonUrl = new URL('../package.json', import.meta.url)

test('production build does not inject the TRAE SOLO badge', () => {
  const viteConfig = readFileSync(viteConfigUrl, 'utf8')
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf8'))

  assert.doesNotMatch(viteConfig, /traeBadgePlugin|vite-plugin-trae-solo-badge/)
  assert.equal(packageJson.devDependencies?.['vite-plugin-trae-solo-badge'], undefined)
})
