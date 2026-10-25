"use client";

import { Switch as SwitchPrimitives } from "radix-ui";
import * as React from "react";

import { type MaterialAxisProps, materialSurface, splitAxisProps } from "@/lib/material";
import { cn } from "@/lib/utils";

/* Role: bordered adaptive glass. */
const ROLE = {
  border: true,
};

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> &
    MaterialAxisProps & {
      variant?: "default" | "glass";
      size?: "sm" | "default";
    }
>(({ className, variant = "glass", size = "default", ...props }, ref) => {
  const [axes, rest] = splitAxisProps(props);
  // The THUMB is the glass surface element; the root track styles itself.
  /* `glow` rides the CHECKED state on the root track — kept out of the materialSurface forward below. */
  const m = materialSurface(variant === "default" ? null : ROLE, {
    ...axes,
    glow: undefined,
  });

  return (
    <SwitchPrimitives.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-[var(--glass-accent)] data-[state=unchecked]:bg-foreground/15 enabled:hover:data-[state=unchecked]:bg-foreground/25 enabled:hover:data-[state=checked]:brightness-110",
        axes.glow && "data-[state=checked]:glass-glow transition duration-200",
        className,
      )}
      {...rest}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        data-slot="switch-thumb"
        data-material={m?.["data-material"]}
        className={cn(
          m?.className,
          "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform group-data-[size=default]/switch:h-4 group-data-[size=default]/switch:w-4 group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-3 data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-2",
        )}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
