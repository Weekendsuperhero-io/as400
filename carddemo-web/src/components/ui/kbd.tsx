import type * as React from "react";

import { cn } from "@/lib/utils";

/* A key cap. Deliberately NOT a glass surface: a cap is a few pixels of chrome inside text, and a blur
   that small reads as noise. A wash of the text colour plus the material's hairline edge carries it on
   every material and both modes. shadcn's version inverts its colours inside a tooltip because its
   tooltip is a solid dark chip; Sistine's tooltip is veiled glass in the page's own text colour, so the
   plain treatment already reads there and the inversion would only turn the cap into a hole. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border border-[var(--glass-border)] bg-foreground/10 px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return <kbd data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

export { Kbd, KbdGroup };
