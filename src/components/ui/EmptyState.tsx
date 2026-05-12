import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
import { type ReactNode, type ElementType } from "react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ElementType;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title = "暂无数据",
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      <Icon className="empty-state-icon" />
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
