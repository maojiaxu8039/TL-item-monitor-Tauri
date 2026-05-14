import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { type ReactNode } from "react";
import { AssetIcon } from "@/components/brand/AssetIcon";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "正在加载...",
  className,
}: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 gap-4", className)}>
      <div className="relative">
        <div className="w-14 h-14 rounded-xl border border-[rgba(255,184,0,0.24)] bg-[var(--color-panel)] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[var(--color-brand)] animate-spin" />
        </div>
        <div className="absolute inset-0 rounded-xl bg-[rgba(255,106,0,0.06)] animate-pulse" />
      </div>
      <div className="text-center">
        <div className="text-sm text-[var(--color-text-muted)]">{message}</div>
      </div>
    </div>
  );
}