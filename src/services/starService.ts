import { supabase, mockDatabase } from './supabase';

export interface StarData {
  id: string;
  user_id: string;
  nickname: string;
  position_x: number;
  position_y: number;
  color?: string;
  size?: number;
  shape?: string;
  message?: string;
  created_at: string;
}

export interface UserData {
  id: string;
  nickname: string;
  created_at: string;
  total_stars: number;
}

// 用户服务
export const userService = {
  async createUser(nickname: string): Promise<UserData> {
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .insert([{ nickname }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      // 使用模拟数据库
      return mockDatabase.createUser(nickname);
    }
  },

  async getUser(userId: string): Promise<UserData | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('获取用户失败:', error);
        return null;
      }
      return data;
    } else {
      return mockDatabase.getUser(userId);
    }
  }
};

// 星星服务
export const starService = {
  async createStar(
    userId: string,
    nickname: string,
    position: { x: number; y: number },
    options?: { color?: string; size?: number; shape?: string; message?: string }
  ): Promise<StarData> {
    if (supabase) {
      const { data, error } = await supabase
        .from('stars')
        .insert([{
          user_id: userId,
          position_x: position.x,
          position_y: position.y,
          color: options?.color,
          message: options?.message
        }])
        .select(`
          *,
          users!inner(nickname)
        `)
        .single();
      
      if (error) throw error;
      return {
        ...data,
        nickname: data.users.nickname
      };
    } else {
      return mockDatabase.createStar(userId, nickname, position, options);
    }
  },

  async getAllStars(): Promise<StarData[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('stars')
        .select(`
          *,
          users!inner(nickname)
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('获取星星失败:', error);
        return [];
      }
      
      return data.map(star => ({
        ...star,
        nickname: star.users.nickname
      }));
    } else {
      return await mockDatabase.getAllStars() as StarData[];
    }
  },

  async getUserStars(userId: string): Promise<StarData[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('stars')
        .select(`
          *,
          users!inner(nickname)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('获取用户星星失败:', error);
        return [];
      }
      
      return data.map(star => ({
        ...star,
        nickname: star.users.nickname
      }));
    } else {
      return await mockDatabase.getUserStars(userId) as StarData[];
    }
  },
  async deleteStar(starId: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('stars').delete().eq('id', starId);
      if (error) {
        console.error('删除星星失败:', error);
        return false;
      }
      return true;
    } else {
      return await mockDatabase.deleteStar(starId);
    }
  }
};

export default {
  userService,
  starService
};