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
    jieyou: new Map<string, any>(),
    life: new Map<string, any>(),
  } satisfies Record<ThemeId, Map<string, any>>,
  petXp: {
    jieyou: 0,
    life: 0,
  } satisfies Record<ThemeId, number>,
  petDaily: {
    jieyou: new Set<string>(),
    life: new Set<string>(),
  } satisfies Record<ThemeId, Set<string>>,
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
      this.stars[themeId].delete(starId);
      return true;
    }
    return false;
  },
  async getAllStars(themeId: ThemeId) {
    return Promise.resolve(Array.from(this.stars[themeId].values()) as any[]);
  },
  async getUserStars(themeId: ThemeId, userId: string) {
    return Promise.resolve(
      Array.from(this.stars[themeId].values()).filter((star: any) => star.user_id === userId) as any[]
    );
  },
  async getPetStatus(themeId: ThemeId) {
    return { xp: this.petXp[themeId] };
  },
  async interactWithPet(themeId: ThemeId, userId?: string) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `${userId || 'device'}:${day}`;
    if (this.petDaily[themeId].has(key)) {
      return { added: false, xp: this.petXp[themeId] };
    }
    this.petDaily[themeId].add(key);
    this.petXp[themeId] += 1;
    return { added: true, xp: this.petXp[themeId] };
  }
};

export default supabase;
