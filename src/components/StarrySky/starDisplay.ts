const shuffled = <T>(items: readonly T[], random: () => number) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

export const selectVisibleStars = <T>(
  stars: readonly T[],
  mode: 'random' | 'full' | 'messages',
  random: () => number = Math.random,
) => {
  if (mode !== 'random' || stars.length <= 30) return [...stars];
  return shuffled(stars, random).slice(0, 30);
};
