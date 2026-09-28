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
  assert.match(source, /aria-label="放大谱子"/)
  assert.doesNotMatch(source, /aria-label="恢复适应屏幕"/)
  assert.doesNotMatch(source, /RotateCcw/)
  assert.match(source, /overflow-auto/)
  assert.match(source, /width: displaySize\.width/)
  assert.match(source, /height: displaySize\.height/)
  assert.doesNotMatch(source, /items-stretch/)
})

test('score viewer keeps mobile chrome compact around the score image', () => {
  const source = readFileSync(scoreViewerUrl, 'utf8')

  assert.doesNotMatch(source, /<header/)
  assert.doesNotMatch(source, /专属谱子/)
  assert.match(source, /absolute right-3 top-3/)
  assert.match(source, /<footer className="flex shrink-0 items-center justify-center gap-3 px-3 py-1\.5/)
  assert.doesNotMatch(source, /w-full sm:w-auto/)
})

test('score viewer auto-scroll uses visible speed tiers with a timer fallback', () => {
  const source = readFileSync(scoreViewerUrl, 'utf8')

  assert.match(source, /AUTO_SCROLL_PIXELS_PER_SECOND/)
  assert.match(source, /autoScrollRemainderRef/)
  assert.match(source, /window\.setInterval\(\(\) => \{ advance\(performance\.now\(\)\); \}, 180\)/)
  assert.match(source, /requestAnimationFrame\(tick\)/)
})

const viewerSource = readFileSync(scoreViewerUrl, 'utf8')
const readSpeedRecord = (name: string) => {
  const record = viewerSource.match(new RegExp(`const ${name}[^=]*=\\s*(\\{[\\s\\S]*?\\n\\});`))
  assert.ok(record)
  return new Function(`return (${record[1]});`)()
}

test('auto-scroll offers five fixed speeds and selects a requested tier directly', () => {
  const speeds = readSpeedRecord('AUTO_SCROLL_PIXELS_PER_SECOND')
  const labels = readSpeedRecord('AUTO_SCROLL_SPEED_LABELS')
  assert.deepEqual(speeds, { 1: 10, 2: 13, 3: 16, 4: 19, 5: 22 })
  assert.deepEqual(Object.values(labels), ['自动', '很慢', '慢', '中', '快', '很快'])
  const selection = viewerSource.match(/const selectAutoScrollSpeed = \(speed: AutoScrollSpeed\) => \{([\s\S]*?)\n  \};/)
  assert.ok(selection, 'the speed menu must select a tier without cycling')
  const select = new Function('speed', 'setAutoScrollSpeed', 'setAutoScrollMenuOpen', 'autoScrollButtonRef', selection[1])
  let speed = 5
  let menuOpen = true
  let focusCount = 0
  for (const requested of [2, 5, 1, 0]) {
    menuOpen = true
    select(requested, (value: number) => { speed = value }, (value: boolean) => { menuOpen = value },
      { current: { focus: () => { focusCount += 1 } } })
    assert.equal(speed, requested)
    assert.equal(menuOpen, false)
  }
  assert.equal(speed, 0)
  assert.equal(focusCount, 4)
})

test('actual scrolling keeps each fixed pixel speed at 100%, 300% and 500% zoom', () => {
  const speeds = readSpeedRecord('AUTO_SCROLL_PIXELS_PER_SECOND')
  const advanceBody = viewerSource.match(/const advance = \(time: number\) => \{([\s\S]*?)\n    \};/)
  assert.ok(advanceBody)
  // Run the viewer's real scrolling callback with a simulated viewport and clock.
  const advance = new Function('time', 'stageRef', 'autoScrollSpeedRef', 'autoScrollLastTimeRef',
    'autoScrollRemainderRef', 'AUTO_SCROLL_PIXELS_PER_SECOND', 'zoomRef', 'setAutoScrollSpeed', advanceBody[1])
  for (const [tier, pixelsPerSecond] of [[1, 10], [2, 13], [3, 16], [4, 19], [5, 22]]) {
    const results: number[] = []
    for (const zoom of [1, 3, 5]) {
      const stage = { scrollTop: 0, scrollHeight: 10000, clientHeight: 1000 }
      const lastTime = { current: 0 }
      const remainder = { current: 0 }
      for (let time = 25; time <= 1000; time += 25) {
        advance(time, { current: stage }, { current: tier }, lastTime, remainder, speeds, { current: zoom }, () => {})
      }
      assert.ok(Math.abs(stage.scrollTop + remainder.current - pixelsPerSecond) < 1e-8)
      results.push(stage.scrollTop)
    }
    assert.deepEqual(results, [results[0], results[0], results[0]])
  }
})
