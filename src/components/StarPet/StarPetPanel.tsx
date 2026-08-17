import React, { useEffect, useMemo, useState } from 'react'
import { Cat, Heart, PawPrint, Shower, Moon, Fish } from 'phosphor-react'
import { toast } from 'sonner'
import services from '../../services/starService'
import type { ThemeConfig } from '../../themes/themeConfig'

const { petService } = services

const thresholds = [0, 10, 40, 80, 150, 250, 460, 780, 1210, 1650]

function calcLevel(xp: number) {
  let lvl = 1
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) lvl = i + 1
  }
  if (lvl > 10) lvl = 10
  const curBase = thresholds[Math.min(lvl - 1, thresholds.length - 1)]
  const nextBase = thresholds[Math.min(lvl, thresholds.length - 1)]
  const curXp = Math.max(0, xp - curBase)
  const need = Math.max(1, nextBase - curBase)
  const pct = Math.min(1, curXp / need)
  return { lvl, curXp, need, pct }
}

interface StarPetPanelProps {
  theme: ThemeConfig
  onClose: () => void
  userId?: string
}

const StarPetPanel: React.FC<StarPetPanelProps> = ({ theme, onClose, userId }) => {
  const [xp, setXp] = useState(0)
  const [loading, setLoading] = useState(true)
  const [animKey, setAnimKey] = useState(0)
  const level = useMemo(() => calcLevel(xp), [xp])

  useEffect(() => {
    (async () => {
      try {
        const s = await petService.getPetStatus(theme.id)
        setXp(Number(s.xp || 0))
      } catch {}
      setLoading(false)
    })()
  }, [theme.id])

  const interact = async (type: string) => {
    try {
      const res = await petService.interactWithPet(theme.id, userId)
      if (res.added) {
        setXp(res.xp)
        setAnimKey(k => k + 1)
        toast.success('+1 XP')
        ;(window as any).playClickSound?.()
      } else {
        toast.info('今日已贡献 1 次经验')
      }
    } catch {
      toast.error('互动失败')
    }
  }

  const size = 48 + level.lvl * 6
  const catColor = level.lvl >= 8 ? '#7c3aed' : level.lvl >= 5 ? '#f59e0b' : '#14b8a6'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-white/10 backdrop-blur-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-extrabold">{theme.hub.name} · 公共猫舍</div>
          <button onClick={onClose} className="text-white/80 hover:text-white">关闭</button>
        </div>

        <div className="relative h-48 mb-6 flex items-center justify-center">
          <div key={animKey} className="absolute -inset-8 rounded-full opacity-20 animate-ping" style={{ backgroundColor: catColor }}></div>
          <div className="absolute -inset-14 rounded-full opacity-10 animate-ping" style={{ backgroundColor: catColor, animationDelay: '0.6s' }}></div>
          <Cat size={size} color={catColor} weight="fill" className="drop-shadow-lg" />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">等级 Lv.{level.lvl}</div>
            <div className="text-sm">{level.curXp}/{level.need}</div>
          </div>
          <div className="h-3 mt-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${Math.round(level.pct * 100)}%`, backgroundColor: theme.visual.defaultStarColor }} />
          </div>
          <div className="text-xs text-white/70 mt-1">下一等级解锁：{level.lvl >= 10 ? '星际神兽' : level.lvl >= 8 ? '专属吉他' : level.lvl >= 5 ? '美味猫罐头' : level.lvl >= 3 ? '太空头盔' : '—'}</div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          <button onClick={() => interact('feed')} className="bg-white/10 hover:bg-white/20 rounded-xl p-3 flex flex-col items-center">
            <Fish size={20} />
            <span className="text-xs mt-1">喂食</span>
          </button>
          <button onClick={() => interact('pet')} className="bg-white/10 hover:bg-white/20 rounded-xl p-3 flex flex-col items-center">
            <PawPrint size={20} />
            <span className="text-xs mt-1">撸猫</span>
          </button>
          <button onClick={() => interact('bath')} className="bg-white/10 hover:bg-white/20 rounded-xl p-3 flex flex-col items-center">
            <Shower size={20} />
            <span className="text-xs mt-1">洗澡</span>
          </button>
          <button onClick={() => interact('toy')} className="bg-white/10 hover:bg-white/20 rounded-xl p-3 flex flex-col items-center">
            <Heart size={20} />
            <span className="text-xs mt-1">逗猫棒</span>
          </button>
          <button onClick={() => interact('sleep')} className="bg-white/10 hover:bg-white/20 rounded-xl p-3 flex flex-col items-center">
            <Moon size={20} />
            <span className="text-xs mt-1">哄睡</span>
          </button>
        </div>

        <div className="text-xs text-white/60 mt-3">提示：每天最多贡献 1 次经验，所有用户共享进度。</div>
      </div>
    </div>
  )
}

export default StarPetPanel
