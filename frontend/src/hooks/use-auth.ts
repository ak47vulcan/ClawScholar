"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export function useAuth() {
  const router = useRouter();
  const { user, accessToken, isLoading, login, register, logout } = useAuthStore();

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      await login(email, password);
      router.push("/dashboard");
    },
    [login, router]
  );

  const handleRegister = useCallback(
    async (email: string, password: string, fullName?: string) => {
      await register(email, password, fullName);
      router.push("/dashboard");
    },
    [register, router]
  );

  const handleLogout = useCallback(() => {
    logout();
    router.push("/auth/login");
  }, [logout, router]);

  return {
    user,
    isAuthenticated: !!accessToken,
    isLoading,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
  };
}
