import React, { useEffect, useState } from 'react';
import { Star as PStar, Heart, Cloud, Moon, Mountains, Leaf, MusicNotes, Bird, Cat, Dog, Waves, PaperPlane, X } from 'phosphor-react';
import type { ThemeConfig } from '../../themes/themeConfig';
import { createRandomStarAppearance, type ShapeOption } from './starAppearance';

type Category = '全部' | '萌宠' | '宇宙' | '水果' | '星座' | '其他';

interface CreateStarModalProps {
  theme: ThemeConfig;
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { color: string; size: number; shape: ShapeOption; message: string }) => void;
  defaultColor?: string;
  allowSfx?: boolean;
  onPreCheck?: () => Promise<boolean>;
  currentUserName?: string;
  incomingIndex?: number;
  mode?: 'create' | 'edit';
  initialData?: { color: string; size: number; shape: ShapeOption; message: string };
}

const EmojiIcon = (emoji: string) => (props: any) => (
  <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
);

const FullMoonIcon = (props: any) => (
  <svg width={24} height={24} viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="22" fill={props.color || '#FFD700'} />
    <circle cx="16" cy="20" r="3" fill="rgba(255,255,255,0.4)" />
    <circle cx="30" cy="28" r="2" fill="rgba(255,255,255,0.3)" />
  </svg>
);

const shapeIcons: Record<ShapeOption, React.ComponentType<any>> = {
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

const shapeLabels: Record<ShapeOption, string> = {
  star: '星星', heart: '爱心', cloud: '云朵', moon: '月亮', fullmoon: '圆月',
  mountain: '山', leaf: '叶子', music: '音符', bird: '小鸟',
  cat: '小猫①', cat2: '小猫②', cat3: '小猫③',
  dog: '小狗①', dog2: '小狗②', dog3: '小狗③',
  waves: '海浪', kite: '风筝',
  apple: '苹果', orange: '橘子', banana: '香蕉', watermelon: '西瓜', grapes: '葡萄',
  aries: '白羊座', taurus: '金牛座', gemini: '双子座', cancer: '巨蟹座', leo: '狮子座', virgo: '处女座',
  libra: '天秤座', scorpio: '天蝎座', sagittarius: '射手座', capricorn: '摩羯座', aquarius: '水瓶座', pisces: '双鱼座'
};

const shapeCategories: Record<ShapeOption, Category> = {
  heart: '其他', cloud: '其他', mountain: '其他', leaf: '其他', music: '其他', waves: '其他', kite: '其他',
  // 萌宠
  cat: '萌宠', cat2: '萌宠', cat3: '萌宠', dog: '萌宠', dog2: '萌宠', dog3: '萌宠', bird: '萌宠',
  // 宇宙
  star: '宇宙', moon: '宇宙', fullmoon: '宇宙',
  // 水果
  apple: '水果', orange: '水果', banana: '水果', watermelon: '水果', grapes: '水果',
  // 星座
  aries: '星座', taurus: '星座', gemini: '星座', cancer: '星座', leo: '星座', virgo: '星座',
  libra: '星座', scorpio: '星座', sagittarius: '星座', capricorn: '星座', aquarius: '星座', pisces: '星座',
  // 其他（已覆盖在最前行）
};

const CreateStarModal: React.FC<CreateStarModalProps> = ({ theme, open, onClose, onConfirm, defaultColor = '#FFD700', allowSfx = true, onPreCheck, currentUserName, incomingIndex, mode = 'create', initialData }) => {
  const [color, setColor] = useState(initialData?.color ?? defaultColor);
  const [size, setSize] = useState(initialData?.size ?? 24);
  const [shape, setShape] = useState<ShapeOption>(initialData?.shape ?? 'star');
  const [message, setMessage] = useState(initialData?.message ?? '');
  const [category, setCategory] = useState<Category>('全部');

  useEffect(() => {
    if (!open || mode !== 'create') return;
    const appearance = createRandomStarAppearance();
    setColor(appearance.color);
    setSize(appearance.size);
    setShape(appearance.shape);
    setCategory('全部');
  }, [open, mode]);

  const baseUrl = (import.meta.env.BASE_URL || '/').endsWith('/') ? (import.meta.env.BASE_URL || '/') : (import.meta.env.BASE_URL || '/') + '/';
  const getPublicUrl = (name: string) => baseUrl + encodeURI(name);

  const sizeMin = 20;
  const sizeMax = 36;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white/95 rounded-2xl p-6 w-full max-w-md border border-white/20 shadow-2xl h-[80vh] max-h-[80vh] overflow-y-auto"
        style={{ overscrollBehavior: 'none' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-800">{mode === 'edit' ? '编辑星星' : theme.sky.createLabel}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="space-y-6">
          {currentUserName && (
            <div className="mb-2">
              <div className="inline-flex items-center gap-2 bg-black/10 text-gray-800 px-3 py-1 rounded-lg">
                <span className="text-sm">当前用户:</span>
                <span className="font-semibold text-yellow-600">{currentUserName}</span>
              </div>
            </div>
          )}
          {typeof incomingIndex === 'number' && (
            <div className="mb-1">
              <div className="inline-flex items-center gap-1 bg-black/10 text-gray-800 px-2 py-1 rounded-lg whitespace-nowrap">
                <span className="text-sm whitespace-nowrap">即将点亮：{theme.hub.name}的</span>
                <span className="font-semibold text-base whitespace-nowrap" style={{ color: theme.visual.defaultStarColor }}>第{incomingIndex}颗</span>
                <span className="text-sm whitespace-nowrap">{theme.sky.detailNoun}</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-700 mb-2">{theme.sky.modalPrompt}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 200))}
              placeholder={theme.sky.modalPlaceholder}
              className={`w-full p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 ${theme.visual.focusRingClass}`}
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
            <div className="flex flex-wrap gap-2 mb-3">
              {(['全部', '萌宠', '宇宙', '水果', '星座', '其他'] as Category[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-full text-sm border ${
                    category === c ? `bg-gradient-to-r ${theme.visual.buttonGradientClass} text-white border-transparent` : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-4 gap-3">
                {(() => {
                  const keys = (Object.keys(shapeIcons) as ShapeOption[]).filter((k) =>
                    category === '全部' ? true : shapeCategories[k] === category
                  );
                  return keys.map((key) => {
                    const Icon = shapeIcons[key];
                    const active = shape === key;
                    return (
                      <button
                        key={key}
                        onClick={() => { (window as any).playClickSound?.(); setShape(key); }}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          active ? (theme.visual.accent === 'gold' ? 'border-amber-500 bg-amber-50' : 'border-purple-500 bg-purple-50') : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="mx-auto" size={24} color={active ? theme.visual.defaultStarColor : '#6b7280'} weight="fill" />
                        <div className="text-xs mt-1 text-gray-600">{shapeLabels[key]}</div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          <div className="flex space-x-3 pt-2 sticky bottom-0 bg-white/90 backdrop-blur-sm">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={async () => { if (!allowSfx) { onConfirm({ color, size, shape, message }); return; } if (onPreCheck) { try { const ok = await onPreCheck(); if (!ok) { onClose(); return; } } catch {} } const bg = (window as any).__bgAudio as HTMLAudioElement | undefined; const ensure = (window as any).__ensureBgAudioGraph as (() => Promise<void>) | undefined; if (ensure) { try { ensure(); } catch {} } const gain = (window as any).__bgGain as any; if (bg || gain) { if ((window as any).__bgAudioRampTimer) { clearInterval((window as any).__bgAudioRampTimer); (window as any).__bgAudioRampTimer = null; } if (gain) { try { gain.gain.value = 0.35; } catch {} } else if (bg) { (window as any).__bgAudioOriginalVolume = (window as any).__bgAudioOriginalVolume ?? bg.volume; bg.volume = Math.max(0, ((window as any).__bgAudioOriginalVolume) * 0.35); } } const inc = () => { (window as any).__sfxPlayingCount = ((window as any).__sfxPlayingCount || 0) + 1; }; const rampUp = () => { const g = (window as any).__bgGain as any; if (g) { const from = g.gain.value; const to = 1; const steps = 20; const duration = 1000; let i = 0; if ((window as any).__bgAudioRampTimer) { clearInterval((window as any).__bgAudioRampTimer); } (window as any).__bgAudioRampTimer = setInterval(() => { i++; const t = i / steps; const v = from + (to - from) * t; try { g.gain.value = Math.min(1, Math.max(0, v)); } catch {} if (i >= steps) { clearInterval((window as any).__bgAudioRampTimer); (window as any).__bgAudioRampTimer = null; } }, Math.max(10, Math.floor(duration / steps))); return; } if (!bg) return; const fromV = bg.volume; const toV = 1; const stepsV = 20; const durationV = 1000; let j = 0; if ((window as any).__bgAudioRampTimer) { clearInterval((window as any).__bgAudioRampTimer); } (window as any).__bgAudioRampTimer = setInterval(() => { j++; const t = j / stepsV; const v = fromV + (toV - fromV) * t; bg.volume = Math.min(1, Math.max(0, v)); if (j >= stepsV) { clearInterval((window as any).__bgAudioRampTimer); (window as any).__bgAudioRampTimer = null; } }, Math.max(10, Math.floor(durationV / stepsV))); }; const dec = () => { const c = ((window as any).__sfxPlayingCount || 0) - 1; (window as any).__sfxPlayingCount = c < 0 ? 0 : c; if ((window as any).__sfxPlayingCount === 0) { rampUp(); } }; const s = new Audio(getPublicUrl('点亮星星的音效.mp3')); s.currentTime = 0; inc(); s.addEventListener('ended', dec); s.addEventListener('error', dec); s.play().catch(dec); const list = theme.audio.voices; const pick = list[Math.floor(Math.random()*list.length)]; if (pick) { const a = new Audio(getPublicUrl(pick)); a.currentTime = 0; inc(); a.addEventListener('ended', dec); a.addEventListener('error', dec); a.play().catch(dec); } onConfirm({ color, size, shape, message }); }}
              className={`flex-1 bg-gradient-to-r ${theme.visual.buttonGradientClass} ${theme.visual.buttonHoverClass} text-white py-2 px-4 rounded-lg`}
            >
              {mode === 'edit' ? '保存修改' : theme.sky.modalConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateStarModal;
