export interface LayoutStarInput {
  id: string
  x: number
  y: number
  size?: number
}

export interface LayoutRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface LayoutOptions {
  width: number
  height: number
  blockedZones?: LayoutRect[]
}

export interface LayoutPosition {
  id: string
  x: number
  y: number
}

interface PixelStar {
  id: string
  x: number
  y: number
  radius: number
}

const GLOW_GAPS = [8, 4, 0] as const
const ITERATIONS_PER_PHASE = 80
const MAX_COLLISION_DISTANCE = 52
const EPSILON = 0.001

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(Math.max(value, minimum), maximum)
)

const iconRadius = (size?: number) => Math.max(20, Math.min(36, size ?? 24)) / 2

const stablePairAngle = (firstId: string, secondId: string) => {
  const key = firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const normalizeRect = (rect: LayoutRect): LayoutRect => ({
  left: Math.min(rect.left, rect.right),
  top: Math.min(rect.top, rect.bottom),
  right: Math.max(rect.left, rect.right),
  bottom: Math.max(rect.top, rect.bottom),
})

const constrainStar = (
  star: PixelStar,
  width: number,
  height: number,
  blockedZones: readonly LayoutRect[],
) => {
  const originalX = star.x
  const originalY = star.y
  const minimumX = Math.min(star.radius, width / 2)
  const maximumX = Math.max(width - star.radius, width / 2)
  const minimumY = Math.min(star.radius, height / 2)
  const maximumY = Math.max(height - star.radius, height / 2)

  star.x = clamp(star.x, minimumX, maximumX)
  star.y = clamp(star.y, minimumY, maximumY)

  const expandedZones = blockedZones.map((zone) => ({
    left: zone.left - star.radius,
    top: zone.top - star.radius,
    right: zone.right + star.radius,
    bottom: zone.bottom + star.radius,
  }))
  const contains = (zone: LayoutRect, x: number, y: number) => (
    x > zone.left + EPSILON
    && x < zone.right - EPSILON
    && y > zone.top + EPSILON
    && y < zone.bottom - EPSILON
  )

  if (expandedZones.some((zone) => contains(zone, star.x, star.y))) {
    const horizontalIntervals = expandedZones
      .filter((zone) => star.y >= zone.top && star.y <= zone.bottom)
      .map((zone) => ({ start: zone.left, end: zone.right }))
    const verticalIntervals = expandedZones
      .filter((zone) => star.x >= zone.left && star.x <= zone.right)
      .map((zone) => ({ start: zone.top, end: zone.bottom }))

    const containingUnion = (value: number, intervals: Array<{ start: number; end: number }>) => {
      let start = value
      let end = value
      let changed = true
      while (changed) {
        changed = false
        intervals.forEach((interval) => {
          if (interval.end < start || interval.start > end) return
          const nextStart = Math.min(start, interval.start)
          const nextEnd = Math.max(end, interval.end)
          if (nextStart !== start || nextEnd !== end) changed = true
          start = nextStart
          end = nextEnd
        })
      }
      return { start, end }
    }

    const horizontal = containingUnion(star.x, horizontalIntervals)
    const vertical = containingUnion(star.y, verticalIntervals)
    const candidates = [
      { x: clamp(horizontal.start, minimumX, maximumX), y: star.y },
      { x: clamp(horizontal.end, minimumX, maximumX), y: star.y },
      { x: star.x, y: clamp(vertical.start, minimumY, maximumY) },
      { x: star.x, y: clamp(vertical.end, minimumY, maximumY) },
    ].map((candidate, index) => ({
      ...candidate,
      blockedCount: expandedZones.filter((zone) => contains(zone, candidate.x, candidate.y)).length,
      distance: Math.hypot(candidate.x - star.x, candidate.y - star.y),
      tie: stablePairAngle(star.id, `blocked-exit-${index}`),
    })).sort((first, second) => (
      first.blockedCount - second.blockedCount
      || first.distance - second.distance
      || first.tie - second.tie
    ))

    star.x = candidates[0].x
    star.y = candidates[0].y
  }

  return Math.abs(star.x - originalX) > EPSILON || Math.abs(star.y - originalY) > EPSILON
}

const resolvePair = (first: PixelStar, second: PixelStar, gap: number) => {
  let deltaX = second.x - first.x
  let deltaY = second.y - first.y
  let distance = Math.hypot(deltaX, deltaY)
  const minimumDistance = first.radius + second.radius + gap * 2

  if (distance >= minimumDistance - EPSILON) return false

  if (distance < EPSILON) {
    const angle = stablePairAngle(first.id, second.id)
    deltaX = Math.cos(angle)
    deltaY = Math.sin(angle)
    distance = 1
  }

  const push = (minimumDistance - distance + EPSILON) / 2
  const unitX = deltaX / distance
  const unitY = deltaY / distance
  first.x -= unitX * push
  first.y -= unitY * push
  second.x += unitX * push
  second.y += unitY * push
  return true
}

const nearbyPairs = (stars: readonly PixelStar[]) => {
  const cells = new Map<string, number[]>()
  const pairs: Array<readonly [number, number]> = []

  stars.forEach((star, starIndex) => {
    const cellX = Math.floor(star.x / MAX_COLLISION_DISTANCE)
    const cellY = Math.floor(star.y / MAX_COLLISION_DISTANCE)
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const neighbours = cells.get(`${cellX + offsetX}:${cellY + offsetY}`) ?? []
        neighbours.forEach((neighbourIndex) => pairs.push([neighbourIndex, starIndex]))
      }
    }
    const key = `${cellX}:${cellY}`
    const cell = cells.get(key) ?? []
    cell.push(starIndex)
    cells.set(key, cell)
  })

  return pairs
}

const hasOverlap = (stars: readonly PixelStar[], gap: number) => nearbyPairs(stars).some(([first, second]) => {
  const firstStar = stars[first]
  const secondStar = stars[second]
  return Math.hypot(secondStar.x - firstStar.x, secondStar.y - firstStar.y)
    < firstStar.radius + secondStar.radius + gap * 2 - EPSILON
})

export const resolveStarLayout = (
  stars: readonly LayoutStarInput[],
  options: LayoutOptions,
): LayoutPosition[] => {
  const width = Number.isFinite(options.width) ? Math.max(0, options.width) : 0
  const height = Number.isFinite(options.height) ? Math.max(0, options.height) : 0

  if (width <= 0 || height <= 0) {
    return stars.map(({ id, x, y }) => ({ id, x, y }))
  }

  const blockedZones = (options.blockedZones ?? []).map(normalizeRect)
  const workingStars: PixelStar[] = stars.map((star) => ({
    id: star.id,
    x: clamp(star.x, 0, 100) * width / 100,
    y: clamp(star.y, 0, 100) * height / 100,
    radius: iconRadius(star.size),
  })).sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)

  workingStars.forEach((star) => constrainStar(star, width, height, blockedZones))

  for (const gap of GLOW_GAPS) {
    for (let iteration = 0; iteration < ITERATIONS_PER_PHASE; iteration += 1) {
      let moved = false
      nearbyPairs(workingStars).forEach(([first, second]) => {
        if (resolvePair(workingStars[first], workingStars[second], gap)) moved = true
      })

      workingStars.forEach((star) => {
        if (constrainStar(star, width, height, blockedZones)) moved = true
      })
      if (!moved) break
    }
    if (!hasOverlap(workingStars, gap)) break
  }

  const positions = new Map(workingStars.map((star) => [star.id, {
    id: star.id,
    x: star.x / width * 100,
    y: star.y / height * 100,
  }]))
  return stars.map((star) => positions.get(star.id) ?? { id: star.id, x: star.x, y: star.y })
}
