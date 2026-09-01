export interface HappinessSkyPosition {
  x: number;
  y: number;
}

export interface HappinessNodeVisual extends HappinessSkyPosition {
  ratio: number;
  diameter: number;
  fontSize: number;
  depth: number;
}

export const HAPPINESS_SKY_POSITIONS: readonly HappinessSkyPosition[] = [
  { x: 50, y: 48 },
  { x: 36, y: 59 },
  { x: 64, y: 59 },
  { x: 38, y: 36 },
  { x: 62, y: 36 },
  { x: 50, y: 69 },
  { x: 27, y: 36 },
  { x: 73, y: 36 },
  { x: 27, y: 68 },
  { x: 73, y: 68 },
  { x: 17, y: 52 },
  { x: 83, y: 52 },
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const getHappinessNodeVisual = (
  count: number,
  minimumCount: number,
  maximumCount: number,
  index: number,
): HappinessNodeVisual => {
  const ratio = maximumCount <= minimumCount
    ? 0.6
    : clamp01((count - minimumCount) / (maximumCount - minimumCount));
  const position = HAPPINESS_SKY_POSITIONS[Math.min(Math.max(index, 0), HAPPINESS_SKY_POSITIONS.length - 1)];

  return {
    ...position,
    ratio,
    diameter: Math.round(76 + ratio * 84),
    fontSize: Math.round(14 + ratio * 16),
    depth: Math.max(18, 96 - index * 7),
  };
};
