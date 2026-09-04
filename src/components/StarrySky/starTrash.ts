export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface TrashStarIdentity {
  id: string
  user_id: string
  nickname: string
  deleted_at?: number
}

export const getTrashDaysRemaining = (deletedAt?: number, now = Date.now()): number => {
  if (!deletedAt) return 0
  const remaining = TRASH_RETENTION_MS - (now - deletedAt)
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)))
}

export const isTrashExpired = (deletedAt?: number, now = Date.now()): boolean =>
  Boolean(deletedAt && now - deletedAt > TRASH_RETENTION_MS)

export const selectAccessibleTrashStars = <T extends TrashStarIdentity>(
  stars: readonly T[],
  userId: string,
  nickname: string,
  isAdminDevice: boolean,
): T[] => stars
  .filter((star) => Boolean(star.deleted_at))
  .filter((star) => isAdminDevice || star.user_id === userId || star.nickname === nickname)
  .sort((first, second) => (second.deleted_at || 0) - (first.deleted_at || 0))
