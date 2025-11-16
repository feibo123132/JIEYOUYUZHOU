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
  async getAllStars() {
    const r = await fetch(`${base}/stars`, { method: 'GET' });
    if (!r.ok) throw new Error('api_error');
    return r.json();
  },
  async createStar(payload: StarPayload) {
    const r = await fetch(`${base}/stars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('api_error');
    return r.json();
  },
  async deleteStar(id: string) {
    const r = await fetch(`${base}/stars/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('api_error');
    return true;
  }
};

export default api;