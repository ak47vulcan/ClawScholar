"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types/user";
import { api } from "@/lib/api-client";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  setTokens: (access: string, refresh: string, user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,

      setTokens: (access, refresh, user) =>
        set({ accessToken: access, refreshToken: refresh, user, isAuthenticated: true }),

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await api.post<{ access_token: string; refresh_token: string; user: User }>(
            "/auth/login",
            { email, password }
          );
          set({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user, isLoading: false, isAuthenticated: true });
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },

      register: async (email, password, fullName) => {
        set({ isLoading: true });
        try {
          const res = await api.post<{ access_token: string; refresh_token: string; user: User }>(
            "/auth/register",
            { email, password, full_name: fullName }
          );
          set({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user, isLoading: false, isAuthenticated: true });
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },

      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: "clawscholar-auth",
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user, isAuthenticated: s.isAuthenticated }),
    }
  )
);
