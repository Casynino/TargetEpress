import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        /*
          No vertical padding, on purpose.

          A single-line input centres its own text inside its content box, so
          padding buys nothing here — it only shrinks that box. The height is
          always set by an h-* class, and border-box sizing takes the padding
          out of it: at h-8 that left 32 − 2 border − 16 padding = 14px of box
          for a 20px line, which cut the text in half. Compact controls are
          everywhere in this app — table filters, inline editors, the move
          panel — so the padding had to go rather than each of them.
        */
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
