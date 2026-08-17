import {
  getThemeStarApiPath,
  getThemeTodayCountApiPath,
  type ThemeId,
} from '../themes/themeConfig';

type StarPayload = {
  user_id: string;
  position_x: number;
  position_y: number;
  color?: string;
  size?: number;
  shape?: string;
  message?: string;
};

const base = import.meta.env.VITE_API_BASE || '';

export const api = {
  async createUser(nickname: string) {
    const r = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    });
    if (!r.ok) throw new Error('api_error');
    return r.json();
  },
  async getAllStars(themeId: ThemeId) {
    const r = await fetch(`${base}${getThemeStarApiPath(themeId)}`, { method: 'GET' });
    if (!r.ok) throw new Error('api_error');
    return r.json();
  },
  async createStar(themeId: ThemeId, payload: StarPayload) {
    const r = await fetch(`${base}${getThemeStarApiPath(themeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('api_error');
    return r.json();
  },
  async deleteStar(themeId: ThemeId, id: string) {
    const r = await fetch(`${base}${getThemeStarApiPath(themeId, id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('api_error');
    return true;
  },
  async getTodayCountByNickname(themeId: ThemeId, nickname: string) {
    const params = new URLSearchParams({ nickname });
    const r = await fetch(`${base}${getThemeTodayCountApiPath(themeId)}?${params.toString()}`, { method: 'GET' });
    if (!r.ok) throw new Error('api_error');
    const data = await r.json();
    return Number(data?.count || 0);
  }
};

export default api;
