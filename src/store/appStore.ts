import { create } from 'zustand';
import type { ThemeId } from '../themes/themeConfig';

export type AppView = 'theme-hub' | 'welcome' | 'starry-sky' | 'keepsake-studio' | 'song-request';

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
  activeTheme: ThemeId | null;
  currentView: AppView;
  isLoading: boolean;
  error: string | null;
}

interface AppActions {
  setUser: (user: User | null) => void;
  setStars: (stars: Star[]) => void;
  addStar: (star: Star) => void;
  enterTheme: (theme: ThemeId) => void;
  enterKeepsakeStudio: () => void;
  enterSongRequestStation: () => void;
  enterStarrySky: () => void;
  returnToWelcome: () => void;
  returnToThemeHub: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const useAppStore = create<AppState & AppActions>((set) => ({
  // 状态
  user: null,
  stars: [],
  activeTheme: null,
  currentView: 'theme-hub',
  isLoading: false,
  error: null,

  // 动作
  setUser: (user) => set({ user }),
  setStars: (stars) => set({ stars }),
  addStar: (star) => set((state) => ({ 
    stars: [...state.stars, star] 
  })),
  enterTheme: (activeTheme) => set({
    activeTheme,
    currentView: 'welcome',
    stars: [],
    error: null,
  }),
  enterKeepsakeStudio: () => set({ currentView: 'keepsake-studio' }),
  enterSongRequestStation: () => set({ currentView: 'song-request' }),
  enterStarrySky: () => set((state) => state.activeTheme ? {
    currentView: 'starry-sky',
    stars: [],
    error: null,
  } : {
    activeTheme: null,
    currentView: 'theme-hub',
    stars: [],
    error: null,
  }),
  returnToWelcome: () => set((state) => state.activeTheme ? {
    currentView: 'welcome',
    stars: [],
    error: null,
  } : {
    activeTheme: null,
    currentView: 'theme-hub',
    stars: [],
    error: null,
  }),
  returnToThemeHub: () => set({
    activeTheme: null,
    currentView: 'theme-hub',
    stars: [],
    error: null,
  }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));

export default useAppStore;
