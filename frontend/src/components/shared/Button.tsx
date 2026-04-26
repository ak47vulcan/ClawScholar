"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-indigo-500 hover:bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-500/20",
  secondary: "bg-[var(--surface-3)] hover:bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]",
  ghost: "bg-transparent hover:bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] border-transparent",
  danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25",
  outline: "bg-transparent hover:bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-3 text-xs gap-1.5 rounded-md",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-6 text-sm gap-2 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium border transition-all duration-150 focus-ring",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
