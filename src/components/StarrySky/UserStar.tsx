import React from 'react';
import { Star as PStar, Heart, Cloud, Moon, Mountains, Leaf, MusicNotes, Bird } from 'phosphor-react';

interface UserStarProps {
  x: number;
  y: number;
  nickname: string;
  createdAt: string;
  onClick: () => void;
  isNew?: boolean;
  color?: string;
  size?: number;
  shape?: string;
}

const shapeMap: Record<string, React.ComponentType<any>> = {
  star: PStar,
  heart: Heart,
  cloud: Cloud,
  moon: Moon,
  mountain: Mountains,
  leaf: Leaf,
  music: MusicNotes,
  bird: Bird,
};

const UserStar: React.FC<UserStarProps> = ({ 
  x, 
  y, 
  nickname, 
  createdAt, 
  onClick, 
  isNew = false,
  color = '#FFD700',
  size = 24,
  shape = 'star'
}) => {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const IconComponent = shapeMap[shape] || PStar;
  const iconSize = Math.max(12, Math.min(48, size));
  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group ${
        isNew ? 'animate-pulse' : ''
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={onClick}
    >
      <div className="relative">
        <IconComponent 
          className={`drop-shadow-lg transition-all duration-300 ${
            isNew 
              ? 'animate-bounce' 
              : 'group-hover:scale-110'
          }`}
          size={iconSize}
          color={color}
          weight="fill"
        />
        
        <div className={`absolute inset-0 rounded-full opacity-30 ${
          isNew ? 'animate-ping' : 'group-hover:animate-ping'
        }`} style={{ backgroundColor: color }}></div>
        
        <div className={`absolute -inset-2 rounded-full opacity-20 ${
          isNew ? 'animate-pulse' : 'group-hover:animate-pulse'
        }`} style={{ backgroundColor: color }}></div>
      </div>

      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap border border-white/20">
          <div className="font-medium" style={{ color }}>{nickname}</div>
          <div className="text-gray-300 text-xs">{formatTime(createdAt)}</div>
        </div>
        
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-black/80"></div>
      </div>

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