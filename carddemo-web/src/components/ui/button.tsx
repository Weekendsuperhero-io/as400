import { cva, type VariantProps } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";
import type * as React from "react";
import { type HoverEffect, hoverEffects } from "@/lib/hover-effects";
import { type MaterialAxisProps, type MaterialProps, materialSurface, splitAxisProps } from "@/lib/material";
import { cn } from "@/lib/utils";

/* SEMANTIC variants only — each carries BEHAVIOR (text, hover, press shadows); the SURFACE comes from
   the material system (materialSurface below). The five materials + axes are the material/border/veil/
   gradient/glow/sheen props, not variants. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-hidden focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.96] active:transition-transform",
  {
    variants: {
      variant: {
        glass: "text-foreground hover:opacity-90 transition active:opacity-80 active:shadow-[var(--press-shadow-strong)]",
        /* The one FILLED action (better-colors: one primary per view, colour on the background not the
           label). It now follows the page material: --srf-bg-image / --srf-shadow are inherited custom
           properties that styles.css sets on <html> per [data-glass] and materials.css sets on any
           [data-material] ancestor, so reading them with the glass stack as fallback makes this button
           wear crystal / chakra / opaque like everything else. It previously hardcoded var(--glass-bg)
           and var(--glass-shadow), pinning the GLASS sheet no matter what the page was wearing.
           The FILL stays --primary/--primary-foreground rather than moving to the gradient accent: that
           pair is contrast-solved (measured worst Lc 87.4 light / 60.9 dark across all 17 presets),
           where the gradient sits at L 60–68 — a mid-tone where text of EITHER polarity runs out of
           room. Measured worst there was Lc 55.5 with text-foreground and no better with any other
           tier or alpha, against an ARC Bronze body floor of 60.
           It deliberately does NOT take the `glass` utility: that utility writes background-color, which
           would override bg-primary and leave the fill fighting it for nothing. */
        default:
          "bg-primary text-primary-foreground [background-image:var(--srf-bg-image,var(--glass-stack-bg))] shadow-[var(--srf-shadow,var(--glass-shadow))] hover:brightness-105 dark:hover:brightness-95 transition active:opacity-90 active:shadow-[var(--press-shadow)]",
        destructive:
          "text-destructive border border-destructive/60 hover:opacity-90 transition active:opacity-80 focus-visible:ring-destructive/20 active:shadow-[var(--press-shadow-strong)]",
        outline:
          "text-foreground border-2 border-foreground/20 hover:border-foreground/40 dark:border-white/40 dark:hover:border-white/60 dark:text-white transition active:border-foreground/50 active:shadow-[var(--press-shadow-sm)]",
        secondary: "text-foreground hover:opacity-90 transition active:opacity-80 active:shadow-[var(--press-shadow-strong)]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 active:bg-accent/80 dark:active:bg-accent/60 active:shadow-[var(--press-shadow-sm)]",
        link: "text-primary underline-offset-4 hover:underline active:opacity-80",
      },
      size: {
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "glass",
      size: "default",
    },
  },
);

/* Each semantic variant's surface role: glass = borderless adaptive glass; destructive/outline the
   same (their chrome is their own border); secondary a bordered surface; default/ghost/link render no
   glass surface. */
const SURFACE_ROLE: Record<string, MaterialProps | null> = {
  glass: {},
  destructive: {},
  outline: {
    size: "sm",
  },
  secondary: {
    border: true,
  },
  /* null = no `glass` utility, deliberately (see the variant above: it would overwrite bg-primary's
     background-color). `default` still tracks the page material, but through the INHERITED --srf-*
     tokens rather than the utility. The trade is that a per-instance material prop does not apply to
     this one variant — it follows the page, not the button. */
  default: null,
  ghost: null,
  link: null,
};

function Button({
  className,
  variant = "glass",
  size = "default",
  asChild = false,
  effect,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  } & MaterialAxisProps & {
    effect?: HoverEffect;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";

  const [axes, rest] = splitAxisProps(props);
  const m = materialSurface(SURFACE_ROLE[variant ?? "glass"] ?? null, axes);

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-material={m?.["data-material"]}
      data-glass-tint={variant === "destructive" ? "destructive" : undefined}
      className={cn(
        m?.className,
        buttonVariants({
          variant,
          size,
        }),
        effect &&
          hoverEffects({
            hover: effect,
          }),
        className,
      )}
      {...rest}
    />
  );
}

export { Button, buttonVariants };
