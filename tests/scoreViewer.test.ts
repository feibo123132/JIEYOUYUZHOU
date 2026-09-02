import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const scoreViewerUrl = new URL('../src/components/SongRequest/ScoreViewer.tsx', import.meta.url)
const scoreZoomUrl = new URL('../src/components/SongRequest/scoreViewerZoom.ts', import.meta.url)

test('score viewer isolates iPad gestures from page zoom and renders in the document top layer', () => {
  const source = readFileSync(scoreViewerUrl, 'utf8')

  assert.match(source, /import \{ createPortal \} from 'react-dom'/)
  assert.match(source, /createPortal\([\s\S]*document\.body/)
  assert.match(source, /touchAction: 'pan-x pan-y'/)
  assert.match(source, /overscrollBehavior: 'none'/)
  assert.match(source, /\bbg-black\b/)
  assert.doesNotMatch(source, /bg-black\/97/)
})

test('score zoom keeps the image proportional and supports steps, fit-width, and pinch scaling', async () => {
  assert.equal(existsSync(scoreZoomUrl), true, 'score zoom math module should exist')
  const {
    clampScoreZoom,
    getFittedScoreSize,
    getPinchScoreZoom,
    getReadingScoreZoom,
    stepScoreZoom,
  } = await import(scoreZoomUrl.href)

  assert.equal(clampScoreZoom(0.4), 1)
  assert.equal(clampScoreZoom(8), 5)
  assert.equal(stepScoreZoom(1, 1), 1.5)
  assert.equal(stepScoreZoom(1, -1), 1)
  assert.deepEqual(getFittedScoreSize(
    { width: 1200, height: 1600 },
    { width: 800, height: 2400 },
  ), { width: 533.3333333333333, height: 1600 })
  assert.equal(getReadingScoreZoom(
    { width: 1200, height: 1600 },
    { width: 800, height: 2400 },
  ), 2.25)
  assert.equal(getPinchScoreZoom(2, 100, 150), 3)
})

test('score viewer offers buttons, double-click fit-width, pinch zoom, and native scrolling without stretching', () => {
  const source = readFileSync(scoreViewerUrl, 'utf8')

  assert.match(source, /getReadingScoreZoom/)
  assert.match(source, /onDoubleClick=\{toggleReadingZoom\}/)
  assert.match(source, /onTouchMove=\{onTouchMove\}/)
  assert.match(source, /aria-label="缩小谱子"/)
  assert.match(source, /aria-label="恢复适应屏幕"/)
  assert.match(source, /aria-label="放大谱子"/)
  assert.match(source, /overflow-auto/)
  assert.match(source, /width: displaySize\.width/)
  assert.match(source, /height: displaySize\.height/)
  assert.doesNotMatch(source, /items-stretch/)
})
