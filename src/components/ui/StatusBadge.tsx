import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface StatusBadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "primary";
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({
  children,
  variant = "default",
  size = "md",
  className,
}: StatusBadgeProps) {
  const variantMap = {
    default: "border border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-text-muted)]",
    success: "border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] text-[var(--color-success)]",
    warning: "border border-[rgba(255,184,0,0.32)] bg-[rgba(255,184,0,0.1)] text-[var(--color-brand-gold)]",
    danger: "border border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.1)] text-[var(--color-danger)]",
    info: "border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.1)] text-sky-300",
    primary: "border border-[rgba(255,184,0,0.36)] bg-[rgba(255,184,0,0.14)] text-[var(--color-brand-gold)]",
  };

  const sizeMap = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2.5 py-0.5",
  };

  return (
    <span className={cn("status-badge", variantMap[variant], sizeMap[size], className)}>
      {children}
    </span>
  );
}
