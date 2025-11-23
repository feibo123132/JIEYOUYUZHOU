import React, { useState } from 'react';
import { User, Sparkles } from 'lucide-react';

interface NicknameInputProps {
  onSubmit: (nickname: string) => void;
  isLoading?: boolean;
}

const NicknameInput: React.FC<NicknameInputProps> = ({ onSubmit, isLoading = false }) => {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  const baseUrl = (import.meta.env.BASE_URL || '/').endsWith('/') ? (import.meta.env.BASE_URL || '/') : (import.meta.env.BASE_URL || '/') + '/';
  const getPublicUrl = (name: string) => baseUrl + encodeURI(name);
  const playPop = () => { try { const a = new Audio(getPublicUrl('pop.mp3')); a.currentTime = 0; a.play().catch(() => {}); } catch {} };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    playPop();
    
    // 验证昵称
    if (!nickname.trim()) {
      setError('请输入星星的别称');
      return;
    }
    
    if (nickname.length < 1) {
      setError('别称至少需要1个字符');
      return;
    }
    
    if (nickname.length > 30) {
      setError('别称不能超过30个字符');
      return;
    }
    
    // 验证字符（只允许中文、英文、数字）
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9]+$/;
    if (!validPattern.test(nickname)) {
      setError('别称只能包含中文、英文和数字');
      return;
    }
    
    setError('');
    onSubmit(nickname.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNickname(value);
    
    // 实时清除错误信息
    if (error && value.trim()) {
      setError('');
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <User className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={nickname}
            onChange={handleInputChange}
            placeholder="请输入星星的别称（1-30个字符）"
            maxLength={30}
            disabled={isLoading}
            className={`block w-full pl-10 pr-3 py-3 border rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white/90 backdrop-blur-sm ${
              error 
                ? 'border-red-300 text-red-900 focus:ring-red-500 focus:border-red-500' 
                : 'border-gray-300 text-gray-900 hover:border-purple-400'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <Sparkles className={`h-5 w-5 transition-colors duration-200 ${
              nickname ? 'text-purple-500' : 'text-gray-400'
            }`} />
          </div>
        </div>

        {/* 字符计数 */}
        <div className="flex justify-between items-center text-sm">
          <div className={`transition-colors duration-200 ${
            nickname.length > 0 ? 'text-purple-600' : 'text-gray-500'
          }`}>
            {nickname.length > 0 && `${nickname.length}/30`}
          </div>
          {error && (
            <div className="text-red-500 text-sm animate-pulse">
              {error}
            </div>
          )}
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={isLoading || !nickname.trim()}
          className={`w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 transform ${
            isLoading || !nickname.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              正在进入宇宙...
            </div>
          ) : (
            '点亮我的星星 ✨'
          )}
        </button>
      </form>

      {/* 输入提示 */}
      <div className="mt-4 text-center text-xs text-gray-400 space-y-1">
        <p>💡 提示：别称将显示在你的星星旁边</p>
        <p>✨ 支持中文、英文和数字</p>
      </div>
    </div>
  );
};

export default NicknameInput;