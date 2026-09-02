import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatBarrageMessage,
  getBarrageLaneDuration,
  getBarrageLaneDurationScale,
  getBarrageFillDuration,
  getBarrageFillRepeatCount,
  getBarrageLayout,
  getSafeBarrageLaneCount,
} from '../src/components/StarrySky/barrageLayout.ts'

test('barrage lanes use a stable subtle duration variation', () => {
  const scales = Array.from({ length: 10 }, (_, laneIndex) => getBarrageLaneDurationScale(laneIndex))
  assert.deepEqual(scales.slice(0, 5), [0.9, 0.95, 1, 1.05, 1.1])
  assert.deepEqual(scales.slice(5), scales.slice(0, 5))
  assert.ok(Math.max(...scales) - Math.min(...scales) <= 0.200001)
})

test('barrage messages longer than 25 characters are truncated with an ellipsis', () => {
  assert.equal(formatBarrageMessage('幸福'.repeat(12) + '好'), '幸福'.repeat(12) + '好')
  assert.equal(formatBarrageMessage('幸'.repeat(26)), `${'幸'.repeat(25)}……`)
  assert.equal(formatBarrageMessage(`${'幸'.repeat(24)}😊好`), `${'幸'.repeat(24)}😊……`)
})

test('barrage duration uses displayed text instead of the untruncated source', () => {
  const longSource = '幸'.repeat(200)
  const displayed = `${'幸'.repeat(25)}……`
  assert.equal(getBarrageLaneDuration([longSource]), getBarrageLaneDuration([displayed]))
})

const parseClamp = (value: string) => {
  const match = value.match(/^clamp\(([\d.]+)rem, ([\d.]+)vw, ([\d.]+)rem\)$/)
  assert.ok(match, `unexpected clamp value: ${value}`)
  return match.slice(1).map(Number)
}

test('intimate barrage layout uses a smaller horizontal gap and safe vertical gap', () => {
  const regular = getBarrageLayout(false)
  const intimate = getBarrageLayout(true)

  assert.deepEqual(regular, {
    desktopLaneCount: 8,
    mobileLaneCount: 6,
    horizontalGap: 'clamp(2.8125rem, 6.75vw, 7.875rem)',
    staticGap: '.75rem',
    minimumVerticalGap: 0,
  })
  assert.deepEqual(intimate, {
    desktopLaneCount: 16,
    mobileLaneCount: 12,
    horizontalGap: 'clamp(0.9375rem, 2.25vw, 2.625rem)',
    staticGap: '.375rem',
    minimumVerticalGap: 10,
  })

  assert.equal(intimate.desktopLaneCount / regular.desktopLaneCount, 2)
  assert.equal(intimate.mobileLaneCount / regular.mobileLaneCount, 2)

  const regularClamp = parseClamp(regular.horizontalGap)
  const intimateClamp = parseClamp(intimate.horizontalGap)
  assert.deepEqual(
    intimateClamp,
    [0.9375, 2.25, 2.625],
  )
  assert.deepEqual(
    intimateClamp,
    regularClamp.map((value) => value / 3),
  )
  assert.equal(parseFloat(intimate.staticGap), parseFloat(regular.staticGap) / 2)
})

test('safe barrage lane count respects messages, height, and vertical clearance', () => {
  const laneCount = (
    maxLaneCount: number,
    messageCount: number,
    stageHeight: number,
    itemHeight: number,
    minimumGap = 10,
  ) => getSafeBarrageLaneCount({
    maxLaneCount,
    messageCount,
    stageHeight,
    itemHeight,
    minimumGap,
  })

  assert.equal(laneCount(16, 0, 800, 40), 0)
  assert.equal(laneCount(16, 3, 800, 40), 3)
  assert.equal(laneCount(16, 40, 1000, 40), 16)
  assert.equal(laneCount(12, 40, 1000, 40), 12)

  assert.equal(laneCount(16, 40, 200, 40), 4)
  assert.equal(laneCount(16, 40, 199, 40), 3)
  assert.equal(laneCount(16, 40, 201, 40), 4)
  assert.equal(laneCount(16, 40, 20, 40), 1)

  const constrained = laneCount(16, 40, 199, 40)
  assert.ok(constrained >= 2)
  assert.ok(199 / constrained >= 40 + 10)

  for (const invalidStageHeight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(laneCount(16, 7, invalidStageHeight, 40), 7)
  }
  for (const invalidItemHeight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(laneCount(16, 7, 800, invalidItemHeight), 7)
  }
  assert.equal(laneCount(16, 7, 800, 40, -1), 7)
  assert.equal(laneCount(16, 7, 800, 40, Number.NaN), 7)
})

test('fill repeat count minimally covers the stage width', () => {
  const repeatCount = (stageWidth: number, baseWidth: number, gap: number) =>
    getBarrageFillRepeatCount({ stageWidth, baseWidth, gap })

  assert.equal(repeatCount(1000, 300, 20), 4)
  assert.equal(repeatCount(960, 300, 20), 3)
  assert.equal(repeatCount(959, 300, 20), 3)
  assert.equal(repeatCount(961, 300, 20), 4)
  assert.equal(repeatCount(500, 600, 20), 1)

  const n = repeatCount(1000, 300, 20)
  assert.ok(n * (300 + 20) >= 1000)
  assert.ok((n - 1) * (300 + 20) < 1000)
})

test('fill repeat count falls back for invalid measurements', () => {
  for (const stageWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getBarrageFillRepeatCount({ stageWidth, baseWidth: 300, gap: 20 }), 1)
  }
  for (const baseWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getBarrageFillRepeatCount({ stageWidth: 1000, baseWidth, gap: 20 }), 1)
  }
  for (const gap of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getBarrageFillRepeatCount({ stageWidth: 1000, baseWidth: 300, gap }), 1)
  }
  assert.equal(getBarrageFillRepeatCount({ stageWidth: 1000, baseWidth: 300, gap: 0 }), 4)
})

test('fill duration uses 60px per second with 24s and 90s bounds', () => {
  assert.equal(getBarrageFillDuration(600), 24)
  assert.equal(getBarrageFillDuration(1440), 24)
  assert.equal(getBarrageFillDuration(1800), 30)
  assert.equal(getBarrageFillDuration(5400), 90)
  assert.equal(getBarrageFillDuration(6000), 90)
  assert.equal(getBarrageFillDuration(0), 24)
  assert.equal(getBarrageFillDuration(Number.NaN), 24)
  assert.equal(getBarrageFillDuration(Number.POSITIVE_INFINITY), 24)
})
