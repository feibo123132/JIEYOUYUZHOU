import assert from 'node:assert/strict'
import test from 'node:test'

import { mockDatabase } from '../src/services/supabase.ts'

test('mock stars remain isolated between themes', async () => {
  const jieyou = await mockDatabase.createStar(
    'jieyou',
    'u-jieyou',
    '小宇',
    { x: 12, y: 18 },
    { message: '解忧记录' },
  )
  const life = await mockDatabase.createStar(
    'life',
    'u-life',
    '小生',
    { x: 44, y: 52 },
    { message: '幸福记录' },
  )

  assert.deepEqual((await mockDatabase.getAllStars('jieyou')).map((star) => star.id), [jieyou.id])
  assert.deepEqual((await mockDatabase.getAllStars('life')).map((star) => star.id), [life.id])

  await mockDatabase.deleteStar('life', life.id)
  assert.equal((await mockDatabase.getAllStars('life')).length, 0)
  assert.equal((await mockDatabase.getAllStarRecords('life')).length, 1)
  assert.equal((await mockDatabase.getAllStars('jieyou')).length, 1)

  await mockDatabase.restoreStar('life', life.id)
  assert.equal((await mockDatabase.getAllStars('life')).length, 1)

  await mockDatabase.deleteStar('life', life.id)
  await mockDatabase.permanentDeleteStar('life', life.id)
  assert.equal((await mockDatabase.getAllStarRecords('life')).length, 0)
  assert.equal((await mockDatabase.getAllStars('jieyou')).length, 1)
})
