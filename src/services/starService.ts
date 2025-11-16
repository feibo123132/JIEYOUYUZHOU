import { supabase, mockDatabase } from './supabase';
import api from './api';
import { isBackendReachable } from './connectivity';
import { enqueue, flush } from '../utils/syncQueue';
import tcbService, { isTcbReachable, tcbApp } from './tcb';

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
      if (tcbApp && await isTcbReachable()) {
        return tcbService.createUser(nickname);
      }
      if (await isBackendReachable()) {
        return api.createUser(nickname);
      }
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
      if (tcbApp && await isTcbReachable()) {
        return tcbService.createStar({
          user_id: userId,
          position_x: position.x,
          position_y: position.y,
          color: options?.color,
          size: options?.size,
          shape: options?.shape,
          message: options?.message,
          nickname,
        });
      }
      if (await isBackendReachable()) {
        return api.createStar({
          user_id: userId,
          position_x: position.x,
          position_y: position.y,
          color: options?.color,
          size: options?.size,
          shape: options?.shape,
          message: options?.message,
        });
      }
      const local = await mockDatabase.createStar(userId, nickname, position, options);
      enqueue({ type: 'createStar', payload: { userId, nickname, position, options } });
      return local;
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
      if (tcbApp && await isTcbReachable()) {
        return tcbService.getAllStars();
      }
      if (await isBackendReachable()) {
        return api.getAllStars();
      }
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
      if (tcbApp && await isTcbReachable()) {
        const stars = await tcbService.getAllStars();
        return stars.filter((s: any) => s.user_id === userId);
      }
      if (await isBackendReachable()) {
        const stars = await api.getAllStars();
        return stars.filter((s: any) => s.user_id === userId);
      }
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
      if (tcbApp && await isTcbReachable()) {
        try { await tcbService.deleteStar(starId); return true; } catch { return false; }
      }
      if (await isBackendReachable()) {
        try { await api.deleteStar(starId); return true; } catch { return false; }
      }
      enqueue({ type: 'deleteStar', payload: { starId } });
      return await mockDatabase.deleteStar(starId);
    }
  }
};

export default {
  userService,
  starService
};