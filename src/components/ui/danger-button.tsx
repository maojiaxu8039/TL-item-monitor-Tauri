import * as React from "react"
import { cn } from "@/lib/utils"

interface DangerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode
  children?: React.ReactNode
  size?: "sm" | "md"
}

export const DangerButton = React.forwardRef<HTMLButtonElement, DangerButtonProps>(
  ({ className, icon, children, size = "md", ...props }, ref) => {
    const sizeClasses = size === "sm" 
      ? "p-1" 
      : "p-1.5"

    return (
      <button
        ref={ref}
        className={cn(
          "rounded-lg transition-all duration-200",
          "text-slate-400 hover:text-red-500",
          "hover:bg-red-50/80",
          "active:bg-red-100",
          "focus:outline-none focus:ring-2 focus:ring-red-500/20",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "inline-flex items-center justify-center gap-1.5",
          sizeClasses,
          className
        )}
        {...props}
      >
        {icon || children}
      </button>
    )
  }
)
DangerButton.displayName = "DangerButton"