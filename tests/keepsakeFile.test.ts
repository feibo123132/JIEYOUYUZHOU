import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createImageResourceManager,
  downloadKeepsakePng,
  getInitialPhotoView,
  getLocalDateInputValue,
  isSupportedImage,
  scalePointerDelta,
} from '../src/components/Keepsake/keepsakeFile.ts'

test('accepts only supported local image MIME types', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(isSupportedImage({ type }), true)
  }
  assert.equal(isSupportedImage({ type: 'image/gif' }), false)
  assert.equal(isSupportedImage({ type: '' }), false)
})

test('formats local dates and returns a fresh initial photo view', () => {
  assert.equal(getLocalDateInputValue(new Date(2026, 7, 3, 23, 40)), '2026-08-03')
  assert.deepEqual(getInitialPhotoView(), { zoom: 1, pan: { x: 0, y: 0 } })
})

test('converts pointer movement into 1200 by 1600 logical pixels', () => {
  assert.deepEqual(scalePointerDelta(30, -40, { width: 600, height: 800 }), { x: 60, y: -80 })
  assert.deepEqual(scalePointerDelta(10, 10, { width: 0, height: 0 }), { x: 0, y: 0 })
})

test('image manager suppresses stale loads and revokes replaced and disposed URLs', async () => {
  const revoked: string[] = []
  const resolvers = new Map<string, (value: { image: object; width: number; height: number }) => void>()
  let serial = 0
  const manager = createImageResourceManager({
    createObjectURL: () => `blob:${++serial}`,
    revokeObjectURL: (url) => revoked.push(url),
    loadImage: (url) => new Promise((resolve) => resolvers.set(url, resolve)),
  })

  const first = manager.load({ type: 'image/png' })
  const second = manager.load({ type: 'image/jpeg' })
  resolvers.get('blob:1')?.({ image: {}, width: 100, height: 80 })
  resolvers.get('blob:2')?.({ image: {}, width: 200, height: 160 })

  assert.equal(await first, null)
  assert.deepEqual(await second, { image: {}, width: 200, height: 160 })
  assert.deepEqual(revoked, ['blob:1'])

  manager.dispose()
  assert.deepEqual(revoked, ['blob:1', 'blob:2'])
})

test('image manager reports read failures and releases the failed URL', async () => {
  const revoked: string[] = []
  const manager = createImageResourceManager({
    createObjectURL: () => 'blob:broken',
    revokeObjectURL: (url) => revoked.push(url),
    loadImage: async () => { throw new Error('decode failed') },
  })

  await assert.rejects(() => manager.load({ type: 'image/webp' }), /无法读取这张照片/)
  assert.deepEqual(revoked, ['blob:broken'])
})

test('aborted image replacement releases its candidate and preserves the accepted URL', async () => {
  const revoked: string[] = []
  const pending = new Map<string, (value: { image: object; width: number; height: number }) => void>()
  let serial = 0
  const manager = createImageResourceManager({
    createObjectURL: () => `blob:transaction-${++serial}`,
    revokeObjectURL: (url) => revoked.push(url),
    loadImage: (url) => new Promise((resolve) => pending.set(url, resolve)),
  })
  const first = manager.load({ type: 'image/png' })
  pending.get('blob:transaction-1')?.({ image: {}, width: 10, height: 10 })
  await first

  const controller = new AbortController()
  const replacement = manager.load({ type: 'image/jpeg' }, controller.signal)
  controller.abort()
  pending.get('blob:transaction-2')?.({ image: {}, width: 20, height: 20 })
  assert.equal(await replacement, null)
  assert.deepEqual(revoked, ['blob:transaction-2'])

  manager.dispose()
  assert.deepEqual(revoked, ['blob:transaction-2', 'blob:transaction-1'])
})

test('exports an exact 1200 by 1600 PNG and revokes its download URL', async () => {
  let requestedType = ''
  const clicked: Array<{ url: string; filename: string }> = []
  const revoked: string[] = []
  const canvas = {
    width: 1200,
    height: 1600,
    toBlob(callback: (blob: Blob | null) => void, type: string) {
      requestedType = type
      callback(new Blob(['png'], { type: 'image/png' }))
    },
  }

  await downloadKeepsakePng(canvas, 'JIEYOU留影-2026-08-23.png', {
    createObjectURL: () => 'blob:download',
    revokeObjectURL: (url) => revoked.push(url),
    clickDownload: (url, filename) => clicked.push({ url, filename }),
  })

  assert.equal(requestedType, 'image/png')
  assert.deepEqual(clicked, [{ url: 'blob:download', filename: 'JIEYOU留影-2026-08-23.png' }])
  assert.deepEqual(revoked, ['blob:download'])
})

test('rejects invalid canvas dimensions and unusable PNG blobs', async () => {
  const deps = {
    createObjectURL: () => 'blob:download',
    revokeObjectURL: () => {},
    clickDownload: () => {},
  }
  await assert.rejects(() => downloadKeepsakePng({ width: 10, height: 10, toBlob() {} }, 'x.png', deps), /导出尺寸/)
  await assert.rejects(() => downloadKeepsakePng({ width: 1200, height: 1600, toBlob(callback) { callback(null) } }, 'x.png', deps), /生成 PNG/)
  await assert.rejects(() => downloadKeepsakePng({
    width: 1200,
    height: 1600,
    toBlob(callback) { callback(new Blob(['x'], { type: 'image/jpeg' })) },
  }, 'x.png', deps), /PNG 格式/)
})

test('studio source uses tested lifecycle helpers and mobile-safe controls', () => {
  const source = readFileSync(new URL('../src/components/Keepsake/KeepsakeStudio.tsx', import.meta.url), 'utf8')
  assert.match(source, /getLocalDateInputValue/)
  assert.match(source, /getInitialPhotoView/)
  assert.match(source, /type="date"/)
  assert.match(source, /const \[location, setLocation\] = useState<KeepsakeLocation>\('医大'\)/)
  assert.match(source, /<option value="医大">医大<\/option>/)
  assert.match(source, /<option value="南湖">南湖<\/option>/)
  assert.match(source, /location,/)
  assert.match(source, /const \[sentence, setSentence\] = useState<KeepsakeSentence>/)
  assert.match(source, /useState<KeepsakeSentence>\(KEEPSAKE_LOCATION_SENTENCES\.医大\)/)
  assert.doesNotMatch(source, /Math\.floor\(Math\.random\(\) \* KEEPSAKE_SENTENCES\.length\)/)
  assert.match(source, /value=\{sentence\}/)
  assert.match(source, /<option value="不选">不选<\/option>/)
  assert.match(source, /getKeepsakeSentencesForLocation\(location\)\.map/)
  assert.match(source, /handleLocationChange/)
  assert.doesNotMatch(source, /照片缩放|滑杆缩放|keepsake-zoom|handleZoom|RotateCcw/)
  assert.doesNotMatch(source, /署名/)
  assert.doesNotMatch(source, /JIEYOU MEMORY/)
  assert.match(source, />\s*返回\s*</)
  assert.doesNotMatch(source, /返回星空入口/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /touchAction: 'none'/)
})

test('studio exposes the complete camera capture state machine', () => {
  const source = readFileSync(new URL('../src/components/Keepsake/KeepsakeStudio.tsx', import.meta.url), 'utf8')
  assert.match(source, /直接拍摄/)
  assert.match(source, /createCameraWorkflow/)
  assert.match(source, /captureVideoFrame/)
  assert.match(source, /requesting/)
  assert.match(source, /captured/)
  assert.match(source, /autoPlay/)
  assert.match(source, /muted/)
  assert.match(source, /playsInline/)
  assert.match(source, />拍摄</)
  assert.match(source, />重拍</)
  assert.match(source, /使用照片/)
  assert.match(source, />重试</)
  assert.match(source, />取消</)
  assert.match(source, /\.dispose\(\)/)
  assert.match(source, /attachedVideo/)
  assert.match(source, /cameraSnapshot\.status !== 'closed'/)
})
