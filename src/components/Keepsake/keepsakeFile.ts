import { KEEPSAKE_HEIGHT, KEEPSAKE_WIDTH, type Point } from './keepsakeCanvas.ts'

type ImageFileLike = { type: string }
type LoadedImage = { image: CanvasImageSource; width: number; height: number }

export function isSupportedImage(file: ImageFileLike) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
}

export function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getInitialPhotoView(): { zoom: number; pan: Point } {
  return { zoom: 1, pan: { x: 0, y: 0 } }
}

export function scalePointerDelta(dx: number, dy: number, rect: { width: number; height: number }): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  return {
    x: dx * KEEPSAKE_WIDTH / rect.width,
    y: dy * KEEPSAKE_HEIGHT / rect.height,
  }
}

export function createImageResourceManager(deps: {
  createObjectURL: (file: ImageFileLike) => string
  revokeObjectURL: (url: string) => void
  loadImage: (url: string) => Promise<LoadedImage>
}) {
  let requestVersion = 0
  let acceptedUrl: string | null = null
  const pendingUrls = new Set<string>()
  const revoked = new Set<string>()

  const release = (url: string | null) => {
    if (!url || revoked.has(url)) return
    revoked.add(url)
    deps.revokeObjectURL(url)
  }

  return {
    async load(file: ImageFileLike, signal?: AbortSignal): Promise<LoadedImage | null> {
      const version = ++requestVersion
      pendingUrls.forEach(release)
      pendingUrls.clear()
      const url = deps.createObjectURL(file)
      pendingUrls.add(url)
      try {
        const loaded = await deps.loadImage(url)
        if (version !== requestVersion || signal?.aborted) {
          pendingUrls.delete(url)
          release(url)
          return null
        }
        pendingUrls.delete(url)
        release(acceptedUrl)
        acceptedUrl = url
        return loaded
      } catch {
        pendingUrls.delete(url)
        if (version !== requestVersion || signal?.aborted) {
          release(url)
          return null
        }
        release(url)
        throw new Error('无法读取这张照片，请换一张 JPG、PNG 或 WebP 图片')
      }
    },
    dispose() {
      requestVersion += 1
      pendingUrls.forEach(release)
      pendingUrls.clear()
      release(acceptedUrl)
      acceptedUrl = null
    },
  }
}

type ExportCanvas = {
  width: number
  height: number
  toBlob: (callback: (blob: Blob | null) => void, type?: string) => void
}

export async function downloadKeepsakePng(
  canvas: ExportCanvas,
  filename: string,
  deps: {
    createObjectURL: (blob: Blob) => string
    revokeObjectURL: (url: string) => void
    clickDownload: (url: string, filename: string) => void
  },
) {
  if (canvas.width !== KEEPSAKE_WIDTH || canvas.height !== KEEPSAKE_HEIGHT) {
    throw new Error('导出尺寸不正确，请刷新后重试')
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('无法生成 PNG，请稍后重试')
  if (blob.type !== 'image/png') throw new Error('导出结果不是 PNG 格式')

  const url = deps.createObjectURL(blob)
  try {
    deps.clickDownload(url, filename)
  } finally {
    deps.revokeObjectURL(url)
  }
}
