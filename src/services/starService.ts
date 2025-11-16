// src/services/starService.ts (修改后的完整版，含追踪日志)

import { supabase, mockDatabase } from './supabase';
import { api } from './api';
import { isBackendReachable } from './connectivity';
import { enqueue } from '../utils/syncQueue'; // 移除了 flush 的导入，因为它未使用
import { tcbService, isTcbReachable, tcbApp } from './tcb';

// StarData 接口定义
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

// UserData 接口定义
export interface UserData {
  id: string;
  nickname: string;
  created_at: string;
  total_stars: number;
}

// 用户服务
const userService = {
  async createUser(nickname: string): Promise<UserData> {
    // ↓↓↓↓↓↓ 追踪日志 #1: 函数入口 ↓↓↓↓↓↓
    console.log('--- STAR_SERVICE: createUser called. Analyzing backend options...');

    // 检查 Supabase (已知会跳过)
    if (supabase) {
      console.log('--- STAR_SERVICE: Supabase client exists. Attempting to use Supabase...');
      const { data, error } = await supabase
        .from('users')
        .insert([{ nickname }])
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      // ↓↓↓↓↓↓ 追踪日志 #2: 检查 TCB ↓↓↓↓↓↓
      console.log('--- STAR_SERVICE: Supabase client not found. Checking TCB backend. `tcbApp` object is:', tcbApp);
      
      if (tcbApp) {
        const reachable = await isTcbReachable();
        // ↓↓↓↓↓↓ 追踪日志 #3: TCB 可达性结果 ↓↓↓↓↓↓
        console.log(`--- STAR_SERVICE: isTcbReachable() check returned: ${reachable}`);
        
        if (reachable) {
          console.log('--- STAR_SERVICE: TCB is reachable. Calling tcbService.createUser...');
          return tcbService.createUser(nickname);
        }
      }
    }

    // ↓↓↓↓↓↓ 追踪日志 #4: 检查自定义后端 ↓↓↓↓↓↓
    console.log('--- STAR_SERVICE: Checking custom REST backend...');
    if (await isBackendReachable()) {
      console.log('--- STAR_SERVICE: Custom REST backend is reachable! Using it.');
      return api.createUser(nickname);
    }
    
    // ↓↓↓↓↓↓ 追踪日志 #5: 最终的兜底方案 ↓↓↓↓↓↓
    console.log('--- STAR_SERVICE: All remote backends failed. Falling back to mock database.');
    return mockDatabase.createUser(nickname);
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
  },
};

// 星星服务
const starService = {
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
          message: options?.message,
          // userslinner(nickname) 似乎是特定语法，保持原样
        }])
        .select('*, users!inner(nickname)')
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
        .select('*, users!inner(nickname)')
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
        .select('*, users!inner(nickname)')
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