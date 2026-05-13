import { cn } from "@/lib/utils";
import { type ElementType, type ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number | ReactNode;
  icon?: ElementType;
  iconBg?: string;
  iconColor?: string;
  helper?: ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  iconBg = "bg-[rgba(255,184,0,0.08)]",
  iconColor = "text-[var(--color-brand-gold)]",
  helper,
  className,
}: MetricCardProps) {
  return (
    <div className={cn("metric-card", className)}>
      {Icon && (
        <div className={cn("metric-card-icon", iconBg, iconColor)}>
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">{value}</div>
      {helper && <div className="metric-card-helper">{helper}</div>}
    </div>
  );
}
