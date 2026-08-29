export interface BarrageLayout {
  readonly desktopLaneCount: number
  readonly mobileLaneCount: number
  readonly horizontalGap: string
  readonly staticGap: string
  readonly minimumVerticalGap: number
}

export const formatBarrageMessage = (message: string, maxLength = 25) => {
  const characters = Array.from(message)
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength).join('')}……`
    : message
}

export const getBarrageLaneDuration = (messages: readonly string[]) => {
  const contentLength = messages.reduce(
    (total, message) => total + Array.from(formatBarrageMessage(message)).length,
    0,
  )
  return Math.min(90, Math.max(24, 18 + contentLength * 0.26 + messages.length * 6))
}

export interface SafeBarrageLaneCountOptions {
  readonly maxLaneCount: number
  readonly messageCount: number
  readonly stageHeight: number
  readonly itemHeight: number
  readonly minimumGap: number
}

export interface BarrageFillRepeatOptions {
  readonly stageWidth: number
  readonly baseWidth: number
  readonly gap: number
}

const DEFAULT_BARRAGE_LAYOUT: BarrageLayout = {
  desktopLaneCount: 8,
  mobileLaneCount: 6,
  horizontalGap: 'clamp(2.8125rem, 6.75vw, 7.875rem)',
  staticGap: '.75rem',
  minimumVerticalGap: 0,
}

const INTIMATE_BARRAGE_LAYOUT: BarrageLayout = {
  desktopLaneCount: 16,
  mobileLaneCount: 12,
  horizontalGap: 'clamp(0.9375rem, 2.25vw, 2.625rem)',
  staticGap: '.375rem',
  minimumVerticalGap: 10,
}

export const getBarrageLayout = (intimate: boolean): BarrageLayout => (
  intimate ? INTIMATE_BARRAGE_LAYOUT : DEFAULT_BARRAGE_LAYOUT
)

export const getSafeBarrageLaneCount = ({
  maxLaneCount,
  messageCount,
  stageHeight,
  itemHeight,
  minimumGap,
}: SafeBarrageLaneCountOptions) => {
  const maxLanes = Math.max(0, Math.floor(maxLaneCount))
  const messages = Math.max(0, Math.floor(messageCount))
  if (maxLanes === 0 || messages === 0) return 0

  const fallback = Math.min(maxLanes, messages)
  const validMeasurement = [stageHeight, itemHeight, minimumGap]
    .every((value) => Number.isFinite(value))
    && stageHeight > 0
    && itemHeight > 0
    && minimumGap >= 0
  if (!validMeasurement) return fallback

  const capacity = Math.floor(stageHeight / (itemHeight + minimumGap))
  return Math.max(1, Math.min(fallback, capacity))
}

export const getBarrageFillRepeatCount = ({
  stageWidth,
  baseWidth,
  gap,
}: BarrageFillRepeatOptions) => {
  const validMeasurement = Number.isFinite(stageWidth)
    && Number.isFinite(baseWidth)
    && Number.isFinite(gap)
    && stageWidth > 0
    && baseWidth > 0
    && gap >= 0
  if (!validMeasurement) return 1

  return Math.max(1, Math.ceil(stageWidth / (baseWidth + gap)))
}

export const getBarrageFillDuration = (unitWidth: number) => {
  if (!Number.isFinite(unitWidth) || unitWidth <= 0) return 24
  return Math.min(90, Math.max(24, unitWidth / 60))
}
