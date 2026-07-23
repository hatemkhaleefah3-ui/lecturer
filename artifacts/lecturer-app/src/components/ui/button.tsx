import * as React from "react"
import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "outline" | "ghost" | "secondary"
type ButtonSize = "default" | "sm" | "lg" | "icon"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}): string {
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    {
      "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90": variant === "default",
      "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground": variant === "outline",
      "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
      "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80": variant === "secondary",
      "h-10 px-6 py-2": size === "default",
      "h-8 px-4 text-xs": size === "sm",
      "h-12 px-8 text-base": size === "lg",
      "h-10 w-10": size === "icon",
    },
    className,
  )
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  ),
)
Button.displayName = "Button"

export { Button }
