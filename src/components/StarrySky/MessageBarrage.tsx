import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { ThemeConfig } from '../../themes/themeConfig'
import {
  getBarrageFillDuration,
  getBarrageFillRepeatCount,
  getBarrageLayout,
  getBarrageLaneDuration,
  getSafeBarrageLaneCount,
  formatBarrageMessage,
} from './barrageLayout'

export interface BarrageMessage {
  id: string
  message: string
  nickname: string
  createdAt: string
  color?: string
}

interface MessageBarrageProps {
  messages: BarrageMessage[]
  theme: ThemeConfig
  immersive?: boolean
  intimate?: boolean
  fill?: boolean
  onSelectMessage?: (starId: string) => void
}

type LaneStyle = CSSProperties & {
  '--lane-top': string
  '--lane-duration': string
  '--lane-delay': string
}

type FilledLaneStyle = CSSProperties & {
  '--lane-top': string
  '--lane-delay': string
  '--fill-duration': string
}

type BarrageStageStyle = CSSProperties & {
  '--barrage-horizontal-gap': string
  '--barrage-static-gap': string
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

const groupIntoLanes = (messages: BarrageMessage[], laneCount: number) => {
  const lanes = Array.from({ length: laneCount }, () => [] as BarrageMessage[])
  messages.forEach((message, index) => lanes[index % laneCount].push(message))
  return lanes
}

const BarragePill = ({ item, theme, onSelectMessage }: {
  item: BarrageMessage
  theme: ThemeConfig
  onSelectMessage?: (starId: string) => void
}) => {
  const color = item.color || theme.visual.defaultStarColor
  const content = (
    <>
      <span className="barrage-message-text">{formatBarrageMessage(item.message)}</span>
      <span className="barrage-message-meta" style={{ color }}>
        {item.nickname} · {formatDate(item.createdAt)}
      </span>
    </>
  )
  if (!onSelectMessage) {
    return <div className="barrage-item" style={{ borderColor: `${color}66`, boxShadow: `0 0 22px ${color}24` }}>{content}</div>
  }
  return (
    <button
      type="button"
      className="barrage-item"
      style={{ borderColor: `${color}66`, boxShadow: `0 0 22px ${color}24` }}
      onClick={() => onSelectMessage?.(item.id)}
      aria-label={`查看${item.nickname}的幸福之星`}
    >
      {content}
    </button>
  )
}

interface FilledBarrageLaneProps {
  lane: BarrageMessage[]
  theme: ThemeConfig
  laneIndex: number
  laneCount: number
  stageWidth: number
  horizontalGap: string
  onSelectMessage?: (starId: string) => void
}

const FilledBarrageLane = ({
  lane,
  theme,
  laneIndex,
  laneCount,
  stageWidth,
  horizontalGap,
  onSelectMessage,
}: FilledBarrageLaneProps) => {
  const probeRef = useRef<HTMLDivElement>(null)
  const [laneMeasurement, setLaneMeasurement] = useState({ baseWidth: 0, gap: 0 })
  const repeatCount = getBarrageFillRepeatCount({
    stageWidth,
    baseWidth: laneMeasurement.baseWidth,
    gap: laneMeasurement.gap,
  })
  const unitWidth = repeatCount * (laneMeasurement.baseWidth + laneMeasurement.gap)
  const duration = getBarrageFillDuration(unitWidth)
  const style: FilledLaneStyle = {
    '--lane-top': `${((laneIndex + 0.5) / laneCount) * 100}%`,
    '--lane-delay': `${-(laneIndex * 2.8)}s`,
    '--fill-duration': `${duration}s`,
  }

  useLayoutEffect(() => {
    const probe = probeRef.current
    if (!probe) return

    let frameId: number | null = null
    const measure = () => {
      const measuredBaseWidth = probe.getBoundingClientRect().width
      const measuredGap = Number.parseFloat(getComputedStyle(probe).columnGap)
      const baseWidth = Number.isFinite(measuredBaseWidth) && measuredBaseWidth > 0
        ? measuredBaseWidth
        : 0
      const gap = Number.isFinite(measuredGap) && measuredGap >= 0 ? measuredGap : 0

      setLaneMeasurement((current) => {
        if (current.baseWidth === baseWidth && current.gap === gap) return current
        return { baseWidth, gap }
      })
    }
    const scheduleMeasure = () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        frameId = null
        measure()
      })
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure)
    observer?.observe(probe)

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      observer?.disconnect()
    }
  }, [stageWidth, lane, horizontalGap])

  return (
    <div className="barrage-lane barrage-lane--fill" style={style}>
      <div ref={probeRef} className="barrage-fill-probe">
        {lane.map((item, messageIndex) => (
          <BarragePill key={`probe-${item.id}-${messageIndex}`} item={item} theme={theme} />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, unitIndex) => (
        <div key={unitIndex} className="barrage-fill-unit">
          {Array.from({ length: repeatCount }, (_, repeatIndex) => (
            <div key={repeatIndex} className="barrage-fill-sequence">
              {lane.map((item, messageIndex) => (
                <BarragePill
                  key={`${unitIndex}-${repeatIndex}-${item.id}-${messageIndex}`}
                  item={item}
                  theme={theme}
                  onSelectMessage={onSelectMessage}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const BarrageLanes = ({
  messages,
  theme,
  laneCount,
  className,
  fill,
  stageWidth,
  horizontalGap,
  onSelectMessage,
}: MessageBarrageProps & {
  laneCount: number
  className: string
  stageWidth: number
  horizontalGap: string
}) => {
  const lanes = groupIntoLanes(messages, laneCount)

  return (
    <div className={`barrage-lanes ${className}`}>
      {lanes.map((lane, laneIndex) => {
        if (lane.length === 0) return null
        if (fill) {
          return (
            <FilledBarrageLane
              key={laneIndex}
              lane={lane}
              theme={theme}
              laneIndex={laneIndex}
              laneCount={laneCount}
              stageWidth={stageWidth}
              horizontalGap={horizontalGap}
              onSelectMessage={onSelectMessage}
            />
          )
        }
        const duration = getBarrageLaneDuration(lane.map((item) => item.message))
        const style: LaneStyle = {
          '--lane-top': `${((laneIndex + 0.5) / laneCount) * 100}%`,
          '--lane-duration': `${duration}s`,
          '--lane-delay': `${-(laneIndex * 2.8)}s`,
        }

        return (
          <div key={laneIndex} className="barrage-lane" style={style}>
            {lane.map((item) => <BarragePill key={item.id} item={item} theme={theme} onSelectMessage={onSelectMessage} />)}
          </div>
        )
      })}
    </div>
  )
}

const MessageBarrage = ({
  messages,
  theme,
  immersive = false,
  intimate = false,
  fill = false,
  onSelectMessage,
}: MessageBarrageProps) => {
  const stageRef = useRef<HTMLElement>(null)
  const [measurement, setMeasurement] = useState({
    stageWidth: 0,
    stageHeight: 0,
    itemHeight: 0,
  })
  const layout = getBarrageLayout(intimate)
  const desktopLaneCount = intimate
    ? getSafeBarrageLaneCount({
        maxLaneCount: layout.desktopLaneCount,
        messageCount: messages.length,
        stageHeight: measurement.stageHeight,
        itemHeight: measurement.itemHeight,
        minimumGap: layout.minimumVerticalGap,
      })
    : layout.desktopLaneCount
  const mobileLaneCount = intimate
    ? getSafeBarrageLaneCount({
        maxLaneCount: layout.mobileLaneCount,
        messageCount: messages.length,
        stageHeight: measurement.stageHeight,
        itemHeight: measurement.itemHeight,
        minimumGap: layout.minimumVerticalGap,
      })
    : layout.mobileLaneCount

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || (!intimate && !fill) || messages.length === 0) return

    let frameId: number | null = null
    const measure = () => {
      const measuredStageWidth = stage.getBoundingClientRect().width
      const measuredStageHeight = stage.getBoundingClientRect().height
      const itemHeights = Array.from(stage.querySelectorAll<HTMLElement>('.barrage-item'))
        .map((item) => item.getBoundingClientRect().height)
        .filter((height) => Number.isFinite(height) && height > 0)
      const stageWidth = Number.isFinite(measuredStageWidth) && measuredStageWidth > 0
        ? measuredStageWidth
        : 0
      const stageHeight = Number.isFinite(measuredStageHeight) && measuredStageHeight > 0
        ? measuredStageHeight
        : 0
      const itemHeight = itemHeights.length > 0 ? Math.max(...itemHeights) : 0

      setMeasurement((current) => {
        if (
          current.stageWidth === stageWidth
          && current.stageHeight === stageHeight
          && current.itemHeight === itemHeight
        ) {
          return current
        }
        return { stageWidth, stageHeight, itemHeight }
      })
    }
    const scheduleMeasure = () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        frameId = null
        measure()
      })
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure)
    observer?.observe(stage)
    stage.querySelectorAll<HTMLElement>('.barrage-item').forEach((item) => {
      observer?.observe(item)
    })

    const widthQuery = window.matchMedia('(max-width: 640px)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    window.addEventListener('resize', scheduleMeasure)
    widthQuery.addEventListener('change', scheduleMeasure)
    motionQuery.addEventListener('change', scheduleMeasure)

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      window.removeEventListener('resize', scheduleMeasure)
      widthQuery.removeEventListener('change', scheduleMeasure)
      motionQuery.removeEventListener('change', scheduleMeasure)
      observer?.disconnect()
    }
  }, [messages, intimate, fill, immersive, desktopLaneCount, mobileLaneCount])

  if (messages.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        <div className="rounded-full border border-white/10 bg-black/35 px-6 py-3 text-sm text-white/65 backdrop-blur-xl">
          这片星空还在等待第一句话
        </div>
      </div>
    )
  }

  const stageStyle: BarrageStageStyle = {
    '--barrage-horizontal-gap': layout.horizontalGap,
    '--barrage-static-gap': layout.staticGap,
  }

  return (
    <section
      ref={stageRef}
      className={`barrage-stage ${immersive ? 'barrage-stage--immersive' : ''} ${intimate ? 'barrage-stage--intimate' : ''} absolute inset-0 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/55`}
      style={stageStyle}
      aria-label={`${theme.hub.name}留言弹幕。聚焦此区域可暂停动画。`}
      tabIndex={0}
    >
      <BarrageLanes
        messages={messages}
        theme={theme}
        laneCount={desktopLaneCount}
        className="barrage-lanes-desktop"
        fill={fill}
        stageWidth={measurement.stageWidth}
        horizontalGap={layout.horizontalGap}
        onSelectMessage={onSelectMessage}
      />
      <BarrageLanes
        messages={messages}
        theme={theme}
        laneCount={mobileLaneCount}
        className="barrage-lanes-mobile"
        fill={fill}
        stageWidth={measurement.stageWidth}
        horizontalGap={layout.horizontalGap}
        onSelectMessage={onSelectMessage}
      />

      <div className="barrage-static-list" aria-label={`${theme.hub.name}留言列表`}>
        {messages.map((item) => (
          <div key={item.id} className="barrage-static-item">
            <span>{formatBarrageMessage(item.message)}</span>
            <small style={{ color: item.color || theme.visual.defaultStarColor }}>
              {item.nickname} · {formatDate(item.createdAt)}
            </small>
          </div>
        ))}
      </div>
    </section>
  )
}

export default MessageBarrage
