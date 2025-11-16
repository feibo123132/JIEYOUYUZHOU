const KEY = 'syncQueue';

type Op = { type: 'createStar' | 'deleteStar'; payload: any };

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