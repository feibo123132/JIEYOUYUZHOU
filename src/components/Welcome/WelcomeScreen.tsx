// src/components/Welcome/WelcomeScreen.tsx (修正后的完整版)

import React from 'react';
// ↓↓↓↓↓↓ [修正] 统一使用 lucide-react 的图标库 ↓↓↓↓↓↓
import { Star, Sparkles, Music, Music2 } from 'lucide-react';

interface WelcomeScreenProps {
  onEnter: () => void;
  // ↓↓↓↓↓↓ [修正] 确保 props 类型定义完整 ↓↓↓↓↓↓
  onToggleMusic?: () => void;
  isPlaying?: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onEnter, onToggleMusic, isPlaying = false }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative z-10 px-4">
      
      {/* ↓↓↓↓↓↓ [修正] 将音乐按钮放在这里，并使用 lucide-react 图标 ↓↓↓↓↓↓ */}
      <button
        onClick={onToggleMusic}
        className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-sm border border-white/20 transition-all duration-200"
        aria-label={isPlaying ? "暂停音乐" : "播放音乐"}
      >
        {isPlaying ? <Music size={20} /> : <Music2 size={20} />}
      </button>

      {/* 标题区域 */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-yellow-300 mr-3 animate-pulse" />
          <h1 className="text-4xl md:text-6xl font-bold text-white bg-gradient-to-r from-yellow-300 via-yellow-400 to-orange-400 bg-clip-text text-transparent">
            JIEYOU宇宙
          </h1>
          <Sparkles className="w-8 h-8 text-yellow-300 ml-3 animate-pulse" />
        </div>
        
        <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
          我们在此刻相遇，你抬起手
          <br />
          在宇宙中点亮了一颗，独属于自己的星星
        </p>
      </div>

      {/* 应用介绍卡片 */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mb-12 max-w-md w-full border border-white/20">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center">
            <Star className="w-12 h-12 text-yellow-400 animate-pulse" />
          </div>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">欢迎来到我们的JIEYOU宇宙</h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              在宇宙中点亮一颗独属于你自己的星星
              <br />
              让每一次相遇都成为永恒的纪念
            </p>
          </div>

          {/* 功能亮点 */}
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="flex items-center text-gray-300">
              <Star className="w-4 h-4 text-yellow-400 mr-2" />
              <span>在星空下许愿</span>
            </div>
            <div className="flex items-center text-gray-300">
              <Sparkles className="w-4 h-4 text-blue-400 mr-2" />
              <span>宇宙版烦恼树洞</span>
            </div>
            <div className="flex items-center text-gray-300">
              <Star className="w-4 h-4 text-purple-400 mr-2" />
              <span>分享生活小美满</span>
            </div>
          </div>
        </div>
      </div>

      {/* 进入按钮 */}
      <button
        onClick={() => { (window as any).playClickSound?.(); onEnter(); }}
        className="group relative bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 hover:from-purple-500 hover:via-purple-600 hover:to-indigo-600 text-white font-semibold py-4 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/25 active:scale-95"
      >
        <div className="flex items-center justify-center">
          <span className="mr-3">遨游宇宙</span>
          <Star className="w-5 h-5 group-hover:animate-spin" />
        </div>
        
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-indigo-400 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping"></div>
        <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping animation-delay-200"></div>
      </button>

      {/* 底部装饰 */}
      <div className="absolute bottom-8 left-12 transform -translate-x-1/2">
        <div className="flex space-x-2">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`w-2 h-2 text-yellow-300 animate-pulse`}
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;