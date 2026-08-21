export function getStandingTailX(bodyWidth, side, curl) {
  const direction = side < 0 ? -1 : 1;
  const safeWidth = Math.max(0, Number(bodyWidth) || 0);
  const safeCurl = Math.max(-0.75, Math.min(2.25, Number(curl) || 0));
  const clearanceX = 0.33 * safeWidth + 0.11;

  return {
    root: 0,
    shoulder: direction * clearanceX * 0.9,
    mid: direction * clearanceX,
    tip: direction * (clearanceX + safeCurl * 0.04),
  };
}
