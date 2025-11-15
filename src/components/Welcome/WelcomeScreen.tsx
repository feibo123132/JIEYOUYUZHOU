import React from 'react';
import { Star, Sparkles } from 'lucide-react';

interface WelcomeScreenProps {
  onEnter: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative z-10 px-4">
      {/* 标题区域 */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-yellow-300 mr-3 animate-pulse" />
          <h1 className="text-4xl md:text-6xl font-bold text-white bg-gradient-to-r from-yellow-300 via-yellow-400 to-orange-400 bg-clip-text text-transparent">
            宇宙星星
          </h1>
          <Sparkles className="w-8 h-8 text-yellow-300 ml-3 animate-pulse" />
        </div>
        
        <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
          在浩瀚星空中点亮属于你的星星
          <br />
          记录每一个美好的互动时刻
        </p>
      </div>

      {/* 应用介绍卡片 */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mb-12 max-w-md w-full border border-white/20">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center">
            <Star className="w-12 h-12 text-yellow-400 animate-pulse" />
          </div>
          
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">欢迎来到宇宙</h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              输入你的别称，在星空中点亮一颗独特的星星
              <br />
              让每一次互动都成为永恒的纪念
            </p>
          </div>

          {/* 功能亮点 */}
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="flex items-center text-gray-300">
              <Star className="w-4 h-4 text-yellow-400 mr-2" />
              <span>点亮专属星星</span>
            </div>
            <div className="flex items-center text-gray-300">
              <Sparkles className="w-4 h-4 text-blue-400 mr-2" />
              <span>记录互动时刻</span>
            </div>
            <div className="flex items-center text-gray-300">
              <Star className="w-4 h-4 text-purple-400 mr-2" />
              <span>分享美好回忆</span>
            </div>
          </div>
        </div>
      </div>

      {/* 进入按钮 */}
      <button
        onClick={onEnter}
        className="group relative bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 hover:from-purple-500 hover:via-purple-600 hover:to-indigo-600 text-white font-semibold py-4 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/25 active:scale-95"
      >
        <div className="flex items-center justify-center">
          <span className="mr-3">开始探索</span>
          <Star className="w-5 h-5 group-hover:animate-spin" />
        </div>
        
        {/* 按钮发光效果 */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-indigo-400 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
        
        {/* 星星粒子效果 */}
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping"></div>
        <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 group-hover:animate-ping animation-delay-200"></div>
      </button>

      {/* 底部装饰 */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
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