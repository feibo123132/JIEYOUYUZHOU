// src/App.tsx (最终、符合 Hooks 规则的完整版)

import React, { useState, useRef, useEffect } from 'react';
import { Toaster, toast } from 'sonner';

// 使用默认导入
import useAppStore from './store/appStore'; 
import WelcomeScreen from './components/Welcome/WelcomeScreen';
import NicknameInput from './components/Welcome/NicknameInput';
import StarrySky from './components/StarrySky/StarrySky';
import StarryCanvas from './components/StarrySky/StarryCanvas';

// 使用默认导入并解构，代码更清晰
import services from './services/starService';
const { userService } = services; // 解构出 userService

function App() {
  // ===================================================
  // 步骤 1: 所有 Hooks 调用全部集中在最前面
  // ===================================================
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { currentView, setCurrentView, setUser, user } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  // useEffect 用于初始化 Audio 对象
  useEffect(() => {
    if (!audioRef.current) {
      const base = (import.meta.env.BASE_URL || '/').endsWith('/') ? (import.meta.env.BASE_URL || '/') : (import.meta.env.BASE_URL || '/') + '/';
      const url = base + encodeURIComponent('你终将会找到属于自己的月亮.mp3');
      audioRef.current = new Audio(url);
      audioRef.current.loop = true;
    }
    (window as any).__bgAudio = audioRef.current;
  }, []);

  // ===================================================
  // 步骤 2: 放置其他的普通代码（例如日志）
  // ===================================================
  // 我们的“间谍”日志，用于诊断问题
  console.log('--- 诊断信息 --- 我拿到的 TCB Env ID 是:', import.meta.env.VITE_TCB_ENV_ID);

  // ===================================================
  // 步骤 3: 所有的函数定义
  // ===================================================
  const toggleMusic = () => {
    if (!audioRef.current) return;
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    if (newIsPlaying) {
      audioRef.current.play().catch(error => {
        console.error('音频播放失败:', error);
        toast.info('需要您的允许才能播放音乐哦');
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  };

  const handleWelcomeEnter = () => {
    if (user) {
      setCurrentView('starry-sky');
    } else {
      toast.info('请输入你的别称');
      const el = document.getElementById('nickname-input');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleNicknameSubmit = async (nickname: string) => {
    console.log('1. `handleNicknameSubmit` 已触发，准备创建用户...');
    setIsLoading(true);

    try {
      console.log('2. 即将调用 `userService.createUser`...');
      const userData = await userService.createUser(nickname);

      setUser({
        id: userData.id,
        nickname: userData.nickname,
        isAuthenticated: false
      });
      setCurrentView('starry-sky');

    } catch (error) {
      console.error('创建用户失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToWelcome = () => {
    setCurrentView('welcome');
  };
  
  // ===================================================
  // 步骤 4: 最后是 return 语句
  // ===================================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-indigo-900 relative overflow-hidden">
      {/* 3D星空背景 */}
      <StarryCanvas />

      {/* 主要内容 */}
      <div className="relative z-10">
        {currentView === 'welcome' && (
          <div className="min-h-screen flex flex-col items-center justify-center">
            <WelcomeScreen onEnter={handleWelcomeEnter} onToggleMusic={toggleMusic} isPlaying={isPlaying} />

            {/* 昵称输入区域 */}
            <div id="nickname-input" className="mt-8 w-full max-w-md px-4">
              <NicknameInput 
                onSubmit={handleNicknameSubmit}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}

        {currentView === 'starry-sky' && user && (
          <StarrySky
            userNickname={user.nickname}
            userId={user.id}
            onBack={handleBackToWelcome}
          />
        )}
      </div>
      
      {/* 通知组件 */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
          },
        }}
      />
    </div>
  );
}

export default App;