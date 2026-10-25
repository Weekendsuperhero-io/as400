"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & {
    variant?: "default" | "glass";
    /** Soft themed shadow (folded from the glass wrapper). */
    glow?: boolean;
  }
>(({ className, orientation = "horizontal", decorative = true, variant = "glass", glow, ...props }, ref) => {
  // A colored line, not a glass panel — the variant map stays (token use, no resolveMaterial).
  const variants = {
    default: "bg-border",
    glass: "bg-[var(--glass-border)]",
  };

  return (
    <SeparatorPrimitive.Root
      ref={ref}
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        variants[variant],
        glow && "shadow-sm shadow-(color:--glass-glow)",
        className,
      )}
      {...props}
    />
  );
});
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
