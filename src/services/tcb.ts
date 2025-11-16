import cloudbase from '@cloudbase/js-sdk';

const envId = import.meta.env.VITE_TCB_ENV_ID || '';

export const tcbApp = envId ? cloudbase.init({ env: envId }) : null;
export const tcbAuth = tcbApp ? tcbApp.auth({ persistence: 'local' }) : null;
export const tcbDb = tcbApp ? tcbApp.database() : null;

const ensureSignIn = async () => {
  if (!tcbAuth) return;
  const state = await (tcbAuth as any).getLoginState();
  if (!state) {
    await (tcbAuth as any).anonymousAuthProvider().signIn();
  }
};

export const isTcbReachable = async (): Promise<boolean> => {
  if (!tcbDb) return false;
  try {
    await ensureSignIn();
    await tcbDb.collection('stars').limit(1).get();
    return true;
  } catch {
    return false;
  }
};

export const tcbService = {
  async createUser(nickname: string) {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    const now = new Date().toISOString();
    const res: any = await (tcbDb as any).collection('users').add({ nickname, created_at: now, total_stars: 0 });
    const id = res.id || res._id;
    return { id, nickname, created_at: now, total_stars: 0 };
  },
  async getAllStars() {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    const res: any = await (tcbDb as any).collection('stars').orderBy('created_at', 'desc').get();
    return (res.data || []).map((d: any) => ({
      id: d._id || d.id,
      user_id: d.user_id,
      position_x: d.position_x,
      position_y: d.position_y,
      color: d.color,
      size: d.size,
      shape: d.shape,
      message: d.message,
      nickname: d.nickname,
      created_at: d.created_at,
    }));
  },
  async createStar(payload: {
    user_id: string;
    position_x: number;
    position_y: number;
    color?: string;
    size?: number;
    shape?: string;
    message?: string;
    nickname: string;
  }) {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    const doc = { ...payload, created_at: new Date().toISOString() };
    const res: any = await (tcbDb as any).collection('stars').add(doc);
    const id = res.id || res._id;
    return { id, ...doc };
  },
  async deleteStar(id: string) {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    await (tcbDb as any).collection('stars').doc(id).remove();
    return true;
  }
};

export default tcbService;