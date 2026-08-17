// src/components/StarrySky/StarrySky.tsx (修正后的完整版)

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RotateCcw, Trash2, Sparkles } from 'lucide-react';
import { Star as PStar, Heart, Cloud, Moon, Mountains, Leaf, MusicNotes, Bird, Cat, Dog, Waves, PaperPlane } from 'phosphor-react';
import UserStar from './UserStar';
import StarPetPanel from '../StarPet/StarPetPanel';
import { toast } from 'sonner';
import CreateStarModal from './CreateStarModal';
import AssistantSidebar from './AssistantSidebar';
import { tcbService, isTcbReachable, tcbApp } from '../../services/tcb';

// ↓↓↓↓↓↓ [修正] 使用正确的默认导入并解构出 starService ↓↓↓↓↓↓
import services from '../../services/starService';
const { starService } = services;

interface StarData {
  id: string;
  x: number;
  y: number;
  nickname: string;
  createdAt: string;
  isNew?: boolean;
  isJustCreated?: boolean;
  color?: string;
  size?: number;
  shape?: string;
  userId?: string;
  message?: string;
}

interface StarrySkyProps {
  userNickname: string;
  onBack: () => void;
  userId: string;
}

const StarrySky: React.FC<StarrySkyProps> = ({ userNickname, onBack, userId }) => {
  const [stars, setStars] = useState<StarData[]>([]);
  const [selectedStar, setSelectedStar] = useState<StarData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [displayMode, setDisplayMode] = useState<'random' | 'full'>('random');
  const [isAdminDevice, setIsAdminDevice] = useState<boolean>(false);
  const [starPetOpen, setStarPetOpen] = useState<boolean>(false);
  const [welcomeInfo, setWelcomeInfo] = useState<{ nickname: string; count: number } | null>(null);

  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const buildMonthDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
    return days;
  };
  
  // 加载现有星星数据
  useEffect(() => {
    const loadStars = async () => {
      try {
        const allStars = await starService.getAllStars();
        const formattedStars = allStars.map(star => ({
          id: star.id,
          x: star.position_x,
          y: star.position_y,
          nickname: star.nickname,
          createdAt: star.created_at,
          color: star.color,
          size: star.size,
          shape: star.shape,
          userId: star.user_id,
          message: star.message
        }));
        setStars(formattedStars);
      } catch (error) {
        console.error('加载星星失败:', error);
        toast.error('加载星星失败，请刷新页面重试');
      }
    };

    loadStars();
  }, []);

  useEffect(() => {
    try {
      setIsAdminDevice(localStorage.getItem('is_admin_device') === 'true');
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
  }, []);

  // 生成随机位置
  const generateRandomPosition = (): { x: number; y: number } => {
    let x = 50, y = 50;
    let attempts = 0;
    const minDistance = 15; // 与其他星星的最小距离（百分比）
    const MARGIN = 12; // 与边缘的安全边距（百分比）
    const blockedZones = [
      { x1: 0, y1: 0, x2: 100, y2: 8 },   // 顶部标题区域
      { x1: 0, y1: 85, x2: 100, y2: 100 }, // 底部按钮区域
      { x1: 0, y1: 0, x2: 18, y2: 18 },   // 左上角返回按钮区域
      { x1: 82, y1: 0, x2: 100, y2: 22 },  // 右上角用户/助手按钮区域
      { x1: 35, y1: 80, x2: 65, y2: 95 },  // 底部居中CTA近邻
    ];

    const inBlocked = (px: number, py: number) => blockedZones.some(z => px >= z.x1 && px <= z.x2 && py >= z.y1 && py <= z.y2);

    do {
      x = Math.random() * (100 - MARGIN * 2) + MARGIN; // 留出边缘安全区
      y = Math.random() * (100 - MARGIN * 2) + MARGIN;
      attempts++;
    } while (
      attempts < 80 && (
        inBlocked(x, y) ||
        stars.some(star => {
          const distance = Math.sqrt(Math.pow(star.x - x, 2) + Math.pow(star.y - y, 2));
          return distance < minDistance;
        })
      )
    );

    return { x, y };
  };

  const todayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const readQuota = () => {
    const raw = localStorage.getItem('device_daily_quota');
    const t = todayStr();
    if (!raw) return { date: t, count: 0 };
    try {
      const obj = JSON.parse(raw);
      if (!obj || obj.date !== t) return { date: t, count: 0 };
      return { date: obj.date, count: Number(obj.count) || 0 };
    } catch {
      return { date: t, count: 0 };
    }
  };

  const writeQuota = (q: { date: string; count: number }) => {
    localStorage.setItem('device_daily_quota', JSON.stringify(q));
  };

  // 点亮新星星
  const handleOpenCreateModal = () => {
    (window as any).playClickSound?.();
    setIsCreateModalOpen(true);
  };

  const handleConfirmCreate = async (data: { color: string; size: number; shape: string; message: string }) => {
    if (isCreating) return;
    const bypass = userNickname === 'JIEYOU不解忧' || isAdminDevice;
    if (!bypass) {
      const q = readQuota();
      if (q.count >= 3) {
        setIsCreateModalOpen(false);
        toast.error('今日点亮次数已用完');
        return;
      }
    }
    setIsCreating(true);
    setIsCreateModalOpen(false);
    try {
      const position = generateRandomPosition();
      const newStarData = await starService.createStar(userId, userNickname, position, { ...data, isAdminDevice });
      const newStar: StarData = {
        id: newStarData.id,
        x: newStarData.position_x,
        y: newStarData.position_y,
        nickname: newStarData.nickname,
        createdAt: newStarData.created_at,
        isNew: true,
        isJustCreated: true,
        color: newStarData.color,
        size: newStarData.size,
        shape: newStarData.shape,
        userId: newStarData.user_id,
        message: newStarData.message
      };
      setStars(prev => {
        const next = [...prev, newStar];
        setWelcomeInfo({ nickname: userNickname, count: next.length });
        return next;
      });
      if (!bypass) {
        const q = readQuota();
        writeQuota({ date: q.date, count: q.count + 1 });
      }
      toast.success(`✨ ${userNickname} 点亮了一颗新星星！`);
      setTimeout(() => {
        setStars(prev => prev.map(star => 
          star.id === newStar.id ? { ...star, isNew: false } : star
        ));
      }, 3000);
      setTimeout(() => {
        setStars(prev => prev.map(star => 
          star.id === newStar.id ? { ...star, isJustCreated: false } : star
        ));
      }, 10000);
    } catch (error) {
      const msg = (error as any)?.message || '';
      if (msg === 'quota_exceeded') {
        toast.error('今日点亮次数已达上限 (3 次)');
      } else {
        toast.error('点亮星星失败，请重试');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const preCheckSfx = async (): Promise<boolean> => {
    const bypass = userNickname === 'JIEYOU不解忧' || isAdminDevice;
    if (bypass) return true;
    const q = readQuota();
    if (q.count >= 3) {
      toast.error('今日点亮次数已用完');
      return false;
    }
    try {
      if (tcbApp && await isTcbReachable()) {
        const c = await tcbService.getTodayCountByNickname(userNickname);
        if (c >= 3) {
          toast.error('今日点亮次数已达上限 (3 次)');
          return false;
        }
      }
    } catch {}
    return true;
  };

  const handleDeleteStar = async (starId: string) => {
    const ok = await starService.deleteStar(starId);
    if (ok) {
      setStars(prev => prev.filter(s => s.id !== starId));
      setSelectedStar(null);
      toast.success('已删除这颗星星');
    } else {
      toast.error('删除失败');
    }
  };

  // 格式化时间
  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dateString; // 如果格式化失败，返回原始字符串
    }
  };

  const visibleStars = useMemo(() => {
    const filtered = stars.filter((s) => {
      const nameOk = searchName ? s.nickname.includes(searchName) : true;
      const dateOk = searchDate ? (() => { const d = new Date(s.createdAt); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` === searchDate; })() : true;
      return nameOk && dateOk;
    });
    const needAll = Boolean(searchName) || Boolean(searchDate) || displayMode === 'full';
    if (needAll) return filtered;
    const arr = [...filtered];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 30);
  }, [stars, searchName, searchDate, displayMode]);

  useEffect(() => {
    if (welcomeInfo) {
      const t = setTimeout(() => setWelcomeInfo(null), 6500);
      return () => clearTimeout(t);
    }
  }, [welcomeInfo]);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
        <div className="flex items-center justify-center gap-3">
          <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
          <h1 className="text-2xl md:text-4xl font-extrabold text-white">
            我们的JIEYOU宇宙
          </h1>
          <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
        </div>
      </div>
      <AssistantSidebar
        searchName={searchName}
        setSearchName={setSearchName}
        searchDate={searchDate}
        setSearchDate={setSearchDate}
        calendarOpen={calendarOpen}
        setCalendarOpen={setCalendarOpen}
        calYear={calYear}
        calMonth={calMonth}
        setCalYear={setCalYear}
        setCalMonth={setCalMonth}
        buildMonthDays={buildMonthDays}
        formatYMD={formatYMD}
        onReset={() => { setSearchName(''); setSearchDate(''); }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
        displayMode={displayMode}
        onChangeDisplayMode={(mode) => setDisplayMode(mode)}
        isAdminDevice={isAdminDevice}
        onSetAdminDevice={(v) => { try { localStorage.setItem('is_admin_device', v ? 'true' : 'false'); } catch {}; setIsAdminDevice(v); }}
        onOpenStarPet={() => setStarPetOpen(true)}
      />

      {/* 顶部导航 */}
      <div className="relative z-10 flex justify-between items-center p-4">
        <button
          onClick={() => { (window as any).playClickSound?.(); onBack(); }}
          className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-white/30 transition-all duration-200 flex items-center space-x-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>返回</span>
        </button>
      </div>

      {/* 星星显示区域 */}
      <div className="relative w-full h-screen">
        {visibleStars.map((star) => (
          <UserStar
            key={star.id}
            x={star.x}
            y={star.y}
            nickname={star.nickname}
            createdAt={star.createdAt}
            isNew={star.isNew}
            isJustCreated={star.isJustCreated}
            onClick={() => setSelectedStar(star)}
            color={star.color}
            size={star.size}
            shape={star.shape}
            message={star.message}
            canDelete={star.userId === userId}
            onDelete={() => handleDeleteStar(star.id)}
          />
        ))}
      </div>

      {/* 底部操作区域 */}
      <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex flex-col items-center space-y-4">
          <button
            onClick={handleOpenCreateModal}
            disabled={isCreating}
            className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-2xl hover:shadow-yellow-500/25 disabled:cursor-not-allowed disabled:scale-100 flex items-center space-x-3"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>正在点亮...</span>
              </>
            ) : (
              <>
                <Plus className="w-6 h-6" />
                <span>点亮星星</span>
              </>
            )}
          </button>
          <div className="text-white/70 text-sm text-center">
            <p>点击按钮，在星空中点亮属于你的星星 ✨</p>
          </div>
        </div>
      </div>

      {/* 星星详情模态框 */}
      {selectedStar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 max-w-sm w-full border border-white/20 shadow-2xl">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                {(() => {
                  const EmojiIcon = (emoji: string) => (props: any) => (
                    <span style={{ fontSize: props.size, lineHeight: 1 }}>{emoji}</span>
                  );
                  const FullMoonIcon = (props: any) => (
                    <svg width={props.size} height={props.size} viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r="22" fill={props.color || '#FFD700'} />
                      <circle cx="16" cy="20" r="3" fill="rgba(255,255,255,0.4)" />
                      <circle cx="30" cy="28" r="2" fill="rgba(255,255,255,0.3)" />
                    </svg>
                  );
                  const shapeIcons: Record<string, React.ComponentType<any>> = {
                    star: PStar,
                    heart: Heart,
                    cloud: Cloud,
                    moon: Moon,
                    fullmoon: FullMoonIcon,
                    mountain: Mountains,
                    leaf: Leaf,
                    music: MusicNotes,
                    bird: Bird,
                    cat: (props: any) => <Cat {...props} weight="fill" />,
                    cat2: (props: any) => <Cat {...props} weight="duotone" />,
                    cat3: (props: any) => <Cat {...props} weight="thin" />,
                    dog: (props: any) => <Dog {...props} weight="fill" />,
                    dog2: (props: any) => <Dog {...props} weight="duotone" />,
                    dog3: (props: any) => <Dog {...props} weight="thin" />,
                    waves: (props: any) => <Waves {...props} weight="fill" />,
                    kite: (props: any) => <PaperPlane {...props} weight="fill" />,
                    apple: EmojiIcon('🍎'),
                    orange: EmojiIcon('🍊'),
                    banana: EmojiIcon('🍌'),
                    watermelon: EmojiIcon('🍉'),
                    grapes: EmojiIcon('🍇'),
                    aries: EmojiIcon('♈'),
                    taurus: EmojiIcon('♉'),
                    gemini: EmojiIcon('♊'),
                    cancer: EmojiIcon('♋'),
                    leo: EmojiIcon('♌'),
                    virgo: EmojiIcon('♍'),
                    libra: EmojiIcon('♎'),
                    scorpio: EmojiIcon('♏'),
                    sagittarius: EmojiIcon('♐'),
                    capricorn: EmojiIcon('♑'),
                    aquarius: EmojiIcon('♒'),
                    pisces: EmojiIcon('♓'),
                  };
                  const key = selectedStar.shape || 'star';
                  const Icon = shapeIcons[key];
                  return Icon ? (
                    <Icon size={48} color={selectedStar.color || '#FFD700'} weight="fill" />
                  ) : (
                    <PStar size={48} color={selectedStar.color || '#FFD700'} weight="fill" />
                  );
                })()}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{selectedStar.nickname} 的星星</h3>
                <p className="text-gray-600 text-sm">点亮时间: {formatTime(selectedStar.createdAt)}</p>
                {selectedStar.message && (<p className="text-gray-700 text-sm mt-2">{selectedStar.message}</p>)}
              </div>
              <div className="flex space-x-3">
                <button onClick={() => { (window as any).playClickSound?.(); setSelectedStar(null); }} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg transition-colors duration-200">
                  关闭
                </button>
                {selectedStar.userId === userId && (
                  <button onClick={() => { (window as any).playClickSound?.(); handleDeleteStar(selectedStar.id); }} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2">
                    <Trash2 className="w-4 h-4" />
                    <span>删除</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {starPetOpen && (
        <StarPetPanel onClose={() => setStarPetOpen(false)} userId={userId} />
      )}

      {welcomeInfo && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 max-w-sm w-full border border-white/20 shadow-2xl">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Sparkles className="w-6 h-6 text-purple-500" />
              <div className="text-xl font-extrabold text-gray-900">欢迎 {welcomeInfo.nickname} 的到来</div>
              <Sparkles className="w-6 h-6 text-purple-500" />
            </div>
            <div className="text-gray-700 text-sm text-center">已为你点亮 JIEYOU 宇宙的第 <span className="text-purple-600 font-semibold">{welcomeInfo.count}</span> 颗星星</div>
            <div className="mt-4 flex justify-center">
              <button onClick={() => setWelcomeInfo(null)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg">好的</button>
            </div>
          </div>
        </div>
      )}

      <CreateStarModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleConfirmCreate}
        defaultColor="#FFD700" // 简化了 draft 状态
        allowSfx={isAdminDevice || userNickname === 'JIEYOU不解忧' || readQuota().count < 3}
        onPreCheck={preCheckSfx}
        incomingIndex={stars.length + 1}
      />
    </div>
  );
};

export default StarrySky;
