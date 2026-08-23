import assert from 'node:assert/strict'
import test from 'node:test'

import {
  KEEPSAKE_FRAMES,
  KEEPSAKE_HEIGHT,
  KEEPSAKE_WIDTH,
  PHOTO_WINDOW,
  clampPhotoTransform,
  getCoverTransform,
  normalizeKeepsakeText,
  renderKeepsake,
  wrapCanvasText,
} from '../src/components/Keepsake/keepsakeCanvas.ts'

test('defines three complete, stable and data-driven frame configurations', () => {
  assert.deepEqual(KEEPSAKE_FRAMES.map((frame) => frame.id), ['warm-paper', 'midnight-map', 'cream-collage'])
  for (const frame of KEEPSAKE_FRAMES) {
    assert.ok(frame.name)
    assert.ok(frame.palette.paper)
    assert.ok(frame.palette.ink)
    assert.ok(frame.palette.accent)
    assert.ok(frame.typography.titleY > PHOTO_WINDOW.y + PHOTO_WINDOW.height)
    assert.ok(frame.typography.bodyY > frame.typography.titleY)
    assert.ok(frame.decorations.length > 0)
  }
})

test('normalizes text while retaining explicit newlines and field limits', () => {
  assert.equal(normalizeKeepsakeText('title', '一'.repeat(20)), '一'.repeat(18))
  assert.equal(normalizeKeepsakeText('body', `第一行\n${'二'.repeat(78)}`), `第一行\n${'二'.repeat(76)}`)
  assert.equal(normalizeKeepsakeText('signature', '署'.repeat(20)), '署'.repeat(16))
  assert.equal(normalizeKeepsakeText('body', '第一行\n'), '第一行\n')
  assert.equal(normalizeKeepsakeText('title', '  今日留影  '), '  今日留影  ')
})

test('wraps explicit and measured lines and ellipsizes the final line', () => {
  const ctx = { measureText: (text: string) => ({ width: Array.from(text).length * 10 }) }
  assert.deepEqual(wrapCanvasText(ctx, '一二三\n四五六', 25, 3), ['一二', '三', '四…'])
  assert.deepEqual(wrapCanvasText(ctx, '一二三四五六', 30, 1), ['一二…'])
})

test('cover transform handles landscape and portrait sources', () => {
  const landscape = getCoverTransform({ width: 2000, height: 1000 }, 1, { x: 0, y: 0 })
  assert.equal(landscape.scale, 0.98)
  assert.equal(landscape.height, PHOTO_WINDOW.height)
  assert.equal(landscape.x, -380)

  const portrait = getCoverTransform({ width: 800, height: 1600 }, 1, { x: 0, y: 0 })
  assert.equal(portrait.scale, 1.275)
  assert.equal(portrait.width, PHOTO_WINDOW.width)
  assert.equal(portrait.y, -345)
})

test('clamps zoom and pan so the photo always covers the window', () => {
  const low = clampPhotoTransform({ width: 2000, height: 1000 }, 0.2, { x: 9999, y: -9999 })
  assert.equal(low.zoom, 1)
  assert.deepEqual(low.pan, { x: 470, y: 0 })

  const high = clampPhotoTransform({ width: 800, height: 1600 }, 9, { x: -9999, y: 9999 })
  assert.equal(high.zoom, 3)
  assert.deepEqual(high.pan, { x: -1020, y: 2570 })
})

test('renderer uses selected frame configuration and fixed output geometry', () => {
  const calls: Array<{ name: string; args: unknown[]; fillStyle?: string }> = []
  const ctx = new Proxy({
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    globalAlpha: 1,
    measureText: (text: string) => ({ width: Array.from(text).length * 24 }),
  }, {
    get(target, key: string) {
      if (key in target) return (target as Record<string, unknown>)[key]
      return (...args: unknown[]) => calls.push({ name: key, args, fillStyle: target.fillStyle })
    },
    set(target, key: string, value) {
      (target as Record<string, unknown>)[key] = value
      return true
    },
  })

  const frame = KEEPSAKE_FRAMES[1]
  renderKeepsake(ctx, {
    frameId: frame.id,
    image: null,
    imageSize: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    title: '今晚的星光',
    body: '愿这一刻被好好收藏。',
    date: '2026-08-23',
    signature: 'JIEYOU',
  })

  assert.equal(KEEPSAKE_WIDTH, 1200)
  assert.equal(KEEPSAKE_HEIGHT, 1600)
  assert.ok(calls.some((call) => call.name === 'fillRect' && call.fillStyle === frame.palette.paper))
  assert.ok(calls.some((call) => call.name === 'fillText' && call.args[0] === '今晚的星光' && call.args[2] === frame.typography.titleY))
  assert.ok(calls.some((call) => call.name === 'arc' || call.name === 'lineTo'))
})
