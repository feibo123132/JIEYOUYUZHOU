import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, Camera, Check, Download, ImagePlus, RefreshCw, Video } from 'lucide-react'
import {
  KEEPSAKE_FRAMES,
  KEEPSAKE_HEIGHT,
  KEEPSAKE_LOCATION_SENTENCES,
  KEEPSAKE_WIDTH,
  clampPhotoTransform,
  getKeepsakeSentencesForLocation,
  normalizeKeepsakeText,
  renderKeepsake,
  resolveKeepsakeSentenceAfterLocationChange,
  type KeepsakeFrameCategory,
  type KeepsakeFrameId,
  type KeepsakeLocation,
  type KeepsakeSentence,
  type Point,
} from './keepsakeCanvas'
import {
  createImageResourceManager,
  downloadKeepsakePng,
  getInitialPhotoView,
  getLocalDateInputValue,
  isSupportedImage,
  scalePointerDelta,
} from './keepsakeFile'
import {
  captureVideoFrame,
  createCameraWorkflow,
  isCameraAvailable,
  prepareCameraVideo,
  type CameraSnapshot,
} from './keepsakeCamera'

interface KeepsakeStudioProps {
  onBack: () => void
}

interface DragState {
  pointerId: number
  clientX: number
  clientY: number
  startPan: Point
}

const createBrowserImageManager = () => createImageResourceManager({
  createObjectURL: (file) => URL.createObjectURL(file as Blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  loadImage: (url) => new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('image decode failed'))
    image.src = url
  }),
})

export default function KeepsakeStudio({ onBack }: KeepsakeStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const imageManagerRef = useRef<ReturnType<typeof createBrowserImageManager> | null>(null)
  const cameraWorkflowRef = useRef<ReturnType<typeof createCameraWorkflow> | null>(null)
  const dragRef = useRef<DragState | null>(null)
  if (!imageManagerRef.current) imageManagerRef.current = createBrowserImageManager()

  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [photoView, setPhotoView] = useState(getInitialPhotoView)
  const [frameId, setFrameId] = useState<KeepsakeFrameId>('warm-paper')
  const [frameCategory, setFrameCategory] = useState<KeepsakeFrameCategory>('basic')
  const handleCategoryChange = useCallback((category: KeepsakeFrameCategory) => {
    setFrameCategory(category)
    const inCategory = KEEPSAKE_FRAMES.filter((f) => f.category === category)
    if (!inCategory.some((f) => f.id === frameId)) {
      setFrameId(inCategory[0]?.id ?? 'warm-paper')
    }
  }, [frameId])
  const [title, setTitle] = useState('今日留影')
  const [body, setBody] = useState('')
  const [date, setDate] = useState(() => getLocalDateInputValue())
  const [location, setLocation] = useState<KeepsakeLocation>('医大')
  const [sentence, setSentence] = useState<KeepsakeSentence>(KEEPSAKE_LOCATION_SENTENCES.医大)
  const handleLocationChange = (nextLocation: KeepsakeLocation) => {
    setSentence((current) => resolveKeepsakeSentenceAfterLocationChange(current, location, nextLocation))
    setLocation(nextLocation)
  }
  const [error, setError] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot>({
    status: 'closed',
    busy: false,
    error: '',
    capturedFile: null,
    reviewUrl: null,
  })

  useEffect(() => () => imageManagerRef.current?.dispose(), [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    renderKeepsake(ctx, {
      frameId,
      image,
      imageSize,
      zoom: photoView.zoom,
      pan: photoView.pan,
      title,
      body,
      date,
      location,
      sentence,
    })
  }, [body, date, frameId, image, imageSize, location, photoView, sentence, title])

  const loadPhotoFile = useCallback(async (file: File, signal?: AbortSignal) => {
    if (!isSupportedImage(file)) {
      if (!signal) setError('请选择 JPG、PNG 或 WebP 图片')
      return false
    }
    if (!signal) setError('')
    try {
      const loaded = await imageManagerRef.current?.load(file, signal)
      if (!loaded || signal?.aborted) return false
      setImage(loaded.image as HTMLImageElement)
      setImageSize({ width: loaded.width, height: loaded.height })
      setPhotoView(getInitialPhotoView())
      return true
    } catch (loadError) {
      if (!signal?.aborted && !signal) {
        setError(loadError instanceof Error ? loadError.message : '无法读取这张照片')
      }
      return false
    }
  }, [])

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await loadPhotoFile(file)
  }

  useEffect(() => {
    let attachedVideo: HTMLVideoElement | null = null
    const workflow = createCameraWorkflow({
      isAvailable: () => isCameraAvailable({
        isSecureContext: window.isSecureContext,
        mediaDevices: navigator.mediaDevices,
      }),
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      prepareVideo: async (stream, signal) => {
        if (!videoRef.current) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        }
        const video = videoRef.current
        if (!video) throw new Error('摄像头预览尚未准备好')
        attachedVideo = video
        await prepareCameraVideo(video, stream, signal)
      },
      detachVideo: () => {
        const video = attachedVideo ?? videoRef.current
        if (!video) return
        video.pause()
        video.srcObject = null
        attachedVideo = null
      },
      captureFrame: async () => {
        if (!videoRef.current) throw new Error('摄像头画面尚未就绪')
        return captureVideoFrame(videoRef.current)
      },
      loadPhotoFile,
      createObjectURL: (file) => URL.createObjectURL(file),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      onChange: setCameraSnapshot,
    })
    cameraWorkflowRef.current = workflow
    return () => {
      workflow.dispose()
      cameraWorkflowRef.current = null
    }
  }, [loadPhotoFile])

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image || !imageSize) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startPan: photoView.pan,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !imageSize) return
    const delta = scalePointerDelta(
      event.clientX - drag.clientX,
      event.clientY - drag.clientY,
      event.currentTarget.getBoundingClientRect(),
    )
    setPhotoView(clampPhotoTransform(imageSize, photoView.zoom, {
      x: drag.startPan.x + delta.x,
      y: drag.startPan.y + delta.y,
    }))
  }

  const finishDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const handleExport = async () => {
    const canvas = canvasRef.current
    if (!canvas || !image) {
      setError('请先放入一张照片')
      return
    }
    setError('')
    setIsExporting(true)
    try {
      await downloadKeepsakePng(canvas, `JIEYOU留影-${date || getLocalDateInputValue()}.png`, {
        createObjectURL: (blob) => URL.createObjectURL(blob),
        revokeObjectURL: (url) => URL.revokeObjectURL(url),
        clickDownload: (url, filename) => {
          const link = document.createElement('a')
          link.href = url
          link.download = filename
          document.body.appendChild(link)
          link.click()
          link.remove()
        },
      })
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败，请稍后重试')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="relative z-10 min-h-screen overflow-y-auto px-4 py-5 text-white sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-sm text-white/70 backdrop-blur-xl transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-200/70"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <span className="hidden text-[10px] font-bold tracking-[0.3em] text-sky-200/55 sm:block">JIEYOU · MEMORY STUDIO</span>
        </header>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(320px,0.86fr)_minmax(380px,1.14fr)] lg:gap-10">
          <section className="lg:sticky lg:top-8" aria-label="留影预览">
            <div className="mx-auto max-w-[510px] rounded-[2rem] border border-white/10 bg-black/35 p-3 shadow-[0_30px_100px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:p-4">
              <canvas
                ref={canvasRef}
                width={KEEPSAKE_WIDTH}
                height={KEEPSAKE_HEIGHT}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                className={`block h-auto w-full rounded-[1.35rem] ${image ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                style={{ touchAction: 'none' }}
                aria-label={image ? '留影预览，可拖动照片调整位置' : '留影预览，请先上传照片'}
              />
            </div>
            <p className="mt-3 text-center text-xs tracking-[0.08em] text-white/40">
              {image ? '在画面上拖动照片调整位置' : '照片只在你的浏览器中处理，不会上传'}
            </p>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[#071018]/80 p-5 shadow-[0_30px_100px_rgba(0,0,0,.28)] backdrop-blur-2xl sm:p-7 lg:p-8" aria-label="留影编辑器">
            <div className="mb-7">
              <p className="text-[10px] font-bold tracking-[0.3em] text-sky-200/65">MEMORY STUDIO</p>
              <h1 className="mt-2 font-serif text-3xl font-black tracking-tight sm:text-4xl">生命万岁企划</h1>
              <p className="mt-2 max-w-xl text-sm leading-7 text-white/50">放入照片、写下想留下的话，完成后下载一张高清 PNG。</p>
            </div>

            <div className="space-y-7">
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-sky-200/20 bg-sky-300/10 px-5 py-3 text-sm font-bold text-sky-50 transition hover:border-sky-200/35 hover:bg-sky-300/15 focus-within:ring-2 focus-within:ring-sky-200/70">
                  {image ? <Camera className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
                  {image ? '更换照片' : '选择一张照片'}
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} />
                </label>
                <button
                  type="button"
                  onClick={() => { void cameraWorkflowRef.current?.open() }}
                  disabled={cameraSnapshot.status !== 'closed'}
                  className="inline-flex items-center gap-3 rounded-2xl border border-amber-200/25 bg-amber-300/10 px-5 py-3 text-sm font-bold text-amber-50 transition hover:border-amber-200/45 hover:bg-amber-300/15 focus:outline-none focus:ring-2 focus:ring-amber-200/70 disabled:cursor-wait disabled:opacity-55"
                >
                  <Video className="h-5 w-5" />
                  直接拍摄
                </button>
              </div>

              <fieldset>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <legend className="text-xs font-bold tracking-[0.18em] text-white/55">外框</legend>
                  <div className="flex gap-1 rounded-xl border border-white/10 bg-black/25 p-0.5">
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('basic')}
                      className={`rounded-lg px-3 py-1 text-[11px] font-bold transition focus:outline-none focus:ring-2 focus:ring-sky-200/70 ${frameCategory === 'basic' ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/70'}`}
                    >
                      基础
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('mid-autumn')}
                      className={`rounded-lg px-3 py-1 text-[11px] font-bold transition focus:outline-none focus:ring-2 focus:ring-sky-200/70 ${frameCategory === 'mid-autumn' ? 'bg-amber-500/25 text-amber-100' : 'text-white/45 hover:text-white/70'}`}
                    >
                      中秋
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {KEEPSAKE_FRAMES.filter((frame) => frame.category === frameCategory).map((frame) => (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => setFrameId(frame.id)}
                      aria-pressed={frameId === frame.id}
                      className={`rounded-2xl border p-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-200/70 sm:p-3 ${frameId === frame.id ? 'border-white/55 bg-white/10' : 'border-white/10 bg-black/20 hover:border-white/25'}`}
                    >
                      <span className="mb-2 block h-8 rounded-lg border border-black/10" style={{ background: `linear-gradient(135deg, ${frame.palette.paper} 0 65%, ${frame.palette.accent} 65%)` }} />
                      <span className="block text-[11px] font-bold text-white/75 sm:text-xs">{frame.name}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-xs font-bold tracking-[0.12em] text-white/55">
                  标题
                  <input
                    value={title}
                    maxLength={18}
                    onChange={(event) => setTitle(normalizeKeepsakeText('title', event.target.value))}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-normal tracking-normal text-white outline-none transition placeholder:text-white/25 focus:border-sky-200/50"
                    placeholder="今日留影"
                  />
                </label>
                <label className="text-xs font-bold tracking-[0.12em] text-white/55">
                  日期
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-normal tracking-normal text-white outline-none transition focus:border-sky-200/50 [color-scheme:dark]"
                  />
                </label>
                <label className="text-xs font-bold tracking-[0.12em] text-white/55">
                  地点
                  <select
                    value={location}
                    onChange={(event) => handleLocationChange(event.target.value as KeepsakeLocation)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-normal tracking-normal text-white outline-none transition focus:border-sky-200/50 [color-scheme:dark]"
                  >
                    <option value="医大">医大</option>
                    <option value="南湖">南湖</option>
                  </select>
                </label>
              </div>

              <label className="block text-xs font-bold tracking-[0.12em] text-white/55">
                底部句子
                <select
                  value={sentence}
                  onChange={(event) => setSentence(event.target.value as KeepsakeSentence)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-normal tracking-normal text-white outline-none transition focus:border-sky-200/50 [color-scheme:dark]"
                >
                  <option value="不选">不选</option>
                  {getKeepsakeSentencesForLocation(location).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-bold tracking-[0.12em] text-white/55">
                想留下的话
                <textarea
                  value={body}
                  maxLength={80}
                  rows={3}
                  onChange={(event) => setBody(normalizeKeepsakeText('body', event.target.value))}
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-normal leading-6 tracking-normal text-white outline-none transition placeholder:text-white/25 focus:border-sky-200/50"
                  placeholder="这一刻，发生了什么？"
                />
                <span className="mt-1.5 block text-right text-[10px] font-normal tracking-normal text-white/30">{Array.from(body).length}/80</span>
              </label>

              <output aria-live="polite" className={`block min-h-5 text-sm ${error ? 'text-rose-300' : 'text-white/35'}`}>
                {error || '所有内容仅保留在当前页面中'}
              </output>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-100 px-5 py-4 text-sm font-black text-[#081116] shadow-[0_12px_40px_rgba(186,230,253,.18)] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white disabled:cursor-wait disabled:opacity-60"
              >
                <Download className="h-5 w-5" />
                {isExporting ? '正在生成…' : '下载高清 PNG'}
              </button>
            </div>
          </section>
        </div>
      </div>

      {cameraSnapshot.status !== 'closed' && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#010509]/88 px-4 py-6 backdrop-blur-xl">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-dialog-title"
            className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-sky-100/15 bg-[#071018] shadow-[0_40px_140px_rgba(0,0,0,.72)]"
          >
            <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[9px] font-bold tracking-[0.28em] text-amber-200/70">LIVE MEMORY</p>
                <h2 id="camera-dialog-title" className="mt-1 font-serif text-xl font-black">拍下眼前这一刻</h2>
              </div>
              <button
                type="button"
                onClick={() => cameraWorkflowRef.current?.close()}
                className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/55 transition hover:border-white/25 hover:text-white"
              >
                <span>取消</span>
              </button>
            </header>

            <div className="p-4 sm:p-6">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-full w-full object-cover ${cameraSnapshot.status === 'captured' ? 'invisible' : 'visible'}`}
                />

                {cameraSnapshot.status === 'captured' && cameraSnapshot.reviewUrl && (
                  <img src={cameraSnapshot.reviewUrl} alt="刚刚拍摄的照片" className="absolute inset-0 h-full w-full object-cover" />
                )}

                {cameraSnapshot.status === 'requesting' && (
                  <div className="absolute inset-0 grid place-items-center bg-[#071018] text-center">
                    <div>
                      <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-2 border-sky-100/20 border-t-sky-100" />
                      <p className="mt-4 text-sm text-white/65">正在等待摄像头权限…</p>
                    </div>
                  </div>
                )}

                {cameraSnapshot.status === 'error' && (
                  <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_35%,rgba(125,211,252,.12),transparent_45%),#071018] p-7 text-center">
                    <div className="max-w-md">
                      <Camera className="mx-auto h-10 w-10 text-white/35" />
                      <p className="mt-4 text-sm leading-7 text-rose-200">{cameraSnapshot.error}</p>
                    </div>
                  </div>
                )}
              </div>

              <output aria-live="polite" className="mt-3 block min-h-5 text-center text-xs text-white/45">
                {cameraSnapshot.status === 'live' && '摄像头已就绪，确认画面后拍摄'}
                {cameraSnapshot.status === 'captured' && (cameraSnapshot.error || '可以使用这张照片，也可以重拍')}
              </output>

              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {cameraSnapshot.status === 'live' && (
                  <button
                    type="button"
                    disabled={cameraSnapshot.busy}
                    onClick={() => { void cameraWorkflowRef.current?.capture() }}
                    className="inline-flex min-w-36 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[#071018] transition hover:bg-sky-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Camera className="h-5 w-5" />
                    <span>拍摄</span>
                  </button>
                )}

                {cameraSnapshot.status === 'captured' && (
                  <>
                    <button
                      type="button"
                      disabled={cameraSnapshot.busy}
                      onClick={() => { void cameraWorkflowRef.current?.usePhoto() }}
                      className="inline-flex min-w-36 items-center justify-center gap-2 rounded-2xl bg-amber-200 px-5 py-3 text-sm font-black text-[#1b1204] transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Check className="h-5 w-5" />
                      使用照片
                    </button>
                    <button
                      type="button"
                      disabled={cameraSnapshot.busy}
                      onClick={() => { void cameraWorkflowRef.current?.retake() }}
                      className="inline-flex min-w-28 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-white/75 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>重拍</span>
                    </button>
                  </>
                )}

                {cameraSnapshot.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => { void cameraWorkflowRef.current?.open() }}
                    className="inline-flex min-w-32 items-center justify-center gap-2 rounded-2xl bg-sky-100 px-5 py-3 text-sm font-black text-[#071018] transition hover:bg-white"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>重试</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => cameraWorkflowRef.current?.close()}
                  className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-white/55 transition hover:border-white/25 hover:text-white"
                >
                  <span>取消</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
