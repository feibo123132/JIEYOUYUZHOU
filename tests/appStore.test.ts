import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import useAppStore from '../src/store/appStore.ts'

test('theme navigation updates theme and view atomically', () => {
  useAppStore.setState({ user: null, stars: [] })
  useAppStore.getState().returnToThemeHub()

  assert.equal(useAppStore.getState().currentView, 'theme-hub')
  assert.equal(useAppStore.getState().activeTheme, null)

  useAppStore.getState().enterTheme('life')
  assert.equal(useAppStore.getState().currentView, 'welcome')
  assert.equal(useAppStore.getState().activeTheme, 'life')

  useAppStore.getState().enterStarrySky()
  assert.equal(useAppStore.getState().currentView, 'starry-sky')
  assert.equal(useAppStore.getState().activeTheme, 'life')
})

test('entering the starry sky without a theme returns to the hub', () => {
  useAppStore.setState({ activeTheme: null, currentView: 'theme-hub' })
  useAppStore.getState().enterStarrySky()

  assert.equal(useAppStore.getState().currentView, 'theme-hub')
  assert.equal(useAppStore.getState().activeTheme, null)
})

test('returning to the hub preserves identity and clears theme stars', () => {
  const user = { id: 'u1', nickname: '星光', isAuthenticated: false }
  useAppStore.setState({
    activeTheme: 'jieyou',
    currentView: 'starry-sky',
    user,
    stars: [{ id: 's1', x: 10, y: 20, nickname: '星光', createdAt: '2026-08-17' }],
  })

  useAppStore.getState().returnToThemeHub()

  assert.deepEqual(useAppStore.getState().user, user)
  assert.deepEqual(useAppStore.getState().stars, [])
  assert.equal(useAppStore.getState().currentView, 'theme-hub')
  assert.equal(useAppStore.getState().activeTheme, null)
})

test('keepsake studio navigation changes only the current view', () => {
  const user = { id: 'u2', nickname: '留影者', isAuthenticated: false }
  const stars = [{ id: 's2', x: 24, y: 36, nickname: '留影者', createdAt: '2026-08-23' }]
  useAppStore.setState({ activeTheme: 'life', currentView: 'welcome', user, stars })

  useAppStore.getState().enterKeepsakeStudio()

  assert.equal(useAppStore.getState().currentView, 'keepsake-studio')
  assert.equal(useAppStore.getState().activeTheme, 'life')
  assert.deepEqual(useAppStore.getState().user, user)
  assert.deepEqual(useAppStore.getState().stars, stars)

  useAppStore.getState().returnToThemeHub()
  assert.equal(useAppStore.getState().currentView, 'theme-hub')
})

test('homepage exposes a first-class keepsake studio entry', () => {
  const hubSource = readFileSync(new URL('../src/components/Theme/ThemeHub.tsx', import.meta.url), 'utf8')
  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(hubSource, /onOpenKeepsake/)
  assert.match(hubSource, /MEMORY STUDIO/)
  assert.match(hubSource, />留影</)
  assert.match(appSource, /currentView === 'keepsake-studio'/)
})
