import type { ThemeId } from '../themes/themeConfig';

const KEY = 'syncQueue:v2';

type Op = { type: 'createStar' | 'deleteStar'; themeId: ThemeId; payload: any };

export const enqueue = (op: Op) => {
  const arr: Op[] = JSON.parse(localStorage.getItem(KEY) || '[]');
  arr.push(op);
  localStorage.setItem(KEY, JSON.stringify(arr));
};

export const flush = async (handler: (op: Op) => Promise<void>) => {
  const arr: Op[] = JSON.parse(localStorage.getItem(KEY) || '[]');
  const remain: Op[] = [];
  for (const op of arr) {
    try { await handler(op); } catch { remain.push(op); }
  }
  localStorage.setItem(KEY, JSON.stringify(remain));
};
