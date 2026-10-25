"use client";

import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/* The track and fill match Slider's, so a progress bar and a slider beside it read as one family: the
   track is a wash of the text colour (it tints with the theme and flips with the mode), and the fill is
   --glass-accent, the vivid foreground-hue accent every active control uses. Neither is a glass surface:
   a bar this thin has nothing to blur. */
function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-foreground/15", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-full bg-[var(--glass-accent)] transition-transform"
        style={{
          transform: `translateX(-${100 - (value ?? 0)}%)`,
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
