import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CAMERA_CONSTRAINTS,
  captureVideoFrame,
  createCameraWorkflow,
  getCameraErrorMessage,
  isCameraAvailable,
  prepareCameraVideo,
  stopMediaStream,
} from '../src/components/Keepsake/keepsakeCamera.ts'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const fakeStream = (label: string) => {
  const tracks = [{ stopped: false, stop() { this.stopped = true } }, { stopped: false, stop() { this.stopped = true } }]
  return { label, tracks, getTracks: () => tracks }
}

test('uses rear-camera constraints and checks secure API availability', () => {
  assert.deepEqual(CAMERA_CONSTRAINTS, { video: { facingMode: { ideal: 'environment' } }, audio: false })
  assert.equal(isCameraAvailable({ isSecureContext: true, mediaDevices: { getUserMedia() {} } }), true)
  assert.equal(isCameraAvailable({ isSecureContext: false, mediaDevices: { getUserMedia() {} } }), false)
  assert.equal(isCameraAvailable({ isSecureContext: true, mediaDevices: undefined }), false)
})

test('maps camera errors to concise Chinese guidance', () => {
  assert.match(getCameraErrorMessage({ name: 'NotAllowedError' }), /权限/)
  assert.match(getCameraErrorMessage({ name: 'NotFoundError' }), /摄像头/)
  assert.match(getCameraErrorMessage({ name: 'NotReadableError' }), /占用/)
  assert.match(getCameraErrorMessage({ name: 'UnknownError' }), /无法打开/)
})

test('stops every media stream track', () => {
  const stream = fakeStream('all')
  stopMediaStream(stream)
  assert.deepEqual(stream.tracks.map((track) => track.stopped), [true, true])
})

test('prepares an already-ready video and aborts pending metadata cleanly', async () => {
  const ready = { srcObject: null, videoWidth: 640, videoHeight: 480, playCalls: 0, async play() { this.playCalls += 1 } }
  await prepareCameraVideo(ready, fakeStream('ready'), new AbortController().signal)
  assert.equal(ready.srcObject?.label, 'ready')
  assert.equal(ready.playCalls, 1)

  const listeners = new Map<string, Set<() => void>>()
  const pending = {
    srcObject: null,
    videoWidth: 0,
    videoHeight: 0,
    play: async () => {},
    addEventListener(name: string, listener: () => void) {
      const set = listeners.get(name) ?? new Set()
      set.add(listener)
      listeners.set(name, set)
    },
    removeEventListener(name: string, listener: () => void) { listeners.get(name)?.delete(listener) },
  }
  const controller = new AbortController()
  const preparation = prepareCameraVideo(pending, fakeStream('pending'), controller.signal)
  controller.abort()
  await assert.rejects(() => preparation, /取消/)
  assert.equal(listeners.get('loadedmetadata')?.size ?? 0, 0)
})

test('captures a native-size JPEG frame and rejects unusable frames', async () => {
  const drawCalls: unknown[][] = []
  let blobRequest: { type?: string; quality?: number } = {}
  const file = { name: '', type: '' }
  const video = { videoWidth: 1280, videoHeight: 720 }
  const result = await captureVideoFrame(video, {
    createCanvas: (width, height) => ({
      width,
      height,
      getContext: () => ({ drawImage: (...args: unknown[]) => drawCalls.push(args) }),
      toBlob: (callback, type, quality) => {
        blobRequest = { type, quality }
        callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
      },
    }),
    createFile: (_blob, name, options) => Object.assign(file, { name, type: options.type }),
    now: () => new Date(2026, 7, 23, 9, 5, 7),
  })
  assert.equal(result, file)
  assert.equal(file.name, 'JIEYOU拍摄-2026-08-23-090507.jpg')
  assert.equal(file.type, 'image/jpeg')
  assert.deepEqual(blobRequest, { type: 'image/jpeg', quality: 0.92 })
  assert.deepEqual(drawCalls[0]?.slice(1), [0, 0, 1280, 720])

  await assert.rejects(() => captureVideoFrame({ videoWidth: 0, videoHeight: 0 }), /尚未就绪/)
  await assert.rejects(() => captureVideoFrame(video, {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => null, toBlob() {} }),
    createFile: () => file,
    now: () => new Date(),
  }), /画面/)
})

test('workflow deduplicates opens, cancels stale permission, and closes every stream', async () => {
  const requests = [deferred<ReturnType<typeof fakeStream>>(), deferred<ReturnType<typeof fakeStream>>()]
  const snapshots: Array<{ status: string }> = []
  const prepared: string[] = []
  let requestCount = 0
  const workflow = createCameraWorkflow({
    isAvailable: () => true,
    getUserMedia: () => requests[requestCount++].promise,
    prepareVideo: async (stream) => { prepared.push(stream.label) },
    detachVideo: () => {},
    captureFrame: async () => ({ type: 'image/jpeg' }),
    loadPhotoFile: async () => true,
    createObjectURL: () => 'blob:review',
    revokeObjectURL: () => {},
    onChange: (snapshot) => snapshots.push(snapshot),
  })

  const first = workflow.open()
  const duplicate = workflow.open()
  assert.equal(requestCount, 1)
  workflow.close()
  const second = workflow.open()
  assert.equal(requestCount, 2)

  const oldStream = fakeStream('old')
  requests[0].resolve(oldStream)
  await first
  await duplicate
  assert.deepEqual(oldStream.tracks.map((track) => track.stopped), [true, true])

  const liveStream = fakeStream('live')
  requests[1].resolve(liveStream)
  await second
  assert.equal(snapshots.at(-1)?.status, 'live')
  assert.deepEqual(prepared, ['live'])
  workflow.close()
  assert.deepEqual(liveStream.tracks.map((track) => track.stopped), [true, true])
})

test('workflow captures, retakes without permission, and preserves review after failed use', async () => {
  const stream = fakeStream('camera')
  const file = { type: 'image/jpeg' }
  const snapshots: any[] = []
  const revoked: string[] = []
  let requests = 0
  let loads = 0
  const workflow = createCameraWorkflow({
    isAvailable: () => true,
    getUserMedia: async () => { requests += 1; return stream },
    prepareVideo: async () => {},
    detachVideo: () => {},
    captureFrame: async () => file,
    loadPhotoFile: async () => { loads += 1; return loads > 1 },
    createObjectURL: () => `blob:review-${loads}`,
    revokeObjectURL: (url) => revoked.push(url),
    onChange: (snapshot) => snapshots.push(snapshot),
  })

  await workflow.open()
  await workflow.capture()
  assert.equal(snapshots.at(-1).status, 'captured')
  await workflow.retake()
  assert.equal(requests, 1)
  assert.equal(snapshots.at(-1).status, 'live')

  await workflow.capture()
  assert.equal(await workflow.usePhoto(), false)
  assert.equal(snapshots.at(-1).status, 'captured')
  assert.equal(snapshots.at(-1).capturedFile, file)
  assert.equal(stream.tracks.every((track) => track.stopped), true)

  assert.equal(await workflow.usePhoto(), true)
  assert.equal(snapshots.at(-1).status, 'closed')
  assert.ok(revoked.length >= 2)
})

test('workflow does not request a camera when the environment is unavailable', async () => {
  let requested = false
  const snapshots: any[] = []
  const workflow = createCameraWorkflow({
    isAvailable: () => false,
    getUserMedia: async () => { requested = true; return fakeStream('never') },
    prepareVideo: async () => {},
    detachVideo: () => {},
    captureFrame: async () => ({ type: 'image/jpeg' }),
    loadPhotoFile: async () => true,
    createObjectURL: () => 'blob:none',
    revokeObjectURL: () => {},
    onChange: (snapshot) => snapshots.push(snapshot),
  })
  await workflow.open()
  assert.equal(requested, false)
  assert.equal(snapshots.at(-1).status, 'error')
  assert.match(snapshots.at(-1).error, /HTTPS|摄像头/)
})

test('opening again from captured revokes the previous review URL', async () => {
  const revoked: string[] = []
  let requestCount = 0
  const workflow = createCameraWorkflow({
    isAvailable: () => true,
    getUserMedia: async () => { requestCount += 1; return fakeStream(`stream-${requestCount}`) },
    prepareVideo: async () => {},
    detachVideo: () => {},
    captureFrame: async () => ({ type: 'image/jpeg' }),
    loadPhotoFile: async () => true,
    createObjectURL: () => 'blob:captured-review',
    revokeObjectURL: (url) => revoked.push(url),
    onChange: () => {},
  })
  await workflow.open()
  await workflow.capture()
  await workflow.open()
  assert.deepEqual(revoked, ['blob:captured-review'])
  workflow.close()
})
