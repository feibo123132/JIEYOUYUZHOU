import { create } from 'zustand';

interface User {
  id: string;
  nickname: string;
  isAuthenticated: boolean;
}

interface Star {
  id: string;
  x: number;
  y: number;
  nickname: string;
  createdAt: string;
  userId?: string;
}

interface AppState {
  user: User | null;
  stars: Star[];
  currentView: 'welcome' | 'starry-sky' | 'profile';
  isLoading: boolean;
  error: string | null;
}

interface AppActions {
  setUser: (user: User | null) => void;
  setStars: (stars: Star[]) => void;
  addStar: (star: Star) => void;
  setCurrentView: (view: 'welcome' | 'starry-sky' | 'profile') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const useAppStore = create<AppState & AppActions>((set) => ({
  // 状态
  user: null,
  stars: [],
  currentView: 'welcome',
  isLoading: false,
  error: null,

  // 动作
  setUser: (user) => set({ user }),
  setStars: (stars) => set({ stars }),
  addStar: (star) => set((state) => ({ 
    stars: [...state.stars, star] 
  })),
  setCurrentView: (currentView) => set({ currentView }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));

export default useAppStore;