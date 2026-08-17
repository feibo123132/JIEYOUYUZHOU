import assert from 'node:assert/strict'
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
