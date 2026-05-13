import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { type ReactNode } from "react";

interface InlineAlertProps {
  children: ReactNode;
  variant?: "info" | "warning" | "error" | "success";
  className?: string;
}

export function InlineAlert({
  children,
  variant = "info",
  className,
}: InlineAlertProps) {
  const variantMap = {
    info: {
      bg: "border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.1)]",
      text: "text-[var(--color-ai)]",
      icon: Info,
      iconColor: "text-[var(--color-ai)]",
    },
    warning: {
      bg: "border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.1)]",
      text: "text-[var(--color-brand-gold)]",
      icon: AlertTriangle,
      iconColor: "text-[var(--color-brand-gold)]",
    },
    error: {
      bg: "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.1)]",
      text: "text-[var(--color-danger)]",
      icon: AlertCircle,
      iconColor: "text-[var(--color-danger)]",
    },
    success: {
      bg: "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)]",
      text: "text-[var(--color-success)]",
      icon: CheckCircle,
      iconColor: "text-[var(--color-success)]",
    },
  };

  const config = variantMap[variant];
  const Icon = config.icon;

  return (
    <div className={cn("inline-alert", config.bg, config.text, className)}>
      <Icon className={cn("inline-alert-icon", config.iconColor)} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
