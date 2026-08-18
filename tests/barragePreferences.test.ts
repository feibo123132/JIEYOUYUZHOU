import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createInitialBarragePreferences,
  setBarragePreference,
} from '../src/components/StarrySky/barragePreferences.ts'

test('barrage preferences start disabled and update independently', () => {
  const initial = createInitialBarragePreferences()
  assert.deepEqual(initial, { immersive: false, intimate: false, fill: false })

  const filled = setBarragePreference(initial, 'fill', true)
  assert.deepEqual(filled, { immersive: false, intimate: false, fill: true })

  const intimate = setBarragePreference(initial, 'intimate', true)
  assert.deepEqual(intimate, { immersive: false, intimate: true, fill: false })

  const both = setBarragePreference(intimate, 'immersive', true)
  assert.deepEqual(both, { immersive: true, intimate: true, fill: false })

  const intimateOnly = setBarragePreference(both, 'immersive', false)
  assert.deepEqual(intimateOnly, { immersive: false, intimate: true, fill: false })

  const immersiveOnly = setBarragePreference(both, 'intimate', false)
  assert.deepEqual(immersiveOnly, { immersive: true, intimate: false, fill: false })

  const combined = setBarragePreference(
    setBarragePreference(filled, 'intimate', true),
    'immersive',
    true,
  )
  assert.deepEqual(combined, { immersive: true, intimate: true, fill: true })
  assert.deepEqual(
    setBarragePreference(combined, 'fill', false),
    { immersive: true, intimate: true, fill: false },
  )

  assert.deepEqual(createInitialBarragePreferences(), {
    immersive: false,
    intimate: false,
    fill: false,
  })
})
