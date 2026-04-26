import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "danger" | "info" | "muted";

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  success: "badge-approved",
  warning: "badge-unverified",
  danger: "badge-rejected",
  info: "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25",
  muted: "bg-[var(--surface-3)] text-[var(--text-dim)] border border-[var(--border)]",
};

export function Badge({ variant = "muted", children, className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-xs font-medium", variantClasses[variant], className)}>
      {children}
    </span>
  );
}
