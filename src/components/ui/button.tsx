import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-app-bg)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black shadow-[0_0_18px_rgba(255,106,0,0.28)] hover:brightness-110",
        outline: "border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text)] shadow-sm hover:border-[var(--color-brand)] hover:bg-[var(--color-panel-soft)]",
        ghost: "text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)] hover:text-[var(--color-brand-gold)]",
        destructive: "bg-[var(--color-danger)] text-black shadow-sm hover:brightness-110",
        secondary: "bg-[var(--color-panel-soft)] text-[var(--color-text)] hover:bg-[rgba(255,184,0,0.12)]",
        success: "bg-[var(--color-success)] text-black shadow-sm hover:brightness-110",
        warning: "bg-[var(--color-warning)] text-black shadow-sm hover:brightness-110",
        info: "bg-[var(--color-ai)] text-black shadow-sm hover:brightness-110",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
