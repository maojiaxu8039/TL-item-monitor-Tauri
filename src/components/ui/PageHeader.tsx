import { cn } from "@/lib/utils";
import { type ReactNode, type ElementType } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ElementType;
  iconBg?: string;
  iconColor?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  iconBg = "bg-slate-100",
  iconColor = "text-slate-600",
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("page-header", className)}>
      {Icon && (
        <div className={cn("page-header-icon", iconBg, iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="page-header-content">
        <h1 className="page-header-title">{title}</h1>
        {description && (
          <p className="page-header-description">{description}</p>
        )}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
