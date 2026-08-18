import React, { useState } from 'react'
import { Search, Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

interface AssistantSidebarProps {
  searchName: string
  setSearchName: (v: string) => void
  searchDate: string
  setSearchDate: (v: string) => void
  calendarOpen: boolean
  setCalendarOpen: (v: boolean) => void
  calYear: number
  calMonth: number
  setCalYear: (v: number) => void
  setCalMonth: (updater: (v: number) => number) => void
  buildMonthDays: (year: number, month: number) => Array<Date | null>
  formatYMD: (d: Date) => string
  onReset: () => void
  open: boolean
  onClose: () => void
  onOpen: () => void
  displayMode: 'random' | 'full'
  onChangeDisplayMode: (mode: 'random' | 'full') => void
  barrageMode: boolean
  onChangeBarrageMode: (enabled: boolean) => void
  intimateMode: boolean
  onChangeIntimateMode: (enabled: boolean) => void
  fillMode: boolean
  onChangeFillMode: (enabled: boolean) => void
  isAdminDevice: boolean
  onSetAdminDevice: (v: boolean) => void
}

const AssistantSidebar: React.FC<AssistantSidebarProps> = ({
  searchName,
  setSearchName,
  searchDate,
  setSearchDate,
  calendarOpen,
  setCalendarOpen,
  calYear,
  calMonth,
  setCalYear,
  setCalMonth,
  buildMonthDays,
  formatYMD,
  onReset,
  open,
  onClose,
  onOpen,
  displayMode,
  onChangeDisplayMode,
  barrageMode,
  onChangeBarrageMode,
  intimateMode,
  onChangeIntimateMode,
  fillMode,
  onChangeFillMode,
  isAdminDevice,
  onSetAdminDevice,
}) => {
  const [searchFoldOpen, setSearchFoldOpen] = useState(false)
  const [displayFoldOpen, setDisplayFoldOpen] = useState(false)
  const [barrageFoldOpen, setBarrageFoldOpen] = useState(false)
  const [toolsFoldOpen, setToolsFoldOpen] = useState(false)
  if (!open) {
    return (
      <button
        data-star-safe-zone
        onClick={() => { (window as any).playClickSound?.(); onOpen(); }}
        className="fixed top-4 right-4 z-20 bg-transparent text-3xl"
        aria-label="打开助手栏"
      >
        <span role="img" aria-label="cat" className="inline-block transition-transform duration-200 hover:scale-125 hover:rotate-12 breath-slow">🐱</span>
      </button>
    )
  }

  return (
    <div className="fixed top-0 right-0 h-full w-80 md:w-96 z-20 overflow-y-auto px-4 py-6 bg-transparent backdrop-blur-2xl border-l border-white/10 pointer-events-none">
      <div className="flex items-center justify-between mb-4 pointer-events-auto">
        <div className="text-white text-2xl font-extrabold">💪 助手栏</div>
        <button onClick={onClose} className="text-white/80 hover:text-white">关闭</button>
      </div>

      <div className="space-y-4 pointer-events-auto">
        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setSearchFoldOpen(!searchFoldOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-white"
          >
            <span className="font-semibold text-lg">🔎 检索</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${searchFoldOpen ? 'rotate-0' : '-rotate-90'}`} />
          </button>
          {searchFoldOpen && (
            <div className="p-3 space-y-3">
              <div className="flex items-center bg-white/5 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 mr-2 text-gray-200" />
                <input
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="按用户名搜索"
                  className="bg-transparent outline-none placeholder-gray-300 text-sm w-full text-white"
                />
              </div>
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <button
                  onClick={() => setCalendarOpen(!calendarOpen)}
                  className="flex items-center w-full bg-white/5 rounded-xl px-3 py-2 hover:bg-white/10 text-white"
                >
                  <Calendar className="w-4 h-4 mr-2 text-gray-200" />
                  <span className="text-sm">{searchDate || '年/月/日'}</span>
                </button>
                {calendarOpen && (
                  <div className="mt-3 bg-white/80 text-gray-800 rounded-2xl border border-white/20 p-4 w-full">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-semibold">{calYear}年 {calMonth + 1}月</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCalMonth((m) => { if (m===0){ setCalYear(calYear-1); return 11;} return m-1; })} className="p-1 rounded hover:bg-gray-100">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setCalMonth((m) => { if (m===11){ setCalYear(calYear+1); return 0;} return m+1; })} className="p-1 rounded hover:bg-gray-100">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center text-xs text-gray-500 mb-2">
                      {['日','一','二','三','四','五','六'].map(w => (<div key={w}>{w}</div>))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {buildMonthDays(calYear, calMonth).map((d, idx) => (
                        <button
                          key={idx}
                          disabled={!d}
                          onClick={() => { if (!d) return; const val = formatYMD(d); setSearchDate(val); setCalendarOpen(false); }}
                          className={`h-8 rounded ${d ? 'hover:bg-purple-100' : ''} ${searchDate && d && formatYMD(d)===searchDate ? 'bg-purple-600 text-white' : 'bg-white/80 text-gray-800'}`}
                        >
                          {d ? d.getDate() : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <button
                  onClick={onReset}
                  className="w-full text-xs bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 text-white"
                >
                  重置
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setDisplayFoldOpen(!displayFoldOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-white"
          >
            <span className="font-semibold text-lg">⭐ 星星展示</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${displayFoldOpen ? 'rotate-0' : '-rotate-90'}`} />
          </button>
          {displayFoldOpen && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                <span className="text-sm text-white/90">随机部分（30颗，刷新重置）</span>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={displayMode === 'random'}
                    onChange={(e) => onChangeDisplayMode(e.target.checked ? 'random' : 'full')}
                  />
                  <span className="text-xs text-white/80">{displayMode === 'random' ? '开启' : '关闭'}</span>
                </label>
              </div>
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                <span className="text-sm text-white/90">完全展示（全部星星）</span>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={displayMode === 'full'}
                    onChange={(e) => onChangeDisplayMode(e.target.checked ? 'full' : 'random')}
                  />
                  <span className="text-xs text-white/80">{displayMode === 'full' ? '开启' : '关闭'}</span>
                </label>
              </div>
              <div className="text-xs text-white/60">
                提示：使用“检索”时总是展示所有匹配星星。
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setBarrageFoldOpen(!barrageFoldOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-white"
          >
            <span className="font-semibold text-lg">💬 弹幕</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${barrageFoldOpen ? 'rotate-0' : '-rotate-90'}`} />
          </button>
          {barrageFoldOpen && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-3">
                <div>
                  <div className="text-sm text-white/90">弹幕模式</div>
                  <div className="mt-1 text-xs text-white/55">只保留星空与留言</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={barrageMode}
                  aria-label="弹幕模式"
                  onClick={() => onChangeBarrageMode(!barrageMode)}
                  className={`relative h-7 w-12 rounded-full border transition-colors duration-200 ${barrageMode ? 'border-emerald-300/60 bg-emerald-400/80' : 'border-white/20 bg-white/10'}`}
                >
                  <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${barrageMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-3">
                <div>
                  <div className="text-sm text-white/90">亲密模式</div>
                  <div className="mt-1 text-xs text-white/55">弹幕横纵间距减半</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={intimateMode}
                  aria-label="亲密模式"
                  onClick={() => onChangeIntimateMode(!intimateMode)}
                  className={`relative h-7 w-12 rounded-full border transition-colors duration-200 ${intimateMode ? 'border-emerald-300/60 bg-emerald-400/80' : 'border-white/20 bg-white/10'}`}
                >
                  <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${intimateMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-3">
                <div>
                  <div className="text-sm text-white/90">填充模式</div>
                  <div className="mt-1 text-xs text-white/55">循环补齐弹幕，减少屏幕空白</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={fillMode}
                  aria-label="填充模式"
                  onClick={() => onChangeFillMode(!fillMode)}
                  className={`relative h-7 w-12 rounded-full border transition-colors duration-200 ${fillMode ? 'border-emerald-300/60 bg-emerald-400/80' : 'border-white/20 bg-white/10'}`}
                >
                  <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${fillMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden">
          <button
            onClick={() => setToolsFoldOpen(!toolsFoldOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-white"
          >
            <span className="font-semibold text-lg">🔧 小工具</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${toolsFoldOpen ? 'rotate-0' : '-rotate-90'}`} />
          </button>
          {toolsFoldOpen && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                <span className="text-sm text-white/90">管理员模式</span>
                {isAdminDevice ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-300">已开启</span>
                    <button
                      className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
                      onClick={() => { onSetAdminDevice(false); alert('管理员模式已退出'); }}
                    >
                      退出
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
                    onClick={() => {
                      const pwd = window.prompt('请输入管理员模式密码');
                      if (pwd && pwd === 'JIEYOU2025') {
                        onSetAdminDevice(true);
                        alert('管理员模式已开启');
                      } else if (pwd !== null) {
                        alert('密码错误');
                      }
                    }}
                  >
                    开启
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AssistantSidebar
