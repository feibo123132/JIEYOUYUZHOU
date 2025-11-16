export const withTimeout = async <T>(p: Promise<T>, ms = 3000): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
  });
};

export const isBackendReachable = async (): Promise<boolean> => {
  const base = import.meta.env.VITE_API_BASE as string | undefined;
  if (!base) return false;
  try {
    const res = await withTimeout(fetch(`${base}/health`, { method: 'GET', cache: 'no-store' }), 2500);
    return res.ok;
  } catch {
    return false;
  }
};