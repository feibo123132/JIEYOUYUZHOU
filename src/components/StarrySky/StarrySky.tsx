// src/components/StarrySky/StarrySky.tsx (修正后的完整版)

import React, { useState, useEffect } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Star as PStar, Heart, Cloud, Moon, Mountains, Leaf, MusicNotes, Bird } from 'phosphor-react';
import UserStar from './UserStar';
import { toast } from 'sonner';
import CreateStarModal from './CreateStarModal';

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

  // 生成随机位置
  const generateRandomPosition = (): { x: number; y: number } => {
    let x, y;
    let attempts = 0;
    const minDistance = 15; // 最小距离百分比
    
    do {
      x = Math.random() * 80 + 10; // 10-90% 范围
      y = Math.random() * 80 + 10;
      attempts++;
    } while (
      attempts < 50 && 
      stars.some(star => {
        const distance = Math.sqrt(Math.pow(star.x - x, 2) + Math.pow(star.y - y, 2));
        return distance < minDistance;
      })
    );
    
    return { x, y };
  };

  // 点亮新星星
  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleConfirmCreate = async (data: { color: string; size: number; shape: string; message: string }) => {
    if (isCreating) return;
    setIsCreating(true);
    setIsCreateModalOpen(false);
    try {
      const position = generateRandomPosition();
      const newStarData = await starService.createStar(userId, userNickname, position, data);
      const newStar: StarData = {
        id: newStarData.id,
        x: newStarData.position_x,
        y: newStarData.position_y,
        nickname: newStarData.nickname,
        createdAt: newStarData.created_at,
        isNew: true,
        color: newStarData.color,
        size: newStarData.size,
        shape: newStarData.shape,
        userId: newStarData.user_id,
        message: newStarData.message
      };
      setStars(prev => [...prev, newStar]);
      toast.success(`✨ ${userNickname} 点亮了一颗新星星！`);
      setTimeout(() => {
        setStars(prev => prev.map(star => 
          star.id === newStar.id ? { ...star, isNew: false } : star
        ));
      }, 3000);
    } catch (error) {
      console.error('创建星星失败:', error);
      toast.error('点亮星星失败，请重试');
    } finally {
      setIsCreating(false);
    }
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

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* ... JSX 部分代码保持不变 ... */}

      {/* 顶部导航 */}
      <div className="relative z-10 flex justify-between items-center p-4">
        <button
          onClick={onBack}
          className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-white/30 transition-all duration-200 flex items-center space-x-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>返回</span>
        </button>
        <div className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg">
          <span className="text-sm">当前用户: </span>
          <span className="font-semibold text-yellow-300">{userNickname}</span>
        </div>
      </div>

      {/* 星星显示区域 */}
      <div className="relative w-full h-screen">
        {stars.map((star) => (
          <UserStar
            key={star.id}
            x={star.x}
            y={star.y}
            nickname={star.nickname}
            createdAt={star.createdAt}
            isNew={star.isNew}
            onClick={() => setSelectedStar(star)}
            color={star.color}
            size={star.size}
            shape={star.shape}
          />
        ))}
      </div>

      {/* 底部操作区域 */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
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
                  const shapeIcons: Record<string, React.ComponentType<any>> = {
                    star: PStar, heart: Heart, cloud: Cloud, moon: Moon,
                    mountain: Mountains, leaf: Leaf, music: MusicNotes, bird: Bird,
                  };
                  const Icon = shapeIcons[selectedStar.shape || 'star'];
                  return <Icon size={48} color={selectedStar.color || '#FFD700'} weight="fill" />;
                })()}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{selectedStar.nickname} 的星星</h3>
                <p className="text-gray-600 text-sm">点亮时间: {formatTime(selectedStar.createdAt)}</p>
                {selectedStar.message && (<p className="text-gray-700 text-sm mt-2">{selectedStar.message}</p>)}
              </div>
              <div className="flex space-x-3">
                <button onClick={() => setSelectedStar(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg transition-colors duration-200">
                  关闭
                </button>
                {selectedStar.userId === userId && (
                  <button onClick={() => handleDeleteStar(selectedStar.id)} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2">
                    <Trash2 className="w-4 h-4" />
                    <span>删除</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateStarModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleConfirmCreate}
        defaultColor="#FFD700" // 简化了 draft 状态
      />
    </div>
  );
};

export default StarrySky;