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
}) => {
  const [searchFoldOpen, setSearchFoldOpen] = useState(true)
  if (!open) {
    return (
      <button
        onClick={onOpen}
        className="fixed top-20 right-4 z-20 bg-transparent text-3xl"
        aria-label="打开助手栏"
      >
        <span role="img" aria-label="cat" className="inline-block transition-transform duration-200 hover:scale-125 hover:rotate-12 breath-slow">🐱</span>
      </button>
    )
  }

  return (
    <div className="fixed top-0 right-0 h-full w-80 md:w-96 z-20 px-4 py-6 bg-transparent backdrop-blur-2xl border-l border-white/10 pointer-events-none">
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
      </div>
    </div>
  )
}

export default AssistantSidebar