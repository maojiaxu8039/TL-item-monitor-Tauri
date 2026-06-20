import { RefreshCw } from "lucide-react";

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
    <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className}`}>
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
    <div className={`flex flex-col items-center justify-center gap-3 p-8 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-[var(--color-danger)]/10 flex items-center justify-center">
        <span className="text-2xl">😕</span>
      </div>
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      <p className="text-xs text-[var(--color-text-subtle)]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm bg-[var(--color-brand)] text-black rounded-lg hover:opacity-90 transition-opacity"
        >
          重试
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title = "暂无数据",
  message,
  action,
  className = ""
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 p-8 ${className}`}>
      {icon || (
        <div className="w-12 h-12 rounded-full bg-[var(--color-panel)] flex items-center justify-center">
          <span className="text-2xl">📭</span>
        </div>
      )}
      <p className="text-sm font-medium text-[var(--color-text-subtle)]">{title}</p>
      {message && (
        <p className="text-xs text-[var(--color-text-subtle)] opacity-70">{message}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

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
