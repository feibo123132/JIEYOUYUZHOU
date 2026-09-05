import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { parseRoadshowCache } from '../src/components/SongRequest/roadshow.ts'

const require = createRequire(import.meta.url)
const { validateRequest } = require('../cloudfunctions/songRequestSync/validation.js')
const record = {
  id: 'feelings-1', title: '第一次路演', date: '2026-09-05',
  performanceSongs: [], recognitionSongs: [], updatedAt: '2026-09-05T12:00:00.000Z',
}
const save = (value: object) => validateRequest({
  action: 'roadshows:save', alias: 'test', password: 'secret123', record: value,
}).record

test('路演感受通过云端校验和本地缓存后仍保留多行内容', () => {
  const feelings = '今天开场有些紧张。\n后来大家一起合唱，很开心！'
  const saved = save({ ...record, feelings })
  assert.equal(saved.feelings, feelings)
  const cached = parseRoadshowCache(JSON.stringify({ version: 1, records: [saved] }))
  assert.equal(cached[0].feelings, feelings)
})

test('旧路演无需感受字段，已有感受可以清空', () => {
  assert.equal(save(record).feelings, undefined)
  assert.equal(save({ ...record, feelings: '' }).feelings, '')
})

test('拒绝非法感受字段和超过一万字的内容', () => {
  for (const feelings of [123, {}, '字'.repeat(10001)]) {
    assert.throws(() => save({ ...record, feelings }), /INVALID_RECORD/)
  }
  assert.deepEqual(parseRoadshowCache(JSON.stringify({ version: 1, records: [{ ...record, feelings: 123 }] })), [])
})
