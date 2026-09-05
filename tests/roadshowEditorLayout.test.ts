import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../src/components/SongRequest/RoadshowPanel.tsx', import.meta.url),
  'utf8',
)

test('路演编辑栏桌面端为四等分且标签按钮紧跟地点右侧', () => {
  assert.match(source, /data-roadshow-editor-grid[^>]*className="[^"]*xl:grid-cols-4[^"]*"/)
  assert.match(
    source,
    /data-roadshow-editor-grid[\s\S]*?aria-label="路演地点"[\s\S]*?data-roadshow-editor-tabs[\s\S]*?路演歌曲[\s\S]*?听歌识曲/,
  )
})

test('三个标签按钮依次展示路演歌曲、听歌识曲和路演感受', () => {
  assert.match(source, /data-roadshow-editor-tabs[^>]*className="[^"]*grid-cols-3[^"]*"/)
  assert.match(source, /data-roadshow-editor-tabs[\s\S]*?路演歌曲[\s\S]*?听歌识曲[\s\S]*?路演感受/)
})
