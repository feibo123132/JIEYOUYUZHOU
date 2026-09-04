import { createClient } from '@supabase/supabase-js';
import type { ThemeId } from '../themes/themeConfig';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

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
  users: new Map<string, any>(),
  stars: {
    life: new Map<string, any>(),
  } satisfies Record<ThemeId, Map<string, any>>,
  nextId: 0,
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
    themeId: ThemeId,
    userId: string,
    nickname: string,
    position: { x: number; y: number },
    options?: { color?: string; size?: number; shape?: string; message?: string }
  ) {
    const star = {
      id: `${themeId}-${Date.now()}-${++this.nextId}`,
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
    this.stars[themeId].set(star.id, star);
    const user = this.users.get(userId);
    if (user) {
      user.total_stars += 1;
    }
    return star;
  },
  async deleteStar(themeId: ThemeId, starId: string) {
    const existed = this.stars[themeId].get(starId);
    if (existed) {
      existed.deleted_at = Date.now();
      return true;
    }
    return false;
  },
  async restoreStar(themeId: ThemeId, starId: string) {
    const star = this.stars[themeId].get(starId);
    if (!star) return false;
    delete star.deleted_at;
    return true;
  },
  async permanentDeleteStar(themeId: ThemeId, starId: string) {
    return this.stars[themeId].delete(starId);
  },
  async getAllStars(themeId: ThemeId) {
    return Promise.resolve(Array.from(this.stars[themeId].values()).filter((star: any) => !star.deleted_at) as any[]);
  },
  async getAllStarRecords(themeId: ThemeId) {
    return Promise.resolve(Array.from(this.stars[themeId].values()) as any[]);
  },
  async getUserStars(themeId: ThemeId, userId: string) {
    return Promise.resolve(
      Array.from(this.stars[themeId].values()).filter((star: any) => !star.deleted_at && star.user_id === userId) as any[]
    );
  },
  async updateStar(themeId: ThemeId, starId: string, updates: Partial<{ color: string; size: number; shape: string; message: string }>) {
    const star = this.stars[themeId].get(starId);
    if (!star) return false;
    Object.assign(star, updates);
    return true;
  }
};

export default supabase;
