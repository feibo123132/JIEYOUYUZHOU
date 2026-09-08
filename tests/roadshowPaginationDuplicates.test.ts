import assert from 'node:assert/strict'
import test from 'node:test'
import * as roadshow from '../src/components/SongRequest/roadshow.ts'
import type { RoadshowSong } from '../src/components/SongRequest/roadshow.ts'

const songs: RoadshowSong[] = ['晴天', '红尘客栈', '裂缝中的阳光', '心墙', '稻香', '夜曲', '七里香'].map((title, i) => ({
  id: `catalog:${i}`, catalogId: String(i), title, artist: '歌手', source: 'catalog',
}))

test('重复导入的旧列表分组后，来回翻页始终为五首和两首且标识唯一', () => {
  const input = [songs[0], songs[1], songs[1], ...songs.slice(2), songs[1]]
  const { groups } = roadshow.groupPerformanceSongsByMatchTier(input, () => 95)
  assert.equal(groups.rareLegend.length, 7)
  for (const page of [1, 2, 1, 2, 1]) {
    const result = roadshow.paginateRoadshowSongs(groups.rareLegend, page)
    assert.equal(result.items.length, page === 1 ? 5 : 2)
    assert.equal(new Set(result.items.map(song => song.id)).size, result.items.length)
    assert.deepEqual(result.items, page === 1 ? songs.slice(0, 5) : songs.slice(5))
  }
  assert.equal(input.length, 9, '不能修改原始记录')
})

test('反复合并导入保持顺序并去重，手工录入的同名同歌手也只保留一次', () => {
  assert.equal(typeof roadshow.deduplicateRoadshowSongs, 'function')
  const manual = { ...songs[1], id: 'manual:1', catalogId: undefined, title: ' 红尘客栈 ', source: 'manual' as const }
  const otherArtist = { ...manual, id: 'manual:2', artist: '另一位歌手' }
  const merged = roadshow.deduplicateRoadshowSongs([...songs, ...songs, manual, otherArtist])
  assert.deepEqual(merged, [...songs, otherArtist])
  assert.deepEqual(roadshow.deduplicateRoadshowSongs([...merged, ...songs]), merged)
})

test('跨分组的重复条目及未练习歌曲也不会重复展示', () => {
  const duplicate = { ...songs[0], id: 'manual:old', catalogId: undefined }
  const result = roadshow.groupPerformanceSongsByMatchTier([songs[0], duplicate, songs[1], songs[1]], song => song === songs[0] ? 95 : null)
  assert.deepEqual(result.groups.rareLegend, [songs[0]])
  assert.deepEqual(result.unranked, [songs[1]])
})
