// src/services/tcb.ts (修改后的完整版)

import cloudbase from '@cloudbase/js-sdk';

// 1. 获取环境变量
const envId = import.meta.env.VITE_TCB_ENV_ID;

// 2. 声明导出的变量，初始值为 null
export let tcbApp: any = null;
export let tcbAuth: any = null;
export let tcbDb: any = null;

// 3. 只有在 envId 存在时，才尝试初始化
if (envId) {
  // ====================================================================
  // ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓ 这是我们添加的核心诊断逻辑 ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
  // ====================================================================
  try {
    // 在尝试初始化前，先打印一次我们拿到的值
    console.log(`>>> 准备初始化 TCB SDK，使用的 envId 是: "${envId}"`);

    // 执行初始化
    tcbApp = cloudbase.init({
      env: envId,
    });

    // 初始化认证和数据库实例
    tcbAuth = tcbApp.auth({ persistence: 'local' });
    tcbDb = tcbApp.database();

    // 如果成功，打印成功信息
    console.log('>>> TCB SDK 初始化成功！实例已创建。');

  } catch (error) {
    // 如果失败，将错误用 console.error 打印出来，这样会是红色的
    console.error('>>> 致命错误：TCB SDK 初始化失败！原因:', error);
    
    // 确保在失败时，所有实例都为 null
    tcbApp = null;
    tcbAuth = null;
    tcbDb = null;
  }
  // ====================================================================
  // ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
  // ====================================================================
} else {
  // 如果连 envId 都没有，也打印一个日志
  console.warn('>>> 警告：未找到 VITE_TCB_ENV_ID 环境变量，无法初始化 TCB SDK。');
}


// --- 后续的业务逻辑代码保持不变 ---

export const ensureSignIn = async () => {
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
    await (tcbDb as any).collection('stars').limit(1).get();
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