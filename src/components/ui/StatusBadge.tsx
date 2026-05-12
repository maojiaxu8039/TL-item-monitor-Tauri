import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface StatusBadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "primary";
  className?: string;
}

export function StatusBadge({
  children,
  variant = "default",
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

  return (
    <span className={cn("status-badge", variantMap[variant], className)}>
      {children}
    </span>
  );
}
