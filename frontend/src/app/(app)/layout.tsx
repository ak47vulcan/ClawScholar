"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ToastContainer } from "@/components/shared/ToastContainer";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { useAuthStore } from "@/stores/auth-store";
import { useAgentStream } from "@/hooks/use-agent-stream";

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" } },
};

// Module-level flag: stays true after the first hydration tick.
// Prevents AuthGuard from showing the spinner on every soft navigation.
let _didHydrate = false;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(_didHydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const redirected = useRef(false);

  // Fire once — marks hydration complete so Zustand persist has settled
  useEffect(() => {
    if (!_didHydrate) {
      _didHydrate = true;
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated && !isAuthenticated && !redirected.current) {
      redirected.current = true;
      router.replace("/auth/login");
    }
  }, [hydrated, isAuthenticated, router]);

  // Show spinner only on the very first page load, never on tab-switches
  if (!hydrated) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: "var(--background, #0a0b0f)" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "rgba(99,102,241,0.4)", borderTopColor: "transparent" }}
          />
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useAgentStream();

  return (
    <ThemeProvider>
      <AuthGuard>
        <div className="flex h-screen overflow-hidden" style={{ background: "var(--background)" }}>
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
            {/*
              mode="sync" (default) lets old and new pages animate simultaneously —
              no blank gap like mode="wait" had.
            */}
            <AnimatePresence initial={false}>
              <motion.div
                key={pathname}
                variants={pageVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                className="flex flex-col h-full overflow-hidden absolute inset-0"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <CommandPalette />
        <ToastContainer />
      </AuthGuard>
    </ThemeProvider>
  );
}
