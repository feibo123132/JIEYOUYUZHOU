export interface AvatarCropAdjustment {
  x: number;
  y: number;
  scale: number;
}

export interface AvatarCropLayout {
  width: number;
  height: number;
  left: number;
  top: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const calculateAvatarCropLayout = (
  imageWidth: number,
  imageHeight: number,
  adjustment: AvatarCropAdjustment,
): AvatarCropLayout => {
  const safeWidth = Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : 1;
  const safeHeight = Number.isFinite(imageHeight) && imageHeight > 0 ? imageHeight : 1;
  const ratio = safeWidth / safeHeight;
  const scale = Math.max(1, Number.isFinite(adjustment.scale) ? adjustment.scale : 1);
  const width = (ratio >= 1 ? ratio * 100 : 100) * scale;
  const height = (ratio >= 1 ? 100 : (100 / ratio)) * scale;
  const x = clamp(Number.isFinite(adjustment.x) ? adjustment.x : 50, 0, 100) / 100;
  const y = clamp(Number.isFinite(adjustment.y) ? adjustment.y : 50, 0, 100) / 100;

  return {
    width,
    height,
    left: width === 100 || x === 0 ? 0 : -(width - 100) * x,
    top: height === 100 || y === 0 ? 0 : -(height - 100) * y,
  };
};
