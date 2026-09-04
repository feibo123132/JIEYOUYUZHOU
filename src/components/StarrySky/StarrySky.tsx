// src/components/StarrySky/StarrySky.tsx (修正后的完整版)

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ArrowLeft, ArrowRight, Pencil, RotateCcw, Trash2, Sparkles, X } from 'lucide-react';
import { Star as PStar, Heart, Cloud, Moon, Mountains, Leaf, MusicNotes, Bird, Cat, Dog, Waves, PaperPlane } from 'phosphor-react';
import UserStar from './UserStar';
import { toast } from 'sonner';
import CreateStarModal from './CreateStarModal';
import AssistantSidebar from './AssistantSidebar';
import MessageBarrage, { type BarrageMessage } from './MessageBarrage';
import MyMessagesPage from './MyMessagesPage';
import StarMessagesPage from './StarMessagesPage';
import HappinessSkyPage from './HappinessSkyPage';
import StarTrashPage from './StarTrashPage';
import type { ThemeConfig } from '../../themes/themeConfig';
import { resolveStarLayout, type LayoutRect } from '../../utils/starLayout';
import { createInitialBarragePreferences, setBarragePreference } from './barragePreferences';
import { openHappinessMeowGenerator } from '../../utils/meowGenerator';
import { selectVisibleStars } from './starDisplay';
import { restoreHappinessPortraitFocus } from './happinessPortrait';

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
  theme: ThemeConfig;
  userNickname: string;
  onBack: () => void;
  userId: string;
  initialView?: 'stars' | 'my-messages' | 'star-messages';
}

const createInitialStarrySkyBarragePreferences = () => ({
  ...createInitialBarragePreferences(),
  fill: true,
});

const StarrySky: React.FC<StarrySkyProps> = ({ theme, userNickname, onBack, userId, initialView = 'stars' }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const starFieldRef = useRef<HTMLDivElement>(null);
  const happinessPortraitTriggerRef = useRef<HTMLButtonElement>(null);
  const [stars, setStars] = useState<StarData[]>([]);
  const [selectedStar, setSelectedStar] = useState<StarData | null>(null);
  const [pendingDeleteStarId, setPendingDeleteStarId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingStar, setEditingStar] = useState<StarData | null>(null);
  const [searchName, setSearchName] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [starDisplayMode, setStarDisplayMode] = useState<'random' | 'full'>('random');
  const [messageDisplayMode, setMessageDisplayMode] = useState<'random' | 'full'>('full');
  const [isAdminDevice, setIsAdminDevice] = useState<boolean>(false);
  const [welcomeInfo, setWelcomeInfo] = useState<{ nickname: string; count: number } | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  // 企划合并兼容：若本地仍残留旧「星空树洞」配额键，将其迁移/合并进当前生命万岁键后清除
  useEffect(() => {
    try {
      const LEGACY_QUOTA_KEY = 'device_daily_quota:jieyou';
      const rawLegacy = localStorage.getItem(LEGACY_QUOTA_KEY);
      if (!rawLegacy) return;
      const legacy = JSON.parse(rawLegacy);
      const currentRaw = localStorage.getItem(theme.data.quotaStorageKey);
      let merged: { date: string; count: number };
      if (currentRaw) {
        const current = JSON.parse(currentRaw);
        merged = current.date === legacy.date
          ? { date: current.date, count: Math.max(current.count, legacy.count) }
          : (current.date > legacy.date ? current : legacy);
      } else {
        merged = legacy;
      }
      localStorage.setItem(theme.data.quotaStorageKey, JSON.stringify(merged));
      localStorage.removeItem(LEGACY_QUOTA_KEY);
    } catch {
      // 解析失败则忽略，不影响主流程
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [skyView, setSkyView] = useState<'stars' | 'messages'>('stars');
  const displayMode = skyView === 'messages' ? messageDisplayMode : starDisplayMode;
  const [isMyMessagesOpen, setIsMyMessagesOpen] = useState(initialView === 'my-messages');
  const [isHappinessPortraitOpen, setIsHappinessPortraitOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isStarMessagesOpen, setIsStarMessagesOpen] = useState(initialView === 'star-messages');
  const [barragePreferences, setBarragePreferences] = useState(createInitialStarrySkyBarragePreferences);
  const barrageMode = barragePreferences.immersive;
  const intimateMode = barragePreferences.intimate;
  const fillMode = barragePreferences.fill;
  const [layoutViewport, setLayoutViewport] = useState<{
    width: number;
    height: number;
    blockedZones: LayoutRect[];
  }>({ width: 0, height: 0, blockedZones: [] });

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
    let active = true;
    const loadStars = async () => {
      setStars([]);
      setSelectedStar(null);
      setPendingDeleteStarId(null);
      setIsCreateModalOpen(false);
      setSidebarOpen(false);
      setWelcomeInfo(null);
      setSearchName('');
      setSearchDate('');
      setSkyView('stars');
      setStarDisplayMode('random');
      setMessageDisplayMode('full');
      setIsMyMessagesOpen(initialView === 'my-messages');
      setIsHappinessPortraitOpen(false);
      setIsTrashOpen(false);
      setIsStarMessagesOpen(initialView === 'star-messages');
      setBarragePreferences(createInitialStarrySkyBarragePreferences());
      setLoadState('loading');
      try {
        const allStars = await starService.getAllStars(theme.id);
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
        if (!active) return;
        setStars(formattedStars);
        setLoadState('ready');
      } catch (error) {
        if (!active) return;
        console.error('加载星星失败:', error);
        setLoadState('error');
        toast.error(theme.sky.unavailableMessage);
      }
    };

    loadStars();
    return () => { active = false; };
  }, [initialView, loadAttempt, theme.id, theme.sky.unavailableMessage]);

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
    const raw = localStorage.getItem(theme.data.quotaStorageKey);
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
    localStorage.setItem(theme.data.quotaStorageKey, JSON.stringify(q));
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
      const newStarData = await starService.createStar(theme.id, userId, userNickname, position, { ...data, isAdminDevice });
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
      toast.success(`✨ ${userNickname} 点亮了一颗${theme.sky.successNoun}！`);
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

  const handleUpdateStar = async (data: { color: string; size: number; shape: string; message: string }) => {
    if (!editingStar) return;
    setIsCreating(true);
    try {
      await starService.updateStar(theme.id, editingStar.id, {
        color: data.color,
        size: data.size,
        shape: data.shape,
        message: data.message,
      });
      setStars(prev => prev.map(star =>
        star.id === editingStar.id
          ? { ...star, color: data.color, size: data.size, shape: data.shape, message: data.message }
          : star
      ));
      if (selectedStar?.id === editingStar.id) {
        setSelectedStar(prev => prev ? { ...prev, color: data.color, size: data.size, shape: data.shape, message: data.message } : null);
      }
      setEditingStar(null);
      toast.success('星星已更新');
    } catch {
      toast.error('更新失败，请重试');
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
      const count = await starService.getTodayCountByNickname(theme.id, userNickname);
      if (count >= 3) {
        toast.error('今日点亮次数已达上限 (3 次)');
        return false;
      }
    } catch {}
    return true;
  };

  const canDeleteStar = (star: StarData) => star.userId === userId || isAdminDevice;

  const handleDeleteStar = async (starId: string) => {
    const starToDelete = stars.find(star => star.id === starId);
    if (!starToDelete) return;
    if (!canDeleteStar(starToDelete)) {
      toast.error('无权删除这颗星星');
      return;
    }
    const ok = await starService.deleteStar(theme.id, starId);
    if (ok) {
      setStars(prev => prev.filter(s => s.id !== starId));
      setSelectedStar(null);
      toast.success('已移入回收站，可在 7 天内恢复');
    } else {
      toast.error('删除失败');
    }
  };

  const requestDeleteStar = (starId: string) => {
    setPendingDeleteStarId(starId);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteStarId) return;
    const starId = pendingDeleteStarId;
    setPendingDeleteStarId(null);
    void handleDeleteStar(starId);
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

  const filteredStars = useMemo(() => {
    return stars.filter((s) => {
      const nameOk = searchName ? s.nickname.includes(searchName) : true;
      const dateOk = searchDate ? (() => { const d = new Date(s.createdAt); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` === searchDate; })() : true;
      return nameOk && dateOk;
    });
  }, [stars, searchName, searchDate]);

  const visibleStars = useMemo(() => {
    const selectionMode = Boolean(searchName) || Boolean(searchDate)
      ? 'full'
      : displayMode;
    return selectVisibleStars(filteredStars, selectionMode);
  }, [filteredStars, searchName, searchDate, displayMode]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const field = starFieldRef.current;
    if (!root || !field) return;

    const measureLayout = () => {
      const fieldRect = field.getBoundingClientRect();
      const blockedZones = Array.from(root.querySelectorAll<HTMLElement>('[data-star-safe-zone]'))
        .flatMap((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return [];

          const left = Math.max(0, rect.left - fieldRect.left);
          const top = Math.max(0, rect.top - fieldRect.top);
          const right = Math.min(fieldRect.width, rect.right - fieldRect.left);
          const bottom = Math.min(fieldRect.height, rect.bottom - fieldRect.top);
          if (right <= left || bottom <= top) return [];
          return [{ left, top, right, bottom }];
        });

      const nextViewport = {
        width: fieldRect.width,
        height: fieldRect.height,
        blockedZones,
      };
      setLayoutViewport((current) => {
        const unchanged = current.width === nextViewport.width
          && current.height === nextViewport.height
          && current.blockedZones.length === nextViewport.blockedZones.length
          && current.blockedZones.every((zone, index) => {
            const nextZone = nextViewport.blockedZones[index];
            return zone.left === nextZone.left
              && zone.top === nextZone.top
              && zone.right === nextZone.right
              && zone.bottom === nextZone.bottom;
          });
        return unchanged ? current : nextViewport;
      });
    };

    measureLayout();
    let animationFrame: number | null = null;
    const scheduleMeasurement = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        measureLayout();
      });
    };
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasurement);
    resizeObserver?.observe(field);
    window.addEventListener('resize', scheduleMeasurement);

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasurement);
    };
  }, [barrageMode, isMyMessagesOpen, loadState, sidebarOpen, skyView]);

  const layoutPositions = useMemo(() => {
    if (loadState !== 'ready' || skyView !== 'stars') return new Map<string, { x: number; y: number }>();
    const positions = resolveStarLayout(
      visibleStars.map(({ id, x, y, size }) => ({ id, x, y, size })),
      layoutViewport,
    );
    return new Map(positions.map((position) => [position.id, position]));
  }, [layoutViewport, loadState, skyView, visibleStars]);

  const barrageMessages = useMemo<BarrageMessage[]>(() => {
    return visibleStars.flatMap((star) => {
      const message = star.message?.trim();
      if (!message) return [];
      return [{
        id: star.id,
        message,
        nickname: star.nickname,
        createdAt: star.createdAt,
        color: star.color,
      }];
    });
  }, [visibleStars]);

  useEffect(() => {
    if (welcomeInfo) {
      const t = setTimeout(() => setWelcomeInfo(null), 6500);
      return () => clearTimeout(t);
    }
  }, [welcomeInfo]);

  const handleBarrageModeChange = (enabled: boolean) => {
    if (enabled && loadState !== 'ready') {
      toast.info('星空加载完成后才能开启弹幕模式');
      return;
    }
    setSelectedStar(null);
    setWelcomeInfo(null);
    setIsCreateModalOpen(false);
    setSkyView('messages');
    setBarragePreferences((current) => setBarragePreference(current, 'immersive', enabled));
    setSidebarOpen(false);
  };

  const handleFindJiebao = () => {
    if (!selectedStar) return;
    (window as any).playClickSound?.();
    openHappinessMeowGenerator({
      message: selectedStar.message,
      createdAt: selectedStar.createdAt,
      nickname: selectedStar.nickname,
    });
  };

  const handleBarrageSelect = (starId: string) => {
    const star = stars.find((star) => star.id === starId);
    if (!star) return;
    (window as any).playClickSound?.();
    setSelectedStar(star);
  };

  const handleIntimateModeChange = (enabled: boolean) => {
    setBarragePreferences((current) => setBarragePreference(current, 'intimate', enabled));
  };

  const handleFillModeChange = (enabled: boolean) => {
    setBarragePreferences((current) => setBarragePreference(current, 'fill', enabled));
  };

  const handleDisplayModeChange = (mode: 'random' | 'full') => {
    if (skyView === 'messages') setMessageDisplayMode(mode);
    else setStarDisplayMode(mode);
  };

  const handleOpenHappinessPortrait = () => {
    (window as any).playClickSound?.();
    setIsHappinessPortraitOpen(true);
  };

  const handleCloseHappinessPortrait = () => {
    setIsHappinessPortraitOpen(false);
    requestAnimationFrame(() => restoreHappinessPortraitFocus(happinessPortraitTriggerRef.current));
  };

  if (isMyMessagesOpen) {
    return (
      <MyMessagesPage
        stars={stars}
        userId={userId}
        nickname={userNickname}
        accentColor={theme.visual.defaultStarColor}
        onBack={() => { (window as any).playClickSound?.(); setIsMyMessagesOpen(false); }}
      />
    );
  }

  if (isHappinessPortraitOpen && theme.id === 'life') {
    return (
      <HappinessSkyPage
        stars={stars}
        onBack={handleCloseHappinessPortrait}
      />
    );
  }

  if (isTrashOpen) {
    return (
      <StarTrashPage
        theme={theme}
        userId={userId}
        nickname={userNickname}
        isAdminDevice={isAdminDevice}
        onBack={() => { setIsTrashOpen(false); setLoadAttempt((value) => value + 1); }}
      />
    );
  }

  if (isStarMessagesOpen) {
    return (
      <StarMessagesPage
        stars={stars}
        accentColor={theme.visual.defaultStarColor}
        onBack={() => { (window as any).playClickSound?.(); setIsStarMessagesOpen(false); }}
      />
    );
  }

  return (
    <div ref={rootRef} className="min-h-screen relative overflow-hidden">
      {!barrageMode && (
        <div data-star-safe-zone className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
          <div className="flex items-center justify-center gap-3">
            <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
            <h1 className="text-2xl md:text-4xl font-extrabold text-white">
              {theme.sky.title}
            </h1>
            <Sparkles className="w-6 h-6 text-yellow-300 animate-pulse" />
          </div>
        </div>
      )}
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
        onChangeDisplayMode={handleDisplayModeChange}
        barrageMode={barrageMode}
        onChangeBarrageMode={handleBarrageModeChange}
        intimateMode={intimateMode}
        onChangeIntimateMode={handleIntimateModeChange}
        fillMode={fillMode}
        onChangeFillMode={handleFillModeChange}
        isAdminDevice={isAdminDevice}
        onSetAdminDevice={(v) => { try { localStorage.setItem('is_admin_device', v ? 'true' : 'false'); } catch {}; setIsAdminDevice(v); }}
        showHappinessPortrait={theme.id === 'life'}
        onOpenHappinessPortrait={handleOpenHappinessPortrait}
        happinessPortraitTriggerRef={happinessPortraitTriggerRef}
        onOpenTrash={() => { setSidebarOpen(false); setIsTrashOpen(true); }}
      />

      {/* 顶部导航 */}
      {!barrageMode && (
        <div className="relative z-10 flex justify-between items-center p-4">
          <button
            data-star-safe-zone
            onClick={() => { (window as any).playClickSound?.(); onBack(); }}
            className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-white/30 transition-all duration-200 flex items-center space-x-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>返回</span>
          </button>
        </div>
      )}

      {/* 星星显示区域 */}
      <div ref={starFieldRef} className="relative w-full h-screen">
        {loadState === 'loading' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center text-white/80">
            <div className="rounded-2xl border border-white/10 bg-black/35 px-6 py-4 backdrop-blur-xl">正在连接这片星空...</div>
          </div>
        )}
        {loadState === 'error' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-3xl border border-white/15 bg-black/55 p-7 text-center text-white backdrop-blur-xl">
              <Sparkles className="mx-auto mb-3 h-8 w-8" style={{ color: theme.visual.defaultStarColor }} />
              <div className="text-lg font-bold">{theme.sky.unavailableMessage}</div>
              <p className="mt-2 text-sm text-white/65">请稍后再试，另一企划的数据不会受到影响。</p>
              <button onClick={() => setLoadAttempt((value) => value + 1)} className={`mt-5 rounded-full bg-gradient-to-r ${theme.visual.buttonGradientClass} ${theme.visual.buttonHoverClass} px-5 py-2 font-semibold text-white`}>
                重新连接
              </button>
            </div>
          </div>
        )}
        {loadState === 'ready' && skyView === 'stars' && visibleStars.map((star) => {
          const position = layoutPositions.get(star.id) ?? star;
          return (
            <UserStar
              key={star.id}
              x={position.x}
              y={position.y}
            nickname={star.nickname}
            createdAt={star.createdAt}
            isNew={star.isNew}
            isJustCreated={star.isJustCreated}
            onClick={() => setSelectedStar(star)}
            color={star.color}
            size={star.size}
            shape={star.shape}
            message={star.message}
            canDelete={canDeleteStar(star)}
            onDelete={() => requestDeleteStar(star.id)}
            />
          );
        })}
        {loadState === 'ready' && skyView === 'messages' && (
          <MessageBarrage messages={barrageMessages} theme={theme} immersive={barrageMode} intimate={intimateMode} fill={fillMode} onSelectMessage={handleBarrageSelect} />
        )}
      </div>

      {loadState === 'ready' && skyView === 'stars' && !sidebarOpen && !barrageMode && (
        <button
          data-star-safe-zone
          type="button"
          aria-label="查看留言弹幕"
          onClick={() => { (window as any).playClickSound?.(); setSkyView('messages'); }}
          className="group absolute right-5 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-2xl backdrop-blur-xl transition duration-300 hover:translate-x-1 hover:border-white/45 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/60 md:right-7 md:h-14 md:w-14"
        >
          <ArrowRight className="h-6 w-6 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      )}

      {loadState === 'ready' && skyView === 'messages' && !sidebarOpen && !barrageMode && (
        <button
          type="button"
          aria-label="返回星星版"
          onClick={() => { (window as any).playClickSound?.(); setSkyView('stars'); }}
          className="group absolute left-5 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-2xl backdrop-blur-xl transition duration-300 hover:-translate-x-1 hover:border-white/45 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/60 md:left-7 md:h-14 md:w-14"
        >
          <ArrowLeft className="h-6 w-6 transition-transform duration-300 group-hover:-translate-x-0.5" />
        </button>
      )}

      {/* 底部操作区域 */}
      {!barrageMode && <div data-star-safe-zone className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-44">
            <button
              data-sky-create-button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={isCreating || loadState !== 'ready'}
              className={`w-full rounded-xl px-3 py-3 font-semibold transition duration-200 flex items-center justify-center gap-2 ${
                isCreating || loadState !== 'ready'
                  ? 'cursor-not-allowed bg-gray-300 text-gray-500'
                  : `bg-gradient-to-r ${theme.visual.buttonGradientClass} ${theme.visual.buttonHoverClass} text-white shadow-lg hover:scale-[1.02] ${theme.visual.glowClass} active:scale-[.98]`
              }`}
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{theme.sky.creatingLabel}</span>
                </>
              ) : (
                <span>点亮星星</span>
              )}
            </button>
          </div>
          <div className="text-white/70 text-sm text-center">
            <p>{theme.sky.hint}</p>
          </div>
        </div>
      </div>}

      {/* 星星详情模态框 */}
      {selectedStar && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative bg-white/95 backdrop-blur-sm rounded-2xl p-6 max-w-sm w-full border border-white/20 shadow-2xl">
            <button
              type="button"
              aria-label="关闭星星详情"
              onClick={() => { (window as any).playClickSound?.(); setSelectedStar(null); }}
              className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
            >
              <X className="h-5 w-5" />
            </button>
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
                <h3 className="text-xl font-bold text-gray-800 mb-2">{selectedStar.nickname} 的{theme.sky.detailNoun}</h3>
                <p className="text-gray-600 text-sm">点亮时间: {formatTime(selectedStar.createdAt)}</p>
                {selectedStar.message && (<p className="text-gray-700 text-sm mt-2">{selectedStar.message}</p>)}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleFindJiebao}
                  className={`flex-1 bg-gradient-to-r ${theme.visual.buttonGradientClass} ${theme.visual.buttonHoverClass} text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
                >
                  找杰宝
                </button>
                {isAdminDevice && (
                  <button
                    type="button"
                    onClick={() => { (window as any).playClickSound?.(); setEditingStar(selectedStar); setSelectedStar(null); }}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>编辑</span>
                  </button>
                )}
                {canDeleteStar(selectedStar) && (
                  <button type="button" onClick={() => { (window as any).playClickSound?.(); requestDeleteStar(selectedStar.id); }} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2">
                    <Trash2 className="w-4 h-4" />
                    <span>删除</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteStarId && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPendingDeleteStarId(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-star-title"
            aria-describedby="delete-star-description"
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#17171c] p-6 text-center text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 id="delete-star-title" className="mt-4 text-xl font-bold">移入回收站？</h3>
            <p id="delete-star-description" className="mt-2 text-sm leading-6 text-white/60">移入后可在 7 天内恢复，之后将被自动永久清除。</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { (window as any).playClickSound?.(); setPendingDeleteStarId(null); }}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { (window as any).playClickSound?.(); handleConfirmDelete(); }}
                className="rounded-xl bg-red-500 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-red-600"
              >
                移入回收站
              </button>
            </div>
          </div>
        </div>
      )}

      {welcomeInfo && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 max-w-sm w-full border border-white/20 shadow-2xl">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Sparkles className="w-6 h-6" style={{ color: theme.visual.defaultStarColor }} />
              <div className="text-xl font-extrabold text-gray-900">欢迎 {welcomeInfo.nickname} 的到来</div>
              <Sparkles className="w-6 h-6" style={{ color: theme.visual.defaultStarColor }} />
            </div>
            <div className="text-gray-700 text-sm text-center">已为你点亮 {theme.hub.name} 的第 <span className="font-semibold" style={{ color: theme.visual.defaultStarColor }}>{welcomeInfo.count}</span> 颗{theme.sky.detailNoun}</div>
            <div className="mt-4 flex justify-center">
              <button onClick={() => setWelcomeInfo(null)} className={`bg-gradient-to-r ${theme.visual.buttonGradientClass} ${theme.visual.buttonHoverClass} text-white px-4 py-2 rounded-lg`}>好的</button>
            </div>
          </div>
        </div>
      )}

      <CreateStarModal
        theme={theme}
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleConfirmCreate}
        defaultColor={theme.visual.defaultStarColor}
        allowSfx={isAdminDevice || userNickname === 'JIEYOU不解忧' || readQuota().count < 3}
        onPreCheck={preCheckSfx}
        incomingIndex={stars.length + 1}
      />
      <CreateStarModal
        key={editingStar?.id ?? 'no-edit'}
        theme={theme}
        open={editingStar !== null}
        onClose={() => setEditingStar(null)}
        onConfirm={handleUpdateStar}
        defaultColor={editingStar?.color || theme.visual.defaultStarColor}
        allowSfx={false}
        mode="edit"
        initialData={editingStar ? {
          color: editingStar.color || theme.visual.defaultStarColor,
          size: editingStar.size || 24,
          shape: (editingStar.shape as any) || 'star',
          message: editingStar.message || '',
        } : undefined}
      />
    </div>
  );
};

export default StarrySky;
