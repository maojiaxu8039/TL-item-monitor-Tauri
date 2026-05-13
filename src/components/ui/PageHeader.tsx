import { cn } from "@/lib/utils";
import { AssetIcon, type IconAssetName } from "@/components/brand/AssetIcon";
import { type ReactNode, type ElementType } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  iconAsset?: IconAssetName;
  icon?: ElementType;
  iconBg?: string;
  iconColor?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  iconAsset,
  icon: Icon,
  iconBg = "bg-slate-100",
  iconColor = "text-slate-600",
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("page-header", className)}>
      {iconAsset ? (
        <div className="page-header-icon page-header-icon-brand">
          <AssetIcon name={iconAsset} className="h-7 w-7" />
        </div>
      ) : Icon && (
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
