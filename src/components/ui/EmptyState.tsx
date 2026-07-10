import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
import { type ReactNode, type ElementType } from "react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  message?: string;
  icon?: ElementType;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  title = "暂无数据",
  description,
  message,
  icon: Icon = Inbox,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  const detail = description ?? message;
  return (
    <div className={cn("empty-state", compact && "empty-state-compact", className)} role="status">
      <Icon className="empty-state-icon" />
      <h3 className="empty-state-title">{title}</h3>
      {detail && <p className="empty-state-description">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
