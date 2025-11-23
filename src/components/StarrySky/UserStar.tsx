import React from 'react';
import { Trash2 } from 'lucide-react';
import { Star as PStar, Heart, Cloud, Moon, Mountains, Leaf, MusicNotes, Bird, Cat, Dog, Waves, PaperPlane } from 'phosphor-react';

interface UserStarProps {
  x: number;
  y: number;
  nickname: string;
  createdAt: string;
  onClick: () => void;
  isNew?: boolean;
  isJustCreated?: boolean;
  color?: string;
  size?: number;
  shape?: string;
  message?: string;
  canDelete?: boolean;
  onDelete?: () => void;
}

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

const shapeMap: Record<string, React.ComponentType<any>> = {
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

const UserStar: React.FC<UserStarProps> = ({ 
  x, 
  y, 
  nickname, 
  createdAt, 
  onClick, 
  isNew = false,
  isJustCreated = false,
  color = '#FFD700',
  size = 24,
  shape = 'star',
  message = ''
  , canDelete = false,
  onDelete,
}) => {
  const baseUrl = (import.meta.env.BASE_URL || '/').endsWith('/') ? (import.meta.env.BASE_URL || '/') : (import.meta.env.BASE_URL || '/') + '/';
  const getPublicUrl = (name: string) => baseUrl + encodeURI(name);
  const playPop = () => { try { const a = new Audio(getPublicUrl('pop.mp3')); a.currentTime = 0; a.play().catch(() => {}); } catch {} };
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const IconComponent = shapeMap[shape] || PStar;
  const iconSize = Math.max(20, Math.min(36, size));
  const tipSide = y > 75 ? 'top' : 'bottom';
  const tipAlign = x > 70 ? 'right' : x < 30 ? 'left' : 'center';
  const tipContainerClass = (() => {
    const base = 'absolute opacity-0 peer-hover:opacity-100 transition-all duration-200 pointer-events-none z-30';
    if (tipSide === 'bottom') {
      if (tipAlign === 'center') return base + ' top-full left-1/2 transform -translate-x-1/2 mt-2';
      if (tipAlign === 'left') return base + ' top-full left-0 mt-2';
      return base + ' top-full right-0 mt-2';
    } else {
      if (tipAlign === 'center') return base + ' bottom-full left-1/2 transform -translate-x-1/2 mb-2';
      if (tipAlign === 'left') return base + ' bottom-full left-0 mb-2';
      return base + ' bottom-full right-0 mb-2';
    }
  })();
  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer ${
        isNew ? 'animate-pulse' : ''
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={() => { playPop(); onClick(); }}
    >
      <div className="relative peer breath-slow">
        <IconComponent 
          className={`drop-shadow-lg transition-all duration-300 ${
            isNew 
              ? 'animate-bounce' 
              : 'peer-hover:scale-110'
          }`}
          size={iconSize}
          color={color}
          weight="fill"
        />
        
        <div className={`absolute inset-0 rounded-full opacity-30 ${
          isNew ? 'animate-ping' : 'peer-hover:animate-ping'
        }`} style={{ backgroundColor: color }}></div>
        
        <div className={`absolute -inset-2 rounded-full opacity-20 ${
          isNew ? 'animate-pulse' : 'peer-hover:animate-pulse'
        }`} style={{ backgroundColor: color }}></div>
      </div>

      <div className={tipContainerClass}>
        <div className="bg-transparent text-white text-xs px-4 py-3 rounded-xl w-56 sm:w-64">
          <div className="mb-2">
            <div className="font-semibold text-white">{nickname}</div>
            <div className="text-gray-300 text-[12px] mt-1">{formatTime(createdAt)}</div>
          </div>
          {message && (
            <div className="text-gray-100 text-[14px] md:text-[15px] font-medium leading-relaxed whitespace-normal break-words">
              {message}
            </div>
          )}
          {canDelete && onDelete && (
            <div className="flex justify-end mt-3">
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="pointer-events-auto flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-md text-[11px]"
              >
                <Trash2 className="w-3 h-3" /> 删除
              </button>
            </div>
          )}
        </div>
        {tipSide === 'bottom' ? (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-transparent"></div>
        ) : (
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-transparent"></div>
        )}
      </div>

      {isJustCreated && (
        <>
          <div className="absolute -inset-6 rounded-full opacity-40 animate-ping pointer-events-none" style={{ backgroundColor: '#FFFFFF' }}></div>
          <div className="absolute -inset-10 rounded-full opacity-25 animate-ping pointer-events-none" style={{ backgroundColor: '#FFFFFF', animationDelay: '0.8s' }}></div>
          <div className="absolute -inset-14 rounded-full opacity-20 animate-ping pointer-events-none" style={{ backgroundColor: '#FFFFFF', animationDelay: '1.6s' }}></div>
        </>
      )}

      {isNew && (
        <>
          <div className="absolute inset-0 animate-ping">
            <div className="absolute top-0 left-0 w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color }}></div>
            <div className="absolute top-0 right-0 w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color, animationDelay: '0.2s' }}></div>
            <div className="absolute bottom-0 left-0 w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color, animationDelay: '0.4s' }}></div>
            <div className="absolute bottom-0 right-0 w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color, animationDelay: '0.6s' }}></div>
          </div>
          
          <div className="absolute -inset-4 rounded-full border-2 opacity-60 animate-pulse" style={{ borderColor: color }}></div>
        </>
      )}
    </div>
  );
};

export default UserStar;