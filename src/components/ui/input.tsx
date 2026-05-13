import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-3 py-2 text-sm text-[var(--color-text)] ring-offset-[var(--color-app-bg)] placeholder:text-[var(--color-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
      className
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = "Input"

export { Input }
