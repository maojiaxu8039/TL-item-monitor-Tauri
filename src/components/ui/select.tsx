import * as React from "react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <select
    className={cn(
      "flex h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-3 py-2 text-sm text-[var(--color-text)] ring-offset-[var(--color-app-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
      className
    )}
    ref={ref}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = "Select"

export { Select }
