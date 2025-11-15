import React, { useState } from 'react';
import { Star as PStar, Heart, Cloud, Moon, Mountains, Leaf, MusicNotes, Bird, X } from 'phosphor-react';

type ShapeOption = 'star' | 'heart' | 'cloud' | 'moon' | 'mountain' | 'leaf' | 'music' | 'bird';

interface CreateStarModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { color: string; size: number; shape: ShapeOption; message: string }) => void;
  defaultColor?: string;
}

const shapeIcons: Record<ShapeOption, React.ComponentType<any>> = {
  star: PStar,
  heart: Heart,
  cloud: Cloud,
  moon: Moon,
  mountain: Mountains,
  leaf: Leaf,
  music: MusicNotes,
  bird: Bird,
};

const CreateStarModal: React.FC<CreateStarModalProps> = ({ open, onClose, onConfirm, defaultColor = '#FFD700' }) => {
  const [color, setColor] = useState(defaultColor);
  const [size, setSize] = useState(24);
  const [shape, setShape] = useState<ShapeOption>('star');
  const [message, setMessage] = useState('');

  const sizeMin = 12;
  const sizeMax = 48;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 rounded-2xl p-6 w-full max-w-md border border-white/20 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800">点亮星星</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-gray-700 mb-2">留言</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 200))}
              placeholder="写下你的感受、心情、愿望、想说的话或想听的歌"
              className="w-full p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={3}
              maxLength={200}
            />
            <div className="text-right text-xs text-gray-500 mt-1">{message.length}/200</div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">颜色</label>
            <div className="flex items-center space-x-3">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="flex-1 p-2 rounded-lg border border-gray-300"
                placeholder="#FFD700"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">大小</label>
            <input
              type="range"
              min={sizeMin}
              max={sizeMax}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-gray-600 mt-1">{size}px</div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">形状</label>
            <div className="grid grid-cols-4 gap-3">
              {(Object.keys(shapeIcons) as ShapeOption[]).map((key) => {
                const Icon = shapeIcons[key];
                const active = shape === key;
                return (
                  <button
                    key={key}
                    onClick={() => setShape(key)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      active ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="mx-auto" size={24} color={active ? '#7c3aed' : '#6b7280'} weight="fill" />
                    <div className="text-xs mt-1 text-gray-600">{key}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm({ color, size, shape, message })}
              className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-2 px-4 rounded-lg"
            >
              点亮
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateStarModal;