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

test('keepsake studio is opened from Meow Generator instead of a duplicate homepage card', () => {
  const hubSource = readFileSync(new URL('../src/components/Theme/ThemeHub.tsx', import.meta.url), 'utf8')
  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(hubSource, /onOpenKeepsake/)
  assert.doesNotMatch(hubSource, /MEMORY STUDIO/)
  assert.doesNotMatch(hubSource, /进入留影工坊/)
  assert.match(appSource, /view.*keepsake/)
  assert.match(appSource, /enterKeepsakeStudio\(\)/)
  assert.match(appSource, /currentView === 'keepsake-studio'/)
})

test('song request navigation changes only the current view', () => {
  const user = { id: 'u3', nickname: '点歌人', isAuthenticated: false }
  useAppStore.setState({ activeTheme: 'jieyou', currentView: 'welcome', user })

  useAppStore.getState().enterSongRequestStation()

  assert.equal(useAppStore.getState().currentView, 'song-request')
  assert.equal(useAppStore.getState().activeTheme, 'jieyou')
  assert.deepEqual(useAppStore.getState().user, user)
})

test('homepage exposes a first-class song request entry', () => {
  const hubSource = readFileSync(new URL('../src/components/Theme/ThemeHub.tsx', import.meta.url), 'utf8')
  const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

  assert.match(hubSource, /onOpenSongRequest/)
  assert.match(hubSource, /SONG REQUEST/)
  assert.match(hubSource, />点歌台</)
  assert.match(appSource, /currentView === 'song-request'/)
})

test('all four homepage cards share one responsive size contract', () => {
  const hubSource = readFileSync(new URL('../src/components/Theme/ThemeHub.tsx', import.meta.url), 'utf8')

  assert.match(hubSource, /const HUB_CARD_SIZE_CLASS = 'h-\[300px\] md:h-\[310px\]'/)
  assert.equal(hubSource.match(/\$\{HUB_CARD_SIZE_CLASS\}/g)?.length, 3)
  assert.doesNotMatch(hubSource, /min-h-36/)
})

test('all four homepage cards share the compact content rhythm', () => {
  const hubSource = readFileSync(new URL('../src/components/Theme/ThemeHub.tsx', import.meta.url), 'utf8')

  assert.match(hubSource, /const HUB_CARD_CONTENT_CLASS = 'relative flex h-full flex-col gap-5'/)
  assert.equal(hubSource.match(/\{HUB_CARD_CONTENT_CLASS\}/g)?.length, 3)
  assert.doesNotMatch(hubSource, /justify-between gap-16/)
})
