import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 如果环境变量未设置，使用开发模式
const isDevelopment = !supabaseUrl || !supabaseAnonKey;

if (isDevelopment) {
  console.warn('Supabase 配置未找到，使用本地开发模式');
}

// 创建 Supabase 客户端
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 模拟数据库服务（开发模式使用）
export const mockDatabase = {
  users: new Map(),
  stars: new Map(),
  async createUser(nickname: string) {
    const user = {
      id: Date.now().toString(),
      nickname,
      created_at: new Date().toISOString(),
      total_stars: 0
    };
    this.users.set(user.id, user);
    return user;
  },
  async getUser(id: string) {
    return this.users.get(id) || null;
  },
  async createStar(
    userId: string,
    nickname: string,
    position: { x: number; y: number },
    options?: { color?: string; size?: number; shape?: string; message?: string }
  ) {
    const star = {
      id: Date.now().toString(),
      user_id: userId,
      nickname,
      position_x: position.x,
      position_y: position.y,
      color: options?.color ?? '#FFD700',
      size: options?.size ?? 24,
      shape: options?.shape ?? 'star',
      message: options?.message ?? `${nickname} 到此一游`,
      created_at: new Date().toISOString()
    } as any;
    this.stars.set(star.id, star);
    const user = this.users.get(userId);
    if (user) {
      user.total_stars += 1;
    }
    return star;
  },
  async deleteStar(starId: string) {
    const existed = this.stars.get(starId);
    if (existed) {
      this.stars.delete(starId);
      return true;
    }
    return false;
  },
  async getAllStars() {
    return Promise.resolve(Array.from(this.stars.values()) as any[]);
  },
  async getUserStars(userId: string) {
    return Promise.resolve(
      Array.from(this.stars.values()).filter((star: any) => star.user_id === userId) as any[]
    );
  }
};

export default supabase;