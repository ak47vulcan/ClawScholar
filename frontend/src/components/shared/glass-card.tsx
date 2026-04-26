import { cn } from "@/lib/utils";

interface GlassCardProps {
  variant?: "default" | "elevated" | "flat";
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export function GlassCard({ variant = "default", glow, className, children, onClick }: GlassCardProps) {
  const base =
    variant === "elevated"
      ? "glass-elevated"
      : variant === "flat"
      ? "glass-flat"
      : "glass";

  return (
    <div
      className={cn(base, glow && "glow-border", onClick && "cursor-pointer", className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
