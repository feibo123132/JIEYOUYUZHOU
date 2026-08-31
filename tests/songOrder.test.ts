import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createEditableCatalog,
  insertCatalogSong,
  moveCatalogSong,
} from '../src/components/SongRequest/songRequest.ts'
import {
  createArtistSettingsPayload,
  mergeSongOrder,
  parseArtistSettingsSnapshot,
} from '../src/components/SongRequest/artistSettings.ts'

const songs = [
  { id: 'a', title: '晴天', artist: '周杰伦', category: '华语', featured: true },
  { id: 'b', title: 'Yellow', artist: 'Coldplay', category: '欧美', featured: false },
  { id: 'c', title: '稻香', artist: '周杰伦', category: '华语', featured: true },
]

test('歌曲可在同一歌手内前后移动或插入指定位置', () => {
  const catalog = createEditableCatalog(songs)

  assert.deepEqual(moveCatalogSong(catalog, 'c', 'a').songs.map((song) => song.id), ['c', 'b', 'a'])
  assert.deepEqual(insertCatalogSong(catalog, 'c', 'a', 'before').songs.map((song) => song.id), ['c', 'a', 'b'])
  assert.deepEqual(insertCatalogSong(catalog, 'a', 'c', 'after').songs.map((song) => song.id), ['b', 'c', 'a'])
  assert.equal(insertCatalogSong(catalog, 'a', 'b', 'before'), catalog, '不能跨歌手调整歌曲')
})

test('歌手设置快照保存并合并歌曲顺序且兼容旧快照', () => {
  const payload = createArtistSettingsPayload(['周杰伦', 'Coldplay'], {}, {}, ['c', 'a', 'b'])
  assert.deepEqual(payload.songOrder, ['c', 'a', 'b'])
  assert.deepEqual(mergeSongOrder(['c', 'missing', 'a'], songs).map((song) => song.id), ['c', 'a', 'b'])
  assert.deepEqual(parseArtistSettingsSnapshot({
    version: 1,
    artistOrder: ['周杰伦'],
    customAvatars: {},
    avatarAdjustments: {},
    revision: 1,
    updatedAt: '2026-08-31T12:00:00.000Z',
  })?.songOrder, [])
})

test('歌手详情页提供歌曲调整排序模式并接入同步队列', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url), 'utf8')

  assert.match(source, /const \[songOrderMode, setSongOrderMode\] = useState\(false\)/)
  assert.match(source, /selectedArtist &&[\s\S]*调整排序/)
  assert.match(source, /draggable=\{songOrderMode\}/)
  assert.match(source, /handleSongDragStart/)
  assert.match(source, /insertCatalogSong\(catalog, sourceSongId, targetSongId, placement\)/)
  assert.match(source, /moveCatalogSong\(catalog, songId, targetSong\.id\)/)
  assert.match(source, /queueArtistSettings\(createArtistSettingsPayload\([\s\S]*songOrder/)
})
