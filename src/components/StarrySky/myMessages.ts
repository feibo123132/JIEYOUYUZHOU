export interface MyMessageStar {
  id: string;
  userId?: string;
  nickname?: string;
  message?: string;
  createdAt: string;
  color?: string;
  shape?: string;
}

export const getMyMessages = (stars: MyMessageStar[], userId: string, nickname?: string): MyMessageStar[] => {
  const normalizedNickname = nickname?.trim();
  return stars
    .filter((star) => (
      Boolean(star.message?.trim())
      && (
        star.userId === userId
        || Boolean(normalizedNickname && star.nickname?.trim() === normalizedNickname)
      )
    ))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
};
