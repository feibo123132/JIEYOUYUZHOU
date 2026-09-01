export const KEEPSAKE_WIDTH = 1200
export const KEEPSAKE_HEIGHT = 1600
export const PHOTO_WINDOW = Object.freeze({ x: 90, y: 185, width: 1020, height: 980 })

export type KeepsakeFrameId = 'warm-paper' | 'midnight-map' | 'cream-collage' | 'moon-glow' | 'jade-rabbit' | 'full-moon'
export type KeepsakeFrameCategory = 'basic' | 'mid-autumn'
export type KeepsakeLocation = '医大' | '南湖'
export const KEEPSAKE_SENTENCES = [
  '人有悲欢离合，月有阴晴圆缺，此事古难全。',
  '生活是独属于每个人自己的感受，不属于任何别人的看法。',
  '欲买桂花同载酒，终不似，少年游。',
] as const
export const KEEPSAKE_LOCATION_SENTENCES = {
  医大: '我在医科大很想你',
  南湖: '我在南湖很想你',
} as const
export type KeepsakeSentence =
  | (typeof KEEPSAKE_SENTENCES)[number]
  | (typeof KEEPSAKE_LOCATION_SENTENCES)[KeepsakeLocation]
  | '不选'

export const getKeepsakeSentencesForLocation = (location: KeepsakeLocation): readonly KeepsakeSentence[] => [
  ...KEEPSAKE_SENTENCES,
  KEEPSAKE_LOCATION_SENTENCES[location],
]

export const resolveKeepsakeSentenceAfterLocationChange = (
  _sentence: KeepsakeSentence,
  _previous: KeepsakeLocation,
  next: KeepsakeLocation,
): KeepsakeSentence => KEEPSAKE_LOCATION_SENTENCES[next]
export type Point = { x: number; y: number }
type PaletteKey = 'paper' | 'ink' | 'accent' | 'detail' | 'mat'

type Decoration =
  | { kind: 'circle'; x: number; y: number; size: number; color: PaletteKey; alpha?: number }
  | { kind: 'star'; x: number; y: number; size: number; color: PaletteKey; alpha?: number }
  | { kind: 'line'; x: number; y: number; width: number; color: PaletteKey; alpha?: number }
  | { kind: 'dots'; x: number; y: number; count: number; gap: number; size: number; color: PaletteKey; alpha?: number }
  | { kind: 'moon'; x: number; y: number; size: number; color: PaletteKey; alpha?: number }
  | { kind: 'lantern'; x: number; y: number; size: number; color: PaletteKey; alpha?: number }
  | { kind: 'cloud'; x: number; y: number; size: number; color: PaletteKey; alpha?: number }
  | { kind: 'rabbit'; x: number; y: number; size: number; color: PaletteKey; alpha?: number }

export interface KeepsakeFrame {
  id: KeepsakeFrameId
  name: string
  category: KeepsakeFrameCategory
  palette: Record<PaletteKey, string>
  typography: {
    titleY: number
    bodyY: number
    metaY: number
    titleSize: number
    bodySize: number
  }
  decorations: Decoration[]
}

export const KEEPSAKE_FRAMES: KeepsakeFrame[] = [
  {
    id: 'warm-paper',
    name: '暖橙手札',
    category: 'basic',
    palette: { paper: '#f2c99a', ink: '#49352b', accent: '#e68132', detail: '#fff4df', mat: '#f8ead7' },
    typography: { titleY: 1270, bodyY: 1348, metaY: 1510, titleSize: 58, bodySize: 31 },
    decorations: [
      { kind: 'dots', x: 75, y: 78, count: 12, gap: 88, size: 5, color: 'ink', alpha: 0.22 },
      { kind: 'star', x: 62, y: 1190, size: 28, color: 'accent' },
      { kind: 'star', x: 1136, y: 1190, size: 34, color: 'detail' },
    ],
  },
  {
    id: 'midnight-map',
    name: '深蓝星图',
    category: 'basic',
    palette: { paper: '#101827', ink: '#f4eedf', accent: '#f0c85a', detail: '#7fc4d8', mat: '#0a101b' },
    typography: { titleY: 1260, bodyY: 1342, metaY: 1510, titleSize: 57, bodySize: 30 },
    decorations: [
      { kind: 'circle', x: 1058, y: 92, size: 37, color: 'accent', alpha: 0.92 },
      { kind: 'dots', x: 88, y: 95, count: 11, gap: 94, size: 4, color: 'detail', alpha: 0.65 },
      { kind: 'line', x: 120, y: 1450, width: 960, color: 'detail', alpha: 0.4 },
    ],
  },
  {
    id: 'cream-collage',
    name: '奶油拼贴',
    category: 'basic',
    palette: { paper: '#f6efd9', ink: '#34362f', accent: '#d8604b', detail: '#78936b', mat: '#e9dfc4' },
    typography: { titleY: 1275, bodyY: 1352, metaY: 1510, titleSize: 56, bodySize: 30 },
    decorations: [
      { kind: 'line', x: 100, y: 128, width: 410, color: 'detail', alpha: 0.62 },
      { kind: 'circle', x: 1084, y: 1214, size: 31, color: 'accent', alpha: 0.88 },
      { kind: 'dots', x: 780, y: 96, count: 7, gap: 48, size: 6, color: 'accent', alpha: 0.55 },
    ],
  },
  // Mid-Autumn Festival frames
  {
    id: 'moon-glow',
    name: '桂月流光',
    category: 'mid-autumn',
    palette: { paper: '#f2efe6', ink: '#3d3022', accent: '#d4a843', detail: '#9a7a4a', mat: '#e8e2d8' },
    typography: { titleY: 1270, bodyY: 1348, metaY: 1510, titleSize: 58, bodySize: 31 },
    decorations: [
      { kind: 'moon', x: 596, y: 100, size: 44, color: 'accent', alpha: 0.92 },
      { kind: 'dots', x: 448, y: 64, count: 3, gap: 12, size: 4, color: 'detail', alpha: 0.5 },
      { kind: 'dots', x: 716, y: 64, count: 3, gap: 12, size: 4, color: 'detail', alpha: 0.5 },
      { kind: 'line', x: 470, y: 170, width: 252, color: 'accent', alpha: 0.4 },
      { kind: 'dots', x: 96, y: 1198, count: 6, gap: 24, size: 7, color: 'accent', alpha: 0.65 },
      { kind: 'dots', x: 1004, y: 1198, count: 6, gap: 24, size: 7, color: 'accent', alpha: 0.65 },
      { kind: 'star', x: 76, y: 1470, size: 22, color: 'accent', alpha: 0.75 },
      { kind: 'star', x: 1124, y: 1470, size: 22, color: 'detail', alpha: 0.75 },
    ],
  },
  {
    id: 'jade-rabbit',
    name: '玉兔衔秋',
    category: 'mid-autumn',
    palette: { paper: '#dce3ed', ink: '#2b2633', accent: '#e8c8b8', detail: '#a8b8a0', mat: '#cdd5e0' },
    typography: { titleY: 1260, bodyY: 1342, metaY: 1510, titleSize: 57, bodySize: 30 },
    decorations: [
      { kind: 'rabbit', x: 560, y: 96, size: 40, color: 'ink', alpha: 0.72 },
      { kind: 'moon', x: 706, y: 84, size: 26, color: 'detail', alpha: 0.85 },
      { kind: 'star', x: 452, y: 74, size: 16, color: 'accent', alpha: 0.75 },
      { kind: 'star', x: 748, y: 142, size: 12, color: 'accent', alpha: 0.6 },
      { kind: 'cloud', x: 88, y: 1200, size: 30, color: 'detail', alpha: 0.45 },
      { kind: 'cloud', x: 992, y: 1200, size: 30, color: 'detail', alpha: 0.45 },
      { kind: 'cloud', x: 140, y: 1558, size: 22, color: 'accent', alpha: 0.3 },
      { kind: 'cloud', x: 1000, y: 1558, size: 22, color: 'accent', alpha: 0.3 },
      { kind: 'line', x: 130, y: 1448, width: 940, color: 'detail', alpha: 0.35 },
    ],
  },
  {
    id: 'full-moon',
    name: '团圆满月',
    category: 'mid-autumn',
    palette: { paper: '#f8e8d8', ink: '#4a2e1e', accent: '#c84a28', detail: '#e8c060', mat: '#f0dec8' },
    typography: { titleY: 1275, bodyY: 1352, metaY: 1510, titleSize: 56, bodySize: 30 },
    decorations: [
      { kind: 'lantern', x: 596, y: 96, size: 42, color: 'accent' },
      { kind: 'lantern', x: 458, y: 100, size: 24, color: 'detail', alpha: 0.9 },
      { kind: 'lantern', x: 734, y: 100, size: 24, color: 'detail', alpha: 0.9 },
      { kind: 'dots', x: 100, y: 1200, count: 4, gap: 28, size: 6, color: 'accent', alpha: 0.55 },
      { kind: 'dots', x: 1006, y: 1200, count: 4, gap: 28, size: 6, color: 'accent', alpha: 0.55 },
      { kind: 'lantern', x: 84, y: 1458, size: 26, color: 'accent', alpha: 0.8 },
      { kind: 'lantern', x: 1116, y: 1458, size: 26, color: 'accent', alpha: 0.8 },
      { kind: 'moon', x: 1120, y: 1198, size: 20, color: 'detail', alpha: 0.7 },
    ],
  },
]

const FIELD_LIMITS = { title: 18, body: 80, signature: 16 } as const

export function normalizeKeepsakeText(field: keyof typeof FIELD_LIMITS, value: string) {
  return Array.from(String(value ?? '')).slice(0, FIELD_LIMITS[field]).join('')
}

type MeasuringContext = Pick<CanvasRenderingContext2D, 'measureText'>

export function wrapCanvasText(ctx: MeasuringContext, text: string, maxWidth: number, maxLines: number) {
  if (!text || maxWidth <= 0 || maxLines <= 0) return []
  const lines: string[] = []
  let truncated = false
  const paragraphs = text.split('\n')

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const chars = Array.from(paragraphs[paragraphIndex])
    if (chars.length === 0) {
      if (lines.length < maxLines) lines.push('')
      else truncated = true
      continue
    }
    let cursor = 0
    while (cursor < chars.length) {
      if (lines.length >= maxLines) {
        truncated = true
        break
      }
      let line = ''
      while (cursor < chars.length) {
        const candidate = line + chars[cursor]
        if (line && ctx.measureText(candidate).width > maxWidth) break
        line = candidate
        cursor += 1
      }
      lines.push(line)
    }
    if (cursor < chars.length || (paragraphIndex < paragraphs.length - 1 && lines.length >= maxLines)) {
      truncated = true
      break
    }
  }

  if (truncated && lines.length) {
    let last = lines.at(-1) ?? ''
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

function snapNearInteger(value: number) {
  return Math.abs(Math.round(value) - value) < 1e-9 ? Math.round(value) : value
}

export function clampPhotoTransform(imageSize: { width: number; height: number }, zoom: number, pan: Point) {
  const safeZoom = Math.max(1, Math.min(3, Number.isFinite(zoom) ? zoom : 1))
  const baseScale = Math.max(PHOTO_WINDOW.width / imageSize.width, PHOTO_WINDOW.height / imageSize.height)
  const width = snapNearInteger(imageSize.width * baseScale * safeZoom)
  const height = snapNearInteger(imageSize.height * baseScale * safeZoom)
  const maxX = Math.max(0, (width - PHOTO_WINDOW.width) / 2)
  const maxY = Math.max(0, (height - PHOTO_WINDOW.height) / 2)
  return {
    zoom: safeZoom,
    pan: {
      x: maxX === 0 ? 0 : Math.max(-maxX, Math.min(maxX, Number.isFinite(pan.x) ? pan.x : 0)),
      y: maxY === 0 ? 0 : Math.max(-maxY, Math.min(maxY, Number.isFinite(pan.y) ? pan.y : 0)),
    },
  }
}

export function getCoverTransform(imageSize: { width: number; height: number }, zoom: number, pan: Point) {
  const clamped = clampPhotoTransform(imageSize, zoom, pan)
  const baseScale = Math.max(PHOTO_WINDOW.width / imageSize.width, PHOTO_WINDOW.height / imageSize.height)
  const scale = baseScale * clamped.zoom
  const rawWidth = imageSize.width * scale
  const rawHeight = imageSize.height * scale
  const width = snapNearInteger(rawWidth)
  const height = snapNearInteger(rawHeight)
  return {
    scale,
    width,
    height,
    x: PHOTO_WINDOW.x + (PHOTO_WINDOW.width - width) / 2 + clamped.pan.x,
    y: PHOTO_WINDOW.y + (PHOTO_WINDOW.height - height) / 2 + clamped.pan.y,
    pan: clamped.pan,
  }
}

export interface KeepsakeRenderState {
  frameId: KeepsakeFrameId
  image: CanvasImageSource | null
  imageSize: { width: number; height: number } | null
  zoom: number
  pan: Point
  title: string
  body: string
  date: string
  location: KeepsakeLocation
  sentence: KeepsakeSentence
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath()
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? size : size * 0.42
    const angle = -Math.PI / 2 + point * Math.PI / 5
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (point === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save()
  ctx.globalAlpha *= 0.16
  ctx.beginPath()
  ctx.arc(x, y, size * 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha *= 2.2
  ctx.beginPath()
  ctx.arc(x, y, size * 1.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()
}

function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.lineWidth = Math.max(2, size * 0.07)
  ctx.beginPath()
  ctx.moveTo(x, y - size * 1.45)
  ctx.lineTo(x, y - size * 0.85)
  ctx.stroke()
  ctx.fillRect(x - size * 0.3, y - size * 0.92, size * 0.6, size * 0.2)
  ctx.beginPath()
  ctx.ellipse(x, y, size * 0.72, size * 0.85, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x - size * 0.3, y + size * 0.72, size * 0.6, size * 0.2)
  ctx.lineWidth = Math.max(2, size * 0.08)
  ctx.beginPath()
  ctx.moveTo(x, y + size * 0.92)
  ctx.lineTo(x, y + size * 1.35)
  ctx.stroke()
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath()
  ctx.moveTo(x + size * 0.55, y)
  ctx.arc(x, y, size * 0.55, 0, Math.PI * 2)
  ctx.moveTo(x + size * 1.12, y - size * 0.25)
  ctx.arc(x + size * 0.7, y - size * 0.25, size * 0.42, 0, Math.PI * 2)
  ctx.moveTo(x + size * 1.85, y)
  ctx.arc(x + size * 1.35, y, size * 0.5, 0, Math.PI * 2)
  ctx.moveTo(x + size * 1.28, y + size * 0.28)
  ctx.arc(x + size * 0.68, y + size * 0.28, size * 0.6, 0, Math.PI * 2)
  ctx.fill()
}

function drawRabbit(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath()
  ctx.arc(x - size * 0.8, y + size * 0.18, size * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x, y + size * 0.22, size * 0.78, size * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + size * 0.68, y - size * 0.18, size * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(x + size * 0.74, y - size * 0.46)
  ctx.rotate(-0.22)
  ctx.beginPath()
  ctx.ellipse(0, -size * 0.32, size * 0.11, size * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.rotate(0.46)
  ctx.beginPath()
  ctx.ellipse(0, -size * 0.32, size * 0.11, size * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.ellipse(x + size * 0.52, y + size * 0.52, size * 0.22, size * 0.14, 0.4, 0, Math.PI * 2)
  ctx.fill()
}

function drawDecorations(ctx: CanvasRenderingContext2D, frame: KeepsakeFrame) {
  for (const item of frame.decorations) {
    ctx.save()
    ctx.globalAlpha = item.alpha ?? 1
    ctx.fillStyle = frame.palette[item.color]
    ctx.strokeStyle = frame.palette[item.color]
    if (item.kind === 'circle') {
      ctx.beginPath()
      ctx.arc(item.x, item.y, item.size, 0, Math.PI * 2)
      ctx.fill()
    } else if (item.kind === 'star') {
      drawStar(ctx, item.x, item.y, item.size)
    } else if (item.kind === 'line') {
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(item.x, item.y)
      ctx.lineTo(item.x + item.width, item.y)
      ctx.stroke()
    } else if (item.kind === 'moon') {
      drawMoon(ctx, item.x, item.y, item.size)
    } else if (item.kind === 'lantern') {
      drawLantern(ctx, item.x, item.y, item.size)
    } else if (item.kind === 'cloud') {
      drawCloud(ctx, item.x, item.y, item.size)
    } else if (item.kind === 'rabbit') {
      drawRabbit(ctx, item.x, item.y, item.size)
    } else {
      for (let index = 0; index < item.count; index += 1) {
        ctx.beginPath()
        ctx.arc(item.x + index * item.gap, item.y, item.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

export function renderKeepsake(ctx: CanvasRenderingContext2D, state: KeepsakeRenderState) {
  const frame = KEEPSAKE_FRAMES.find((item) => item.id === state.frameId) ?? KEEPSAKE_FRAMES[0]
  const title = normalizeKeepsakeText('title', state.title).trim() || '今日留影'
  const body = normalizeKeepsakeText('body', state.body)

  ctx.clearRect(0, 0, KEEPSAKE_WIDTH, KEEPSAKE_HEIGHT)
  ctx.fillStyle = frame.palette.paper
  ctx.fillRect(0, 0, KEEPSAKE_WIDTH, KEEPSAKE_HEIGHT)
  drawDecorations(ctx, frame)

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, .22)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 14
  roundedPath(ctx, 30, 30, KEEPSAKE_WIDTH - 60, KEEPSAKE_HEIGHT - 60, 54)
  ctx.strokeStyle = frame.palette.ink
  ctx.lineWidth = 10
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = frame.palette.detail
  roundedPath(ctx, 62, 62, 350, 76, 24)
  ctx.fill()
  ctx.strokeStyle = frame.palette.ink
  ctx.lineWidth = 5
  ctx.stroke()
  ctx.fillStyle = frame.palette.ink
  ctx.font = '800 28px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('JIEYOU×生命万岁企划', 237, 100)

  ctx.fillStyle = frame.palette.detail
  roundedPath(ctx, 780, 62, 220, 76, 24)
  ctx.fill()
  ctx.strokeStyle = frame.palette.ink
  ctx.lineWidth = 5
  ctx.stroke()
  roundedPath(ctx, 1018, 62, 120, 76, 24)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = frame.palette.ink
  ctx.font = '800 24px "Microsoft YaHei", sans-serif'
  ctx.fillText(state.date || '', 890, 100)
  ctx.fillText(state.location, 1078, 100)

  ctx.fillStyle = frame.palette.mat
  roundedPath(ctx, PHOTO_WINDOW.x - 10, PHOTO_WINDOW.y - 10, PHOTO_WINDOW.width + 20, PHOTO_WINDOW.height + 20, 38)
  ctx.fill()

  ctx.save()
  roundedPath(ctx, PHOTO_WINDOW.x, PHOTO_WINDOW.y, PHOTO_WINDOW.width, PHOTO_WINDOW.height, 30)
  ctx.clip()
  if (state.image && state.imageSize) {
    const transform = getCoverTransform(state.imageSize, state.zoom, state.pan)
    ctx.drawImage(state.image, transform.x, transform.y, transform.width, transform.height)
  } else {
    ctx.fillStyle = frame.palette.mat
    ctx.fillRect(PHOTO_WINDOW.x, PHOTO_WINDOW.y, PHOTO_WINDOW.width, PHOTO_WINDOW.height)
    ctx.fillStyle = frame.palette.ink
    ctx.globalAlpha = 0.45
    ctx.font = '700 34px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('请放入一张照片', KEEPSAKE_WIDTH / 2, PHOTO_WINDOW.y + PHOTO_WINDOW.height / 2)
  }
  ctx.restore()

  roundedPath(ctx, PHOTO_WINDOW.x, PHOTO_WINDOW.y, PHOTO_WINDOW.width, PHOTO_WINDOW.height, 30)
  ctx.strokeStyle = frame.palette.ink
  ctx.lineWidth = 9
  ctx.stroke()

  ctx.fillStyle = frame.palette.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${frame.typography.titleSize}px "Noto Serif SC", "Songti SC", "Microsoft YaHei", serif`
  ctx.fillText(title, KEEPSAKE_WIDTH / 2, frame.typography.titleY)

  ctx.font = `600 ${frame.typography.bodySize}px "Noto Serif SC", "Songti SC", "Microsoft YaHei", serif`
  const bodyLines = wrapCanvasText(ctx, body, 910, 3)
  bodyLines.forEach((line, index) => {
    ctx.fillText(line, KEEPSAKE_WIDTH / 2, frame.typography.bodyY + index * 42)
  })

  ctx.font = '700 22px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  if (state.sentence !== '不选') {
    ctx.fillText(state.sentence, KEEPSAKE_WIDTH / 2, frame.typography.metaY)
  }
}
