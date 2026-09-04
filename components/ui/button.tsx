import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        brand: "bg-brand text-brand-foreground hover:bg-brand/90",
        signal: "bg-signal text-signal-foreground hover:bg-signal/90",
      },
      /*
        A REAL SCALE AGAIN, WITHOUT LOSING THE THUMB.

        All four of these were h-11. That came from a fair worry — a warehouse
        phone presses "Edit" with the same thumb as everything else — but the
        cure made `sm` and `lg` identical to `default`, so asking for a small
        button did nothing and every panel in the app was a stack of 44px
        slabs. The owner is right that it reads as heavy.

        36px is still a thumb-sized target, and it is what the secondary
        actions want: Download, Open invoice, the row actions in a table. 40px
        stays the default for anything that commits money, and lg keeps the
        full 44 for the one button on a page that matters most.
      */
      size: {
        default: "h-10 px-4 py-2",
        /* The shape the owner picked out of the panel and asked for
           everywhere: 32px, small type, tight padding. Every secondary action
           in the app already asks for `sm`, so this reaches Support, Finance,
           the manager and the owner's own screens without a call site
           changing. No gap here on purpose: the icons at those call sites
           carry their own mr-2, and adding one would space them twice. */
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
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
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
