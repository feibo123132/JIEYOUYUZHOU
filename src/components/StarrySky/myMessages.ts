export interface MyMessageStar {
  id: string;
  userId?: string;
  message?: string;
  createdAt: string;
  color?: string;
  shape?: string;
}

export const getMyMessages = (stars: MyMessageStar[], userId: string): MyMessageStar[] => (
  stars
    .filter((star) => star.userId === userId && Boolean(star.message?.trim()))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
);
