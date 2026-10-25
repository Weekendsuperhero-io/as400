"use client";

import { CaretDownIcon, CaretUpIcon, Check } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";

import { type MaterialAxisProps, materialSurface, splitAxisProps } from "@/lib/material";
import { useComposedRefs, useSnappedPopper } from "@/lib/snap-popper";
import { cn } from "@/lib/utils";

/* Variant classes carry BEHAVIOR only; the surface comes from materialSurface. The trigger shows the
   destructive error state when marked aria-invalid (as Input, Textarea and Checkbox already did; a select
   inside an invalid FormControl showed nothing), rings only on KEYBOARD focus, and lays out an icon in
   the value beside its text. */
const selectTriggerVariants = cva(
  "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-input bg-background",
        glass: "",
      },
    },
    defaultVariants: {
      variant: "glass",
    },
  },
);

const selectContentVariants = cva(
  // Capped at 24rem AND at the room Radix measures on screen: in popper mode Radix only publishes that
  // height, it caps nothing, so on a short viewport the list ran off the screen instead of scrolling.
  "relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-xl shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  {
    variants: {
      variant: {
        default: "bg-popover text-popover-foreground border",
        glass: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "glass",
    },
  },
);

/* Trigger role: bordered adaptive glass. */
const TRIGGER_ROLE = {
  border: true,
};

/* Content role: bordered + veiled adaptive glass. */
const CONTENT_ROLE = {
  border: true,
  veil: true,
};

const Select = SelectPrimitive.Root;

/* Group and Value render elements of their own, so they stamp their data-slot (Root renders none). */
const SelectGroup = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Group>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Group>>(
  (props, ref) => <SelectPrimitive.Group ref={ref} data-slot="select-group" {...props} />,
);
SelectGroup.displayName = SelectPrimitive.Group.displayName;

const SelectValue = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Value>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>>(
  (props, ref) => <SelectPrimitive.Value ref={ref} data-slot="select-value" {...props} />,
);
SelectValue.displayName = SelectPrimitive.Value.displayName;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> &
    VariantProps<typeof selectTriggerVariants> &
    MaterialAxisProps & {
      size?: "sm" | "default";
    }
>(({ className, children, variant = "glass", size = "default", ...props }, ref) => {
  const [axes, rest] = splitAxisProps(props);
  const m = materialSurface(variant === "default" ? null : TRIGGER_ROLE, axes);

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      data-material={m?.["data-material"]}
      className={cn(
        m?.className,
        selectTriggerVariants({
          variant,
        }),
        className,
      )}
      {...rest}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <CaretDownIcon className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    data-slot="select-scroll-up-button"
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <CaretUpIcon className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    data-slot="select-scroll-down-button"
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <CaretDownIcon className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & VariantProps<typeof selectContentVariants> & MaterialAxisProps
>(({ className, children, position = "popper", align = "center", variant = "glass", ...props }, ref) => {
  const [axes, rest] = splitAxisProps(props);
  const snapRef = useSnappedPopper();
  const composedRef = useComposedRefs(ref, snapRef);
  const m = materialSurface(variant === "default" ? null : CONTENT_ROLE, axes);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={composedRef}
        data-slot="select-content"
        data-material={m?.["data-material"]}
        className={cn(
          m?.className,
          selectContentVariants({
            variant,
          }),
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        align={align}
        {...rest}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Label>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>>(
  ({ className, ...props }, ref) => (
    <SelectPrimitive.Label ref={ref} data-slot="select-label" className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />
  ),
);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span data-slot="select-item-indicator" className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  ),
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    data-slot="select-separator"
    className={cn("pointer-events-none -mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
