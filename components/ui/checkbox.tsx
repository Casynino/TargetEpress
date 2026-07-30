"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox built on a real <input type="checkbox">.
 *
 * Native gives us keyboard behaviour, form participation and the
 * indeterminate state for free — all of which the table's "select all" needs.
 */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    indeterminate?: boolean;
  }
>(({ className, indeterminate, checked, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(forwardedRef, () => innerRef.current!);

  React.useEffect(() => {
    if (innerRef.current) {
      innerRef.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        ref={innerRef}
        type="checkbox"
        checked={checked}
        className={cn(
          "peer h-4 w-4 cursor-pointer appearance-none rounded border border-input bg-background transition-colors",
          "checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      <Check
        className="pointer-events-none absolute h-3 w-3 text-brand-foreground opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
        strokeWidth={3}
      />
      <Minus
        className="pointer-events-none absolute h-3 w-3 text-brand-foreground opacity-0 peer-indeterminate:opacity-100"
        strokeWidth={3}
      />
    </span>
  );
});
Checkbox.displayName = "Checkbox";
