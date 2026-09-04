export const STAR_APPEARANCE_COLORS = [
  '#FFD166', '#FFC857', '#FFB347', '#FF8A5B', '#FF6B8A',
  '#F78C6B', '#C77DFF', '#8ECAE6', '#64DFDF', '#80ED99',
  '#FFF1A8', '#F4A261',
] as const;

export const RANDOM_STAR_APPEARANCE_SHAPES = [
  'star', 'heart', 'cloud', 'moon', 'fullmoon', 'mountain', 'leaf', 'music', 'bird',
  'cat', 'cat2', 'cat3', 'dog', 'dog2', 'dog3',
  'apple', 'orange', 'banana', 'watermelon', 'grapes',
  'waves', 'kite',
] as const;

export const STAR_APPEARANCE_SHAPES = [
  ...RANDOM_STAR_APPEARANCE_SHAPES,
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

export type ShapeOption = (typeof STAR_APPEARANCE_SHAPES)[number];

const randomIndex = (length: number, random: () => number) =>
  Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * length);

export const createRandomStarAppearance = (random: () => number = Math.random) => ({
  color: STAR_APPEARANCE_COLORS[randomIndex(STAR_APPEARANCE_COLORS.length, random)],
  size: 20 + randomIndex(17, random),
  shape: RANDOM_STAR_APPEARANCE_SHAPES[randomIndex(RANDOM_STAR_APPEARANCE_SHAPES.length, random)],
});
