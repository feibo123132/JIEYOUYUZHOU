export const STAR_OWNER_ALIAS = '2421415030@qq.com';
export const STAR_OWNER_ID = 'jieyou-owner';
export const isReservedStarName = (name?: string) => name?.trim().toUpperCase() === 'JIEYOU';
export const countParticipantStars = (stars: Array<{ nickname?: string; deleted_at?: number; deletedAt?: number }>) =>
  stars.filter(star => !isReservedStarName(star.nickname) && !star.deleted_at && !star.deletedAt).length;
