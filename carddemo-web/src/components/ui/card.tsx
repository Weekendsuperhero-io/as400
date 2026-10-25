import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { type HoverEffect, hoverEffects } from "@/lib/hover-effects";
import { type MaterialAxisProps, materialSurface, splitAxisProps } from "@/lib/material";
import { cn } from "@/lib/utils";

/* Variant classes carry BEHAVIOR only; the surface comes from materialSurface. */
const cardVariants = cva("flex flex-col gap-6 rounded-xl py-6", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground border shadow-sm",
      glass: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "glass",
  },
});

/* Role: borderless adaptive glass. */
const ROLE = {};

function Card({
  className,
  variant = "glass",
  effect,
  animated,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> &
  MaterialAxisProps & {
    effect?: HoverEffect;
    /** Scale + deepen shadow on hover (folded from the glass wrapper). */
    animated?: boolean;
  }) {
  const [axes, rest] = splitAxisProps(props);
  const m = materialSurface(variant === "default" ? null : ROLE, axes);

  return (
    <div
      data-slot="card"
      data-material={m?.["data-material"]}
      className={cn(
        m?.className,
        cardVariants({
          variant,
        }),
        animated && "transition-[transform,box-shadow] duration-150 hover:scale-[1.02] hover:shadow-[var(--glass-shadow-lg)]",
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

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

/* leading-tight, not upstream's leading-none: a title that fits on one line looks identical either way,
   but line-height:1 sets a WRAPPING title's lines almost touching — visible on narrow cards and on
   mobile, where longer titles routinely wrap. text-balance already evens the line lengths; this gives
   those lines somewhere to breathe. */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("font-semibold text-balance leading-tight", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-muted-foreground text-sm text-pretty", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-6 [.border-t]:pt-6", className)} {...props} />;
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
