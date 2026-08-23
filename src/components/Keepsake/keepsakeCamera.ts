export const CAMERA_CONSTRAINTS = Object.freeze({
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
})

type TrackLike = { stop: () => void }
export type MediaStreamLike = { getTracks: () => TrackLike[] }

export function isCameraAvailable(environment: {
  isSecureContext: boolean
  mediaDevices?: { getUserMedia?: (...args: any[]) => unknown }
}) {
  return Boolean(environment.isSecureContext && typeof environment.mediaDevices?.getUserMedia === 'function')
}

export function getCameraErrorMessage(error: unknown) {
  const name = typeof error === 'object' && error && 'name' in error ? String((error as { name: unknown }).name) : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return '摄像头权限被拒绝，请在浏览器设置中允许访问'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '没有找到可用的摄像头'
  if (name === 'NotReadableError' || name === 'TrackStartError') return '摄像头可能正被其他应用占用'
  if (name === 'AbortError') return '摄像头操作已取消'
  return '无法打开摄像头，请稍后重试或选择本地照片'
}

export function stopMediaStream(stream: MediaStreamLike | null | undefined) {
  for (const track of stream?.getTracks?.() ?? []) {
    try { track.stop() } catch {}
  }
}

type VideoLike = {
  srcObject: unknown
  videoWidth: number
  videoHeight: number
  play: () => Promise<void> | void
  addEventListener?: (name: string, listener: () => void) => void
  removeEventListener?: (name: string, listener: () => void) => void
}

function cancelledError() {
  const error = new Error('摄像头操作已取消')
  error.name = 'AbortError'
  return error
}

function waitForMetadata(video: VideoLike, signal: AbortSignal) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener?.('loadedmetadata', onReady)
      video.removeEventListener?.('error', onError)
      signal.removeEventListener('abort', onAbort)
    }
    const onReady = () => {
      cleanup()
      if (video.videoWidth > 0 && video.videoHeight > 0) resolve()
      else reject(new Error('摄像头画面尚未就绪'))
    }
    const onError = () => { cleanup(); reject(new Error('无法读取摄像头画面')) }
    const onAbort = () => { cleanup(); reject(cancelledError()) }
    if (signal.aborted) return onAbort()
    video.addEventListener?.('loadedmetadata', onReady)
    video.addEventListener?.('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => reject(cancelledError()))
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
  })
}

export async function prepareCameraVideo(video: VideoLike, stream: MediaStreamLike, signal: AbortSignal) {
  if (signal.aborted) throw cancelledError()
  video.srcObject = stream
  await waitForMetadata(video, signal)
  await awaitWithAbort(Promise.resolve(video.play()), signal)
  if (signal.aborted) throw cancelledError()
}

type CaptureCanvas = {
  width: number
  height: number
  getContext: (type: '2d') => { drawImage: (...args: any[]) => void } | null
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void
}

type CaptureDeps = {
  createCanvas: (width: number, height: number) => CaptureCanvas
  createFile: (blob: Blob, name: string, options: { type: string }) => any
  now: () => Date
}

function browserCaptureDeps(): CaptureDeps {
  return {
    createCanvas: (width, height) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    },
    createFile: (blob, name, options) => new File([blob], name, options),
    now: () => new Date(),
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

export async function captureVideoFrame(
  video: { videoWidth: number; videoHeight: number },
  deps: CaptureDeps = browserCaptureDeps(),
) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (width <= 0 || height <= 0) throw new Error('摄像头画面尚未就绪')
  const canvas = deps.createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法读取摄像头画面')
  ctx.drawImage(video, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('无法生成拍摄照片')
  const now = deps.now()
  const filename = `JIEYOU拍摄-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.jpg`
  return deps.createFile(blob, filename, { type: 'image/jpeg' })
}

export type CameraStatus = 'closed' | 'requesting' | 'live' | 'captured' | 'error'
export interface CameraSnapshot {
  status: CameraStatus
  busy: boolean
  error: string
  capturedFile: any | null
  reviewUrl: string | null
}

interface CameraWorkflowDeps {
  isAvailable: () => boolean
  getUserMedia: (constraints: typeof CAMERA_CONSTRAINTS) => Promise<MediaStreamLike>
  prepareVideo: (stream: MediaStreamLike, signal: AbortSignal) => Promise<void>
  detachVideo: () => void
  captureFrame: () => Promise<any>
  loadPhotoFile: (file: any, signal: AbortSignal) => Promise<boolean>
  createObjectURL: (file: any) => string
  revokeObjectURL: (url: string) => void
  onChange: (snapshot: CameraSnapshot) => void
}

export function createCameraWorkflow(deps: CameraWorkflowDeps) {
  let snapshot: CameraSnapshot = { status: 'closed', busy: false, error: '', capturedFile: null, reviewUrl: null }
  let stream: MediaStreamLike | null = null
  let generation = 0
  let operation = 0
  let openAbort: AbortController | null = null
  let operationAbort: AbortController | null = null
  let pendingOpen: Promise<void> | null = null
  let pendingCapture: Promise<void> | null = null
  let pendingUse: Promise<boolean> | null = null

  const emit = (next: Partial<CameraSnapshot> & Pick<CameraSnapshot, 'status'>) => {
    snapshot = {
      status: next.status,
      busy: next.busy ?? false,
      error: next.error ?? '',
      capturedFile: next.capturedFile === undefined ? snapshot.capturedFile : next.capturedFile,
      reviewUrl: next.reviewUrl === undefined ? snapshot.reviewUrl : next.reviewUrl,
    }
    deps.onChange(snapshot)
  }

  const detachAndStop = () => {
    deps.detachVideo()
    stopMediaStream(stream)
    stream = null
  }

  const releaseReview = () => {
    if (snapshot.reviewUrl) deps.revokeObjectURL(snapshot.reviewUrl)
    snapshot = { ...snapshot, capturedFile: null, reviewUrl: null }
  }

  const invalidateOperations = () => {
    operation += 1
    operationAbort?.abort()
    operationAbort = null
    pendingCapture = null
    pendingUse = null
  }

  const open = () => {
    if (snapshot.status === 'requesting' && pendingOpen) return pendingOpen
    if (!deps.isAvailable()) {
      detachAndStop()
      emit({ status: 'error', error: '当前环境无法使用摄像头，请通过 HTTPS 或 localhost 打开，并保留使用本地照片' })
      return Promise.resolve()
    }

    const currentGeneration = ++generation
    invalidateOperations()
    openAbort?.abort()
    const controller = new AbortController()
    openAbort = controller
    detachAndStop()
    releaseReview()
    emit({ status: 'requesting', capturedFile: null, reviewUrl: null })

    let task: Promise<void>
    task = (async () => {
      let acquired: MediaStreamLike | null = null
      try {
        acquired = await deps.getUserMedia(CAMERA_CONSTRAINTS)
        if (currentGeneration !== generation || controller.signal.aborted) {
          stopMediaStream(acquired)
          return
        }
        stream = acquired
        await deps.prepareVideo(acquired, controller.signal)
        if (currentGeneration !== generation || controller.signal.aborted) {
          if (stream === acquired) detachAndStop()
          else stopMediaStream(acquired)
          return
        }
        emit({ status: 'live', capturedFile: null, reviewUrl: null })
      } catch (error) {
        if (currentGeneration !== generation || controller.signal.aborted) {
          if (acquired && acquired !== stream) stopMediaStream(acquired)
          return
        }
        detachAndStop()
        releaseReview()
        emit({ status: 'error', error: getCameraErrorMessage(error), capturedFile: null, reviewUrl: null })
      } finally {
        if (pendingOpen === task) pendingOpen = null
      }
    })()
    pendingOpen = task
    return task
  }

  const close = () => {
    generation += 1
    openAbort?.abort()
    openAbort = null
    pendingOpen = null
    invalidateOperations()
    detachAndStop()
    releaseReview()
    emit({ status: 'closed', capturedFile: null, reviewUrl: null })
  }

  const capture = () => {
    if (snapshot.status !== 'live') return Promise.resolve()
    if (pendingCapture) return pendingCapture
    const token = ++operation
    const controller = new AbortController()
    operationAbort?.abort()
    operationAbort = controller
    emit({ status: 'live', busy: true })
    let task: Promise<void>
    task = (async () => {
      try {
        const file = await deps.captureFrame()
        if (token !== operation || controller.signal.aborted || snapshot.status !== 'live') return
        releaseReview()
        const reviewUrl = deps.createObjectURL(file)
        if (token !== operation || controller.signal.aborted) {
          deps.revokeObjectURL(reviewUrl)
          return
        }
        emit({ status: 'captured', capturedFile: file, reviewUrl })
      } catch (error) {
        if (token !== operation || controller.signal.aborted) return
        detachAndStop()
        emit({ status: 'error', error: error instanceof Error ? error.message : '拍摄失败，请重试', capturedFile: null, reviewUrl: null })
      } finally {
        if (pendingCapture === task) pendingCapture = null
      }
    })()
    pendingCapture = task
    return task
  }

  const retake = async () => {
    if (snapshot.status !== 'captured') return
    invalidateOperations()
    releaseReview()
    if (stream) emit({ status: 'live', capturedFile: null, reviewUrl: null })
    else await open()
  }

  const usePhoto = () => {
    if (snapshot.status !== 'captured' || !snapshot.capturedFile) return Promise.resolve(false)
    if (pendingUse) return pendingUse
    const file = snapshot.capturedFile
    const reviewUrl = snapshot.reviewUrl
    const token = ++operation
    const controller = new AbortController()
    operationAbort?.abort()
    operationAbort = controller
    detachAndStop()
    emit({ status: 'captured', busy: true, capturedFile: file, reviewUrl })
    let task: Promise<boolean>
    task = (async () => {
      try {
        const committed = await deps.loadPhotoFile(file, controller.signal)
        if (token !== operation || controller.signal.aborted || snapshot.status !== 'captured') return false
        if (!committed) {
          emit({ status: 'captured', error: '无法使用这张照片，请重试', capturedFile: file, reviewUrl })
          return false
        }
        close()
        return true
      } catch (error) {
        if (token !== operation || controller.signal.aborted) return false
        emit({ status: 'captured', error: error instanceof Error ? error.message : '无法使用这张照片，请重试', capturedFile: file, reviewUrl })
        return false
      } finally {
        if (pendingUse === task) pendingUse = null
      }
    })()
    pendingUse = task
    return task
  }

  const dispose = () => {
    generation += 1
    openAbort?.abort()
    invalidateOperations()
    detachAndStop()
    releaseReview()
  }

  return { open, capture, retake, usePhoto, close, dispose, getSnapshot: () => snapshot }
}
