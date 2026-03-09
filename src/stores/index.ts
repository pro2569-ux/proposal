import { create } from 'zustand'

interface AppState {
  user: null | { id: string; email: string; name?: string }
  setUser: (user: AppState['user']) => void
  clearUser: () => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}))
