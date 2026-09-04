import React, { useState } from 'react';
import { Sparkles, User } from 'lucide-react';
import type { ThemeConfig } from '../../themes/themeConfig';
import { readSyncedNickname } from './nicknameSync';

interface NicknameInputProps {
  theme: ThemeConfig;
  onSubmit: (nickname: string, target: 'stars' | 'my-messages' | 'star-messages') => void;
  isLoading?: boolean;
  initialNickname?: string;
}

const NicknameInput: React.FC<NicknameInputProps> = ({ theme, onSubmit, isLoading = false, initialNickname = '' }) => {
  const [nickname, setNickname] = useState(() => (
    typeof window === 'undefined'
      ? initialNickname
      : readSyncedNickname(window.localStorage) || initialNickname
  ));
  const [error, setError] = useState('');
  const isLife = theme.id === 'life';

  const submitNickname = (target: 'stars' | 'my-messages' | 'star-messages') => {
    (window as any).playClickSound?.();
    const value = nickname.trim();
    if (!value) {
      setError('请输入星星的别称');
      return;
    }
    if (value.length > 30) {
      setError('别称不能超过30个字符');
      return;
    }
    if (!/^[\u4e00-\u9fa5a-zA-Z0-9]+$/.test(value)) {
      setError('别称只能包含中文、英文和数字');
      return;
    }
    setError('');
    onSubmit(value, target);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitNickname('stars');
  };

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-xl">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
              if (error && event.target.value.trim()) setError('');
            }}
            placeholder={theme.nickname.placeholder}
            maxLength={30}
            disabled={isLoading}
            className={`block w-full rounded-xl border bg-white/95 py-3 pl-10 pr-10 text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:ring-2 ${theme.visual.focusRingClass} ${
              error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
            } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}
          />
          <Sparkles className={`pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 transition-colors ${
            nickname ? theme.visual.counterClass : 'text-gray-400'
          }`} />
        </div>

        <div className="flex min-h-5 items-center justify-between text-xs">
          <span className={nickname ? theme.visual.counterClass : 'text-white/35'}>
            {nickname ? `${nickname.length}/30` : ''}
          </span>
          {error && <span className="text-red-300">{error}</span>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            type="submit"
            disabled={isLoading || !nickname.trim()}
            className={`w-full rounded-xl px-3 py-3 font-semibold transition duration-200 ${
              isLoading || !nickname.trim()
                ? 'cursor-not-allowed bg-gray-300 text-gray-500'
                : `bg-gradient-to-r ${theme.visual.buttonGradientClass} ${theme.visual.buttonHoverClass} text-white shadow-lg hover:scale-[1.02] ${theme.visual.glowClass} active:scale-[.98]`
            }`}
          >
            {isLoading ? theme.nickname.loadingLabel : theme.nickname.submitLabel}
          </button>
          <button
            type="button"
            disabled={isLoading || !nickname.trim()}
            onClick={() => submitNickname('my-messages')}
            className={`w-full rounded-xl border px-3 py-3 font-semibold transition duration-200 ${
              isLoading || !nickname.trim()
                ? 'cursor-not-allowed border-gray-300 bg-gray-300 text-gray-500'
                : 'border-white/25 bg-white/10 text-white shadow-lg backdrop-blur-xl hover:scale-[1.02] hover:border-white/45 hover:bg-white/15 active:scale-[.98]'
            }`}
          >
            我的星星
          </button>
          <button
            type="button"
            disabled={isLoading || !nickname.trim()}
            onClick={() => submitNickname('star-messages')}
            className={`w-full rounded-xl border px-3 py-3 font-semibold transition duration-200 ${
              isLoading || !nickname.trim()
                ? 'cursor-not-allowed border-gray-300 bg-gray-300 text-gray-500'
                : 'border-white/25 bg-white/10 text-white shadow-lg backdrop-blur-xl hover:scale-[1.02] hover:border-white/45 hover:bg-white/15 active:scale-[.98]'
            }`}
          >
            星星之家
          </button>
        </div>
      </form>

      <div className="mt-3 space-y-1 text-center text-xs text-white/45">
        <p>{isLife ? '☀' : '💡'} {theme.nickname.tip}</p>
        <p>支持中文、英文和数字</p>
      </div>
    </div>
  );
};

export default NicknameInput;
