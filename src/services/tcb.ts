// src/services/tcb.ts (最终胜利版，可直接复制)

import cloudbase from '@cloudbase/js-sdk';

// 1. 获取环境变量
const envId = import.meta.env.VITE_TCB_ENV_ID;

// 2. 声明导出的变量，初始值为 null
export let tcbApp: any = null;
export let tcbAuth: any = null;
export let tcbDb: any = null;

// 3. 只有在 envId 存在时，才尝试初始化
if (envId) {
  try {
    console.log(`>>> 准备初始化 TCB SDK，使用的 envId 是: "${envId}"`);
    tcbApp = cloudbase.init({ env: envId });
    tcbAuth = tcbApp.auth({ persistence: 'local' });
    tcbDb = tcbApp.database();
    console.log('>>> TCB SDK 初始化成功！实例已创建。');
  } catch (error) {
    console.error('>>> 致命错误：TCB SDK 初始化失败！原因:', error);
    tcbApp = null;
    tcbAuth = null;
    tcbDb = null;
  }
} else {
  console.warn('>>> 警告：未找到 VITE_TCB_ENV_ID 环境变量，无法初始化 TCB SDK。');
}

// 确保登录状态的函数 (已修正)
export const ensureSignIn = async () => {
  if (!tcbAuth) return;
  const state = await (tcbAuth as any).getLoginState();
  if (!state) {
    console.log('--- isTcbReachable: 用户未登录，正在尝试匿名登录...');
    // ↓↓↓↓↓↓ [最终修正] 使用了正确的匿名登录函数 `signInAnonymously` ↓↓↓↓↓↓
    await (tcbAuth as any).signInAnonymously();
    console.log('--- isTcbReachable: 匿名登录成功！');
  } else {
    console.log('--- isTcbReachable: 用户已登录。');
  }
};

// 检查 TCB 是否可达的函数
export const isTcbReachable = async (): Promise<boolean> => {
  if (!tcbDb) {
    console.log('--- isTcbReachable: 检查失败，因为 `tcbDb` 实例不存在。');
    return false;
  }
  
  try {
    console.log('--- isTcbReachable: 步骤 1/2 - 正在确保登录状态...');
    await ensureSignIn();
    
    console.log('--- isTcbReachable: 步骤 2/2 - 正在尝试从 "stars" 集合读取1条数据...');
    await (tcbDb as any).collection('stars').limit(1).get();
    
    console.log('--- isTcbReachable: 检查成功！TCB 可达。');
    return true;

  } catch (error) {
    console.error('--- isTcbReachable: 检查失败！TCB 不可达。根本原因:', error);
    return false;
  }
};

// 核心服务逻辑 (保持不变)
export const tcbService = {
  async createUser(nickname: string) {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    const now = new Date().toISOString();
    const res = await (tcbDb as any).collection('users').add({ nickname, created_at: now, total_stars: 0 });
    const id = res.id || res._id;
    return { id, nickname, created_at: now, total_stars: 0 };
  },

  async getAllStars() {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    const res = await (tcbDb as any).collection('stars').orderBy('created_at', 'desc').get();
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

  async getTodayCountByNickname(nickname: string) {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const tag = `${y}-${m}-${dd}`;
    const r = await (tcbDb as any).collection('stars').where({ nickname }).orderBy('created_at', 'desc').get();
    const c = (r.data || []).filter((x: any) => (x.created_at || '').startsWith(tag)).length;
    return c;
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
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const tag = `${y}-${m}-${dd}`;
    if (payload.nickname !== 'JIEYOU不解忧') {
      const r = await (tcbDb as any).collection('stars').where({ nickname: payload.nickname }).orderBy('created_at', 'desc').get();
      const c = (r.data || []).filter((x: any) => (x.created_at || '').startsWith(tag)).length;
      if (c >= 3) throw new Error('quota_exceeded');
    }
    const doc = { ...payload, created_at: new Date().toISOString() };
    const res = await (tcbDb as any).collection('stars').add(doc);
    return { id: res.id || res._id, ...doc };
  },

  async deleteStar(id: string) {
    if (!tcbDb) throw new Error('tcb_unavailable');
    await ensureSignIn();
    await (tcbDb as any).collection('stars').doc(id).remove();
    return true;
  }
};

export default tcbService;