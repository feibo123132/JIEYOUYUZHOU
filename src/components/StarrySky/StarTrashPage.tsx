import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckSquare, Clock, RotateCcw, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import services, { type StarData } from '../../services/starService'
import type { ThemeConfig } from '../../themes/themeConfig'
import { getTrashDaysRemaining, isTrashExpired, selectAccessibleTrashStars } from './starTrash'

const { starService } = services

interface StarTrashPageProps {
  theme: ThemeConfig
  userId: string
  nickname: string
  isAdminDevice: boolean
  onBack: () => void
}

const StarTrashPage = ({ theme, userId, nickname, isAdminDevice, onBack }: StarTrashPageProps) => {
  const [records, setRecords] = useState<StarData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const loadTrash = useCallback(async () => {
    setLoading(true)
    try {
      const allDeleted = await starService.getTrashStars(theme.id)
      const accessible = selectAccessibleTrashStars(allDeleted, userId, nickname, isAdminDevice)
      const expired = accessible.filter((star) => isTrashExpired(star.deleted_at))
      if (expired.length) {
        await Promise.all(expired.map((star) => starService.permanentDeleteStar(theme.id, star.id)))
      }
      setRecords(accessible.filter((star) => !isTrashExpired(star.deleted_at)))
    } catch (error) {
      console.error('加载回收站失败:', error)
      toast.error('回收站加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [isAdminDevice, nickname, theme.id, userId])

  useEffect(() => { void loadTrash() }, [loadTrash])

  const selected = useMemo(
    () => records.filter((record) => selectedIds.has(record.id)),
    [records, selectedIds],
  )

  const toggle = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const finishAction = (ids: string[]) => {
    setRecords((current) => current.filter((record) => !ids.includes(record.id)))
    setSelectedIds(new Set())
    setSelectionMode(false)
  }

  const restore = async (targets: StarData[]) => {
    await Promise.all(targets.map((record) => starService.restoreStar(theme.id, record.id)))
    finishAction(targets.map((record) => record.id))
    toast.success(targets.length > 1 ? `已恢复 ${targets.length} 项` : '已恢复这颗星星')
  }

  const removeForever = async (targets: StarData[]) => {
    const confirmed = window.confirm(`确定要彻底删除${targets.length > 1 ? `选中的 ${targets.length} 项` : '这颗星星'}吗？此操作无法撤销。`)
    if (!confirmed) return
    await Promise.all(targets.map((record) => starService.permanentDeleteStar(theme.id, record.id)))
    finishAction(targets.map((record) => record.id))
    toast.success(targets.length > 1 ? `已彻底删除 ${targets.length} 项` : '已彻底删除')
  }

  const safely = async (action: () => Promise<void>) => {
    try { await action() } catch (error) {
      console.error('回收站操作失败:', error)
      toast.error('操作失败，请稍后重试')
    }
  }

  return (
    <div className="relative min-h-screen px-4 pb-28 text-white sm:px-6">
      <header className="sticky top-0 z-20 mx-auto flex w-full max-w-3xl items-center justify-between bg-black/25 py-5 backdrop-blur-xl">
        <button type="button" onClick={onBack} className="rounded-full border border-white/10 bg-white/5 p-2.5 text-white/75 transition hover:bg-white/10 hover:text-white" aria-label="返回星空">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold">回收站</h1>
          <p className="mt-1 text-xs text-white/40">{theme.hub.name}</p>
        </div>
        <button
          type="button"
          onClick={() => { setSelectionMode((value) => !value); setSelectedIds(new Set()) }}
          className={`rounded-xl p-2.5 transition ${selectionMode ? 'bg-white/15 text-white' : 'text-white/45 hover:bg-white/10 hover:text-white'}`}
          title="批量管理"
          aria-label="批量管理"
        >
          <CheckSquare className="h-5 w-5" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-3 pt-5">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-white/45">正在整理回收站...</div>
        ) : records.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center text-white/40">
            <Trash2 className="mb-4 h-12 w-12 opacity-25" />
            <p className="text-sm">回收站是空的</p>
          </div>
        ) : records.map((record) => (
          <div key={record.id} className="flex items-center gap-3">
            {selectionMode && (
              <button type="button" onClick={() => toggle(record.id)} className="p-1" aria-label={`选择 ${record.nickname} 的星星`}>
                {selectedIds.has(record.id)
                  ? <CheckSquare className="h-5 w-5 text-amber-300" />
                  : <Square className="h-5 w-5 text-white/30" />}
              </button>
            )}
            <article
              onClick={() => selectionMode && toggle(record.id)}
              className={`flex-1 rounded-2xl border bg-white/[0.055] p-4 shadow-xl backdrop-blur-xl transition ${selectedIds.has(record.id) ? 'border-amber-300/55 ring-1 ring-amber-300/30' : 'border-white/10'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: record.color || theme.visual.defaultStarColor }} />
                    <strong className="truncate text-sm">{record.nickname} 的{theme.sky.detailNoun}</strong>
                  </div>
                  <time className="mt-1 block text-xs text-white/35">点亮于 {new Date(record.created_at).toLocaleString('zh-CN')}</time>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-orange-300/80">
                  <Clock className="h-3.5 w-3.5" />
                  {getTrashDaysRemaining(record.deleted_at)}天后清除
                </span>
              </div>
              {record.message && <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/65">{record.message}</p>}
              {!selectionMode && (
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <button type="button" onClick={(event) => { event.stopPropagation(); void safely(() => removeForever([record])) }} className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10">
                    <Trash2 className="h-3.5 w-3.5" />彻底删除
                  </button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void safely(() => restore([record])) }} className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10">
                    <RotateCcw className="h-3.5 w-3.5" />恢复
                  </button>
                </div>
              )}
            </article>
          </div>
        ))}
      </main>

      {selectionMode && selected.length > 0 ? (
        <div className="fixed inset-x-4 bottom-6 z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#15151b]/95 p-4 shadow-2xl backdrop-blur-xl">
          <span className="mr-auto pl-1 text-sm text-white/65">已选 {selected.length} 项</span>
          <button type="button" onClick={() => void safely(() => restore(selected))} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15"><RotateCcw className="h-3.5 w-3.5" />恢复</button>
          <button type="button" onClick={() => void safely(() => removeForever(selected))} className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" />彻底删除</button>
        </div>
      ) : !selectionMode && (
        <footer className="fixed inset-x-0 bottom-6 text-center text-xs text-white/35">项目将在删除 7 天后被自动永久清除</footer>
      )}
    </div>
  )
}

export default StarTrashPage
