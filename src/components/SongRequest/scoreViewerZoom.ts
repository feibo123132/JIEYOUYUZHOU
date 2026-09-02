export interface ScoreSize {
  width: number;
  height: number;
}

export const SCORE_ZOOM_MIN = 1;
export const SCORE_ZOOM_MAX = 5;
export const SCORE_ZOOM_STEP = 0.5;

const isUsableSize = (size: ScoreSize) => Number.isFinite(size.width)
  && Number.isFinite(size.height)
  && size.width > 0
  && size.height > 0;

export const clampScoreZoom = (zoom: number) => Math.max(
  SCORE_ZOOM_MIN,
  Math.min(SCORE_ZOOM_MAX, Number.isFinite(zoom) ? zoom : SCORE_ZOOM_MIN),
);

export const stepScoreZoom = (zoom: number, direction: -1 | 1) => clampScoreZoom(
  Number((zoom + (direction * SCORE_ZOOM_STEP)).toFixed(2)),
);

export const getFittedScoreSize = (viewport: ScoreSize, image: ScoreSize): ScoreSize => {
  if (!isUsableSize(viewport) || !isUsableSize(image)) return { width: 0, height: 0 };
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
};

export const getReadingScoreZoom = (viewport: ScoreSize, image: ScoreSize) => {
  const fitted = getFittedScoreSize(viewport, image);
  if (fitted.width <= 0) return SCORE_ZOOM_MIN;
  return clampScoreZoom(Number((viewport.width / fitted.width).toFixed(2)));
};

export const getPinchScoreZoom = (startZoom: number, startDistance: number, currentDistance: number) => {
  if (!Number.isFinite(startDistance) || startDistance <= 0 || !Number.isFinite(currentDistance)) {
    return clampScoreZoom(startZoom);
  }
  return clampScoreZoom(startZoom * (currentDistance / startDistance));
};
