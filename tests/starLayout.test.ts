import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveStarLayout, type LayoutOptions, type LayoutPosition, type LayoutStarInput } from '../src/utils/starLayout.ts'

const centerDistance = (
  first: LayoutPosition,
  second: LayoutPosition,
  width: number,
  height: number,
) => Math.hypot(
  ((first.x - second.x) / 100) * width,
  ((first.y - second.y) / 100) * height,
)

test('separates coincident stars with their glow gap when space is available', () => {
  const width = 800
  const height = 600
  const result = resolveStarLayout([
    { id: 'a', x: 50, y: 50, size: 36 },
    { id: 'b', x: 50, y: 50, size: 36 },
    { id: 'c', x: 50, y: 50, size: 36 },
  ], { width, height, blockedZones: [] })

  for (let first = 0; first < result.length; first += 1) {
    for (let second = first + 1; second < result.length; second += 1) {
      assert.ok(
        centerDistance(result[first], result[second], width, height) >= 52 - 0.01,
        `${result[first].id} and ${result[second].id} should retain their icon and glow gap`,
      )
    }
  }
})

test('returns the same layout for identical inputs', () => {
  const stars: LayoutStarInput[] = [
    { id: 'alpha', x: 48, y: 52, size: 30 },
    { id: 'beta', x: 49, y: 52, size: 24 },
    { id: 'gamma', x: 50, y: 52, size: 36 },
  ]
  const options: LayoutOptions = {
    width: 960,
    height: 540,
    blockedZones: [{ left: 0, top: 0, right: 180, bottom: 70 }],
  }

  assert.deepEqual(resolveStarLayout(stars, options), resolveStarLayout(stars, options))
})

test('assigns the same position to each id regardless of input order', () => {
  const stars: LayoutStarInput[] = [
    { id: 'alpha', x: 50, y: 50, size: 36 },
    { id: 'beta', x: 50, y: 50, size: 36 },
    { id: 'gamma', x: 50, y: 50, size: 36 },
  ]
  const options: LayoutOptions = { width: 800, height: 600, blockedZones: [] }
  const byId = (positions: LayoutPosition[]) => Object.fromEntries(
    positions.map(({ id, x, y }) => [id, { x, y }]),
  )

  assert.deepEqual(
    byId(resolveStarLayout(stars, options)),
    byId(resolveStarLayout([...stars].reverse(), options)),
  )
})

test('keeps an isolated star inside the field and outside radius-expanded blocked zones', () => {
  const width = 600
  const height = 400
  const iconRadius = 18
  const blockedZone = { left: 250, top: 150, right: 350, bottom: 250 }
  const [result] = resolveStarLayout(
    [{ id: 'solo', x: 50, y: 50, size: 36 }],
    { width, height, blockedZones: [blockedZone] },
  )
  const x = (result.x / 100) * width
  const y = (result.y / 100) * height

  assert.ok(x >= iconRadius && x <= width - iconRadius)
  assert.ok(y >= iconRadius && y <= height - iconRadius)
  assert.ok(
    x <= blockedZone.left - iconRadius
      || x >= blockedZone.right + iconRadius
      || y <= blockedZone.top - iconRadius
      || y >= blockedZone.bottom + iconRadius,
    'star center should be outside the blocked rectangle expanded by its radius',
  )
})

test('moves a star outside the union of overlapping blocked zones', () => {
  const width = 600
  const height = 400
  const radius = 10
  const zones = [
    { left: 200, top: 150, right: 320, bottom: 250 },
    { left: 280, top: 150, right: 400, bottom: 250 },
  ]
  const [result] = resolveStarLayout(
    [{ id: 'solo', x: 50, y: 50, size: 20 }],
    { width, height, blockedZones: zones },
  )
  const x = (result.x / 100) * width
  const y = (result.y / 100) * height

  zones.forEach((zone) => {
    assert.ok(
      x <= zone.left - radius
        || x >= zone.right + radius
        || y <= zone.top - radius
        || y >= zone.bottom + radius,
      'star should be outside every radius-expanded blocked zone',
    )
  })
})

test('does not mutate input stars or blocked rectangles', () => {
  const stars: LayoutStarInput[] = [
    { id: 'one', x: 50, y: 50, size: 36 },
    { id: 'two', x: 50, y: 50, size: 28 },
  ]
  const options: LayoutOptions = {
    width: 800,
    height: 600,
    blockedZones: [{ left: 10, top: 20, right: 100, bottom: 80 }],
  }
  const snapshot = structuredClone({ stars, options })

  resolveStarLayout(stars, options)

  assert.deepEqual({ stars, options }, snapshot)
})
