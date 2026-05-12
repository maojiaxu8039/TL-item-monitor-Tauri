import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl" | "full";
}

export function PageShell({ children, className, size = "xl" }: PageShellProps) {
  const sizeMap = {
    md: "max-w-[672px]",
    lg: "max-w-[960px]",
    xl: "max-w-[1152px]",
    full: "max-w-none",
  };

  return (
    <div className={cn("w-full mx-auto", sizeMap[size], className)}>
      {children}
    </div>
  );
}
