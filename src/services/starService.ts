import { api } from './api';
import { isBackendReachable } from './connectivity';
import { mockDatabase, supabase } from './supabase';
import {
  isTcbReachable,
  petService as tcbPetService,
  tcbApp,
  tcbService,
} from './tcb';
import { enqueue } from '../utils/syncQueue';
import { getThemeConfig, type ThemeId } from '../themes/themeConfig';

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

const themeUnavailable = (cause?: unknown) => {
  const error = new Error('theme_unavailable');
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
};

const requireReachableTcbTheme = async (themeId: ThemeId) => {
  if (!(await isTcbReachable(themeId))) throw themeUnavailable();
};

const userService = {
  async createUser(nickname: string): Promise<UserData> {
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .insert([{ nickname }])
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    if (tcbApp && await isTcbReachable('jieyou')) {
      return tcbService.createUser(nickname);
    }

    if (await isBackendReachable('jieyou')) {
      return api.createUser(nickname);
    }

    return mockDatabase.createUser(nickname);
  },

  async getUser(userId: string): Promise<UserData | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) return null;
      return data;
    }
    return mockDatabase.getUser(userId);
  },
};

const starService = {
  async createStar(
    themeId: ThemeId,
    userId: string,
    nickname: string,
    position: { x: number; y: number },
    options?: { color?: string; size?: number; shape?: string; message?: string; isAdminDevice?: boolean },
  ): Promise<StarData> {
    if (supabase) {
      const table = getThemeConfig(themeId).data.starsCollection;
      const { data, error } = await supabase
        .from(table)
        .insert([{
          user_id: userId,
          position_x: position.x,
          position_y: position.y,
          color: options?.color,
          size: options?.size,
          shape: options?.shape,
          message: options?.message,
        }])
        .select('*, users!inner(nickname)')
        .single();
      if (error) throw themeUnavailable(error);
      return { ...data, nickname: data.users?.nickname || nickname };
    }

    if (tcbApp) {
      await requireReachableTcbTheme(themeId);
      return tcbService.createStar(themeId, {
        user_id: userId,
        position_x: position.x,
        position_y: position.y,
        color: options?.color,
        size: options?.size,
        shape: options?.shape,
        message: options?.message,
        nickname,
        isAdminDevice: options?.isAdminDevice,
      });
    }

    if (await isBackendReachable(themeId)) {
      return api.createStar(themeId, {
        user_id: userId,
        position_x: position.x,
        position_y: position.y,
        color: options?.color,
        size: options?.size,
        shape: options?.shape,
        message: options?.message,
      });
    }

    const local = await mockDatabase.createStar(themeId, userId, nickname, position, options);
    enqueue({ type: 'createStar', themeId, payload: { userId, nickname, position, options } });
    return local;
  },

  async getAllStars(themeId: ThemeId): Promise<StarData[]> {
    if (supabase) {
      const table = getThemeConfig(themeId).data.starsCollection;
      const { data, error } = await supabase
        .from(table)
        .select('*, users!inner(nickname)')
        .order('created_at', { ascending: false });
      if (error) throw themeUnavailable(error);
      return (data || []).map((star: any) => ({
        ...star,
        nickname: star.users?.nickname || star.nickname,
      }));
    }

    if (tcbApp) {
      await requireReachableTcbTheme(themeId);
      return tcbService.getAllStars(themeId);
    }

    if (await isBackendReachable(themeId)) {
      return api.getAllStars(themeId);
    }

    return mockDatabase.getAllStars(themeId) as Promise<StarData[]>;
  },

  async getUserStars(themeId: ThemeId, userId: string): Promise<StarData[]> {
    const stars = await this.getAllStars(themeId);
    return stars.filter((star) => star.user_id === userId);
  },

  async getTodayCountByNickname(themeId: ThemeId, nickname: string): Promise<number> {
    if (supabase) {
      const stars = await this.getAllStars(themeId);
      const today = new Date().toISOString().slice(0, 10);
      return stars.filter((star) => star.nickname === nickname && star.created_at.startsWith(today)).length;
    }

    if (tcbApp) {
      await requireReachableTcbTheme(themeId);
      return tcbService.getTodayCountByNickname(themeId, nickname);
    }

    if (await isBackendReachable(themeId)) {
      return api.getTodayCountByNickname(themeId, nickname);
    }

    const stars = await mockDatabase.getAllStars(themeId);
    const today = new Date().toISOString().slice(0, 10);
    return stars.filter((star: any) => star.nickname === nickname && star.created_at.startsWith(today)).length;
  },

  async deleteStar(themeId: ThemeId, starId: string): Promise<boolean> {
    if (supabase) {
      const table = getThemeConfig(themeId).data.starsCollection;
      const { error } = await supabase.from(table).delete().eq('id', starId);
      if (error) throw themeUnavailable(error);
      return true;
    }

    if (tcbApp) {
      await requireReachableTcbTheme(themeId);
      return tcbService.deleteStar(themeId, starId);
    }

    if (await isBackendReachable(themeId)) {
      return api.deleteStar(themeId, starId);
    }

    enqueue({ type: 'deleteStar', themeId, payload: { starId } });
    return mockDatabase.deleteStar(themeId, starId);
  },
};

const petService = {
  async getPetStatus(themeId: ThemeId) {
    if (tcbApp) {
      await requireReachableTcbTheme(themeId);
      try {
        return await tcbPetService.getPetStatus(themeId);
      } catch (error) {
        throw themeUnavailable(error);
      }
    }
    return mockDatabase.getPetStatus(themeId);
  },

  async interactWithPet(themeId: ThemeId, userId?: string) {
    if (tcbApp) {
      await requireReachableTcbTheme(themeId);
      try {
        return await tcbPetService.interactWithPet(themeId, userId);
      } catch (error) {
        throw themeUnavailable(error);
      }
    }
    return mockDatabase.interactWithPet(themeId, userId);
  },
};

export default {
  userService,
  starService,
  petService,
};
