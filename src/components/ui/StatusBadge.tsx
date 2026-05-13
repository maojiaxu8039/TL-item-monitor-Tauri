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
    default: "bg-slate-100 text-slate-700",
    success: "bg-green-50 text-green-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    info: "bg-blue-50 text-blue-700",
    primary: "bg-slate-900 text-white",
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
