import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadingStateProps {
  message?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function LoadingState({
  message = "加载中...",
  icon,
  className = ""
}: LoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className}`} role="status" aria-live="polite">
      <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-brand)]" />
      {icon}
      <p className="text-sm text-[var(--color-text-subtle)]">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "出错了",
  message = "加载失败，请稍后重试",
  onRetry,
  className = ""
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 p-8 text-center ${className}`} role="alert">
      <div className="w-12 h-12 rounded-full bg-[var(--color-danger)]/10 flex items-center justify-center">
        <AlertTriangle className="h-6 w-6 text-[var(--color-danger)]" />
      </div>
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      <p className="text-xs text-[var(--color-text-subtle)]">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} size="sm">
          重试
        </Button>
      )}
    </div>
  );
}

export { EmptyState } from "@/components/ui/EmptyState";

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = "", lines = 3 }: SkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-[var(--color-panel)] rounded animate-pulse"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  );
}
