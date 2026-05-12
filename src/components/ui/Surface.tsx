import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

export function Surface({
  children,
  className,
  interactive = false,
  padding = "md",
}: SurfaceProps) {
  const paddingMap = {
    none: "",
    sm: "p-3",
    md: "p-5",
    lg: "p-6",
  };

  return (
    <div
      className={cn(
        "surface",
        interactive && "surface-interactive cursor-pointer transition-all duration-200",
        paddingMap[padding],
        className
      )}
    >
      {children}
    </div>
  );
}
