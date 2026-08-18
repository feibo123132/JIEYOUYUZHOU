import type { CSSProperties } from 'react'
import type { ThemeConfig } from '../../themes/themeConfig'

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
}

type LaneStyle = CSSProperties & {
  '--lane-top': string
  '--lane-duration': string
  '--lane-delay': string
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

const BarragePill = ({ item, theme }: { item: BarrageMessage; theme: ThemeConfig }) => {
  const color = item.color || theme.visual.defaultStarColor
  return (
    <div
      className="barrage-item"
      style={{ borderColor: `${color}66`, boxShadow: `0 0 22px ${color}24` }}
    >
      <span className="barrage-message-text">{item.message}</span>
      <span className="barrage-message-meta" style={{ color }}>
        {item.nickname} · {formatDate(item.createdAt)}
      </span>
    </div>
  )
}

const BarrageLanes = ({
  messages,
  theme,
  laneCount,
  className,
}: MessageBarrageProps & { laneCount: number; className: string }) => {
  const lanes = groupIntoLanes(messages, laneCount)

  return (
    <div className={`barrage-lanes ${className}`} aria-hidden="true">
      {lanes.map((lane, laneIndex) => {
        if (lane.length === 0) return null
        const contentLength = lane.reduce((total, item) => total + item.message.length, 0)
        const duration = Math.min(90, Math.max(24, 18 + contentLength * 0.26 + lane.length * 6))
        const style: LaneStyle = {
          '--lane-top': `${((laneIndex + 0.5) / laneCount) * 100}%`,
          '--lane-duration': `${duration}s`,
          '--lane-delay': `${-(laneIndex * 2.8)}s`,
        }

        return (
          <div key={laneIndex} className="barrage-lane" style={style}>
            {lane.map((item) => <BarragePill key={item.id} item={item} theme={theme} />)}
          </div>
        )
      })}
    </div>
  )
}

const MessageBarrage = ({ messages, theme, immersive = false }: MessageBarrageProps) => {
  if (messages.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        <div className="rounded-full border border-white/10 bg-black/35 px-6 py-3 text-sm text-white/65 backdrop-blur-xl">
          这片星空还在等待第一句话
        </div>
      </div>
    )
  }

  return (
    <section
      className={`barrage-stage ${immersive ? 'barrage-stage--immersive' : ''} absolute inset-0 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/55`}
      aria-label={`${theme.hub.name}留言弹幕。聚焦此区域可暂停动画。`}
      tabIndex={0}
    >
      <BarrageLanes messages={messages} theme={theme} laneCount={8} className="barrage-lanes-desktop" />
      <BarrageLanes messages={messages} theme={theme} laneCount={6} className="barrage-lanes-mobile" />

      <div className="barrage-static-list" aria-label={`${theme.hub.name}留言列表`}>
        {messages.map((item) => (
          <div key={item.id} className="barrage-static-item">
            <span>{item.message}</span>
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
