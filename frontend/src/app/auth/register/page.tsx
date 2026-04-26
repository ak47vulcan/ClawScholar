"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, User, ArrowRight } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Input } from "@/components/shared/Input";
import { useAuthStore } from "@/stores/auth-store";
import { pageVariants } from "@/lib/motion-variants";

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError("");
    try {
      await register(email, password, name);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    }
  };

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4">
      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        className="w-full max-w-[400px] flex flex-col gap-8"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-xl shadow-indigo-500/30">
            <Zap size={28} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Create your account</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>Start your research workspace</p>
          </div>
        </div>

        {/* Card */}
        <div
          className="p-8 rounded-[2rem] relative overflow-hidden group transition-all duration-700 hover:shadow-xl"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.015), rgba(255,255,255,0.002))",
            border: "1px solid rgba(255,255,255,0.03)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.03)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Dynamic top glow */}
          <div
            className="absolute top-0 left-1/3 w-1/3 h-px pointer-events-none opacity-30 group-hover:opacity-60 group-hover:w-full group-hover:left-0 transition-all duration-1000 ease-out"
            style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)" }}
          />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 relative z-10">
            <Input
              label="Full name"
              type="text"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              icon={<User size={14} />}
              autoComplete="name"
            />
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={14} />}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={14} />}
              error={error}
              required
              autoComplete="new-password"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              icon={<ArrowRight size={16} />}
              className="mt-2 w-full justify-center"
            >
              Create account
            </Button>
          </form>

          <p className="text-center text-xs mt-5" style={{ color: "var(--text-dim)" }}>
            Already have an account?{" "}
            <Link href="/auth/login" className="font-medium hover:underline" style={{ color: "var(--primary)" }}>
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
