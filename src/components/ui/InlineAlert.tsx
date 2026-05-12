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
      bg: "bg-blue-50",
      text: "text-blue-800",
      icon: Info,
      iconColor: "text-blue-500",
    },
    warning: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      icon: AlertTriangle,
      iconColor: "text-amber-500",
    },
    error: {
      bg: "bg-red-50",
      text: "text-red-800",
      icon: AlertCircle,
      iconColor: "text-red-500",
    },
    success: {
      bg: "bg-green-50",
      text: "text-green-800",
      icon: CheckCircle,
      iconColor: "text-green-500",
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
