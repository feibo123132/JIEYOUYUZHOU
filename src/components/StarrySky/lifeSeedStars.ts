import type { ThemeId } from '../../themes/themeConfig';

export const LIFE_SEED_STAR_COLORS = [
  '#FFD166', '#FFC857', '#FFB347', '#FF9F43', '#FF8A5B',
  '#FF7A8A', '#F6C453', '#FFE29A', '#F4A261', '#FFF1C1',
] as const;

export const LIFE_SEED_STAR_SHAPES = [
  'star', 'heart', 'moon', 'fullmoon', 'cloud',
  'leaf', 'music', 'bird', 'cat', 'kite',
] as const;

const moments = [
  '清晨醒来发现窗外阳光正好',
  '下班回家时看见晚霞铺满天空',
  '周末睡到自然醒后慢慢起床',
  '雨天坐在窗边听着屋檐滴答',
  '傍晚沿着熟悉小路悠闲散步',
  '打开门时小猫迎面跑来撒娇',
  '和久未见的朋友重新坐在一起',
  '家人端来一盘刚切好的水果',
  '耳机里忽然播放最爱的歌曲',
  '忙碌一天终于躺进柔软被窝',
] as const;

const details = [
  '为自己煮了一碗热腾腾的面',
  '手边恰好还有一杯温热的茶',
  '风里带着花草和泥土的清香',
  '一句问候让疲惫慢慢散去了',
  '忽然被一个温柔拥抱接住了',
  '笑声把普通房间变得很明亮',
  '今天认真完成了一件小事情',
  '口袋里还藏着喜欢的小糖果',
  '手机收到惦念已久的人回复',
  '心里某个角落悄悄松了一口气',
] as const;

const nicknamePrefixes = [
  '温柔的', '闪亮的', '晴朗的', '慢慢的', '微笑的',
  '自在的', '热乎的', '安静的', '勇敢的', '幸运的',
] as const;

const nicknameNouns = [
  '早餐收藏家', '晚霞观测员', '小路散步者', '猫咪守护员', '云朵记录者',
  '音乐漫游者', '热茶分享者', '月光拾光者', '花香捕捉者', '好梦保管员',
] as const;

export interface LifeSeedStar {
  id: string;
  user_id: string;
  nickname: string;
  position_x: number;
  position_y: number;
  color: (typeof LIFE_SEED_STAR_COLORS)[number];
  size: number;
  shape: (typeof LIFE_SEED_STAR_SHAPES)[number];
  message: string;
  created_at: string;
}

export const LIFE_SEED_STARS: LifeSeedStar[] = Array.from({ length: 100 }, (_, index) => {
  const row = Math.floor(index / 10);
  const column = index % 10;
  const seedNumber = String(index + 1).padStart(3, '0');
  return {
    id: `life-seed-star-${seedNumber}`,
    user_id: `life-seed-user-${seedNumber}`,
    nickname: `${nicknamePrefixes[row]}${nicknameNouns[column]}`,
    position_x: 14 + column * 8,
    position_y: 14 + row * 8,
    color: LIFE_SEED_STAR_COLORS[(row * 3 + column) % LIFE_SEED_STAR_COLORS.length],
    size: 20 + ((row + column) % 9) * 2,
    shape: LIFE_SEED_STAR_SHAPES[(row * 7 + column) % LIFE_SEED_STAR_SHAPES.length],
    message: `${moments[row]}，${details[column]}。幸福就在这些被认真感受、轻轻珍藏的寻常时刻里。`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  };
});

export const isLifeSeedStar = (star: { id: string }) => star.id.startsWith('life-seed-');

export const mergeLifeSeedStars = <T extends { id: string }>(themeId: ThemeId, stars: readonly T[]) => {
  if (themeId !== 'life') return [...stars];
  const ids = new Set(stars.map((star) => star.id));
  return [...stars, ...LIFE_SEED_STARS.filter((star) => !ids.has(star.id))] as Array<T | LifeSeedStar>;
};

const shuffled = <T>(items: readonly T[], random: () => number) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

export const selectVisibleStars = <T extends { id: string }>(
  stars: readonly T[],
  mode: 'random' | 'full' | 'messages',
  random: () => number = Math.random,
) => {
  if (mode !== 'random' || stars.length <= 30) return [...stars];
  const liveStars = stars.filter((star) => !isLifeSeedStar(star));
  if (liveStars.length >= 30) return shuffled(liveStars, random).slice(0, 30);
  const seedStars = stars.filter(isLifeSeedStar);
  return [...liveStars, ...shuffled(seedStars, random).slice(0, 30 - liveStars.length)];
};
