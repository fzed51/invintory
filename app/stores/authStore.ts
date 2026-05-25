import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AuthUser = {
  id: number;
  email: string;
  token: string;
};

type AuthState = {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'invintory-auth',
    },
  ),
);
