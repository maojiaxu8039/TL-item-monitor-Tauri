import { cn } from "@/lib/utils";
import { type ElementType, type ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
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
  iconBg = "bg-slate-100",
  iconColor = "text-slate-600",
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
