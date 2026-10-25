"use client";

import { X } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { type MaterialAxisProps, type MaterialProps, materialSurface, splitAxisProps } from "@/lib/material";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/* Variant classes carry BEHAVIOR only; the surface comes from materialSurface. */
const dialogContentVariants = cva("", {
  variants: {
    variant: {
      default: "bg-background border",
      glass: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "glass",
  },
});

/* Role: bordered adaptive glass at the elevated blur tier. */
const ROLE: MaterialProps = {
  border: true,
  size: "lg",
};

const Dialog = DialogPrimitive.Root;

/* Trigger and Close stamp their data-slot (consumers style and test against it), as the content's own close
   button already did; Root and Portal render no element of their own, so they stay plain aliases. */
const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>((props, ref) => <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />);
DialogTrigger.displayName = DialogPrimitive.Trigger.displayName;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Close>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>>(
  (props, ref) => <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />,
);
DialogClose.displayName = DialogPrimitive.Close.displayName;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 z-50 bg-transparent backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
    VariantProps<typeof dialogContentVariants> &
    MaterialAxisProps & {
      /** Elevated backdrop blur (folded from the glass wrapper). */
      animated?: boolean;
      /** Styles the layout wrapper around `children` (`data-slot="dialog-layout"`). `className` targets
       *  the OUTER surface, so without this a consumer has no way to change the body's layout — swap the
       *  grid for flex, drop the gap, or take the scrolling over entirely.
       *  Its `-m-6 p-6` is a matched pair that cancels the dialog's padding so the scroll container
       *  stops clipping child shadows; override one and you must override the other. */
      bodyClassName?: string;
      showCloseButton?: boolean;
    }
>(({ className, variant = "glass", children, animated = true, bodyClassName, showCloseButton = true, ...props }, ref) => {
  const [axes, rest] = splitAxisProps(props);
  const m = materialSurface(variant === "default" ? null : ROLE, axes);

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        data-material={m?.["data-material"]}
        className={cn(
          m?.className,
          // Centered WITHOUT a transform. The usual `left-1/2 top-1/2 -translate-1/2` lands any
          // odd-pixel-sized dialog on a half pixel, and on a composited glass surface every glyph then
          // rasterizes off the pixel grid — visibly blurry text. `inset-0 m-auto h-fit` centers through
          // layout instead, which snaps to whole pixels. (This is why the inset-positioned sheet was
          // always crisp and dialogs were not.) The slide-* utilities are gone with it: they existed
          // only to offset that base translate, and here they would drag the dialog off-centre. Fade +
          // zoom both END AT IDENTITY, so nothing is left on a fractional transform once open.
          // NOTE the underscores in the max-h arbitrary value: Tailwind turns them into spaces, and
          // `calc(100dvh-2rem)` without them is invalid CSS (calc needs whitespace around - and +), so the
          // whole declaration is silently dropped and the cap does nothing.
          // max-h + an inner scroll area: without a cap, content taller than the viewport simply ran off
          // the bottom with no way to reach it. The DIALOG keeps overflow-hidden (it clips the rounded
          // corners and keeps the absolutely-positioned close button pinned); the scrolling happens in
          // the wrapper around {children} below, so the close button never scrolls out of reach.
          // grid-rows-[minmax(0,1fr)] is the other half of it: an IMPLICIT auto row sizes to its content
          // and happily overflows a max-height, so the wrapper never became scrollable and the dialog
          // just clipped. minmax(0,1fr) lets the row shrink, which is what hands the overflow to the
          // wrapper's overflow-y-auto.
          // `min(100% − 2rem, 32rem)` keeps a 1rem gutter each side on narrow screens (at `w-full
          // max-w-lg` it ran edge to edge below 512px), and outline-hidden stops the browser outline
          // ringing the whole panel when Radix focuses the content itself (nothing tabbable inside).
          "@container/dialog-content fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh_-_2rem)] grid-rows-[minmax(0,1fr)] w-full max-w-[min(calc(100%-2rem),32rem)] gap-4 overflow-hidden rounded-lg p-6 shadow-lg outline-hidden duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          dialogContentVariants({
            variant,
          }),
          className,
        )}
        {...rest}
      >
        {/* The layout wrapper has two modes.
            WITHOUT a DialogBody child it is the scroll box, as it always was: header, content and footer
            scroll together.
            WITH one (`has-[>[data-slot=dialog-body]]:`) it becomes a non-clipping flex column and only
            the body scrolls: the header and footer are chrome, not content, and inside a scroll box a
            glass button's glow was sliced at whichever edge it touched (overflow-y:auto clips on all
            four sides, see below), and the footer scrolled away with the text.
            min-w-0 + [&>*]:min-w-0: grid and flex items default to min-width:auto, so one unbreakable
            child (a long path with `truncate`) set the track WIDER than the dialog and every line laid
            out to that phantom width, clipped at the border. Letting the items shrink fixes wrap/truncate.
            min-h-0 is load-bearing: a grid item defaults to min-height:auto, which refuses to shrink
            below its content, so without it this never scrolls and the dialog just clips again.
            -m-6 p-6 cancels the dialog's own p-6 so this box's edges land ON the dialog's padding box
            instead of its content box. That matters because `overflow-y: auto` is not one-axis: when
            either axis is non-visible the other computes visible -> auto, so this is a scroll
            container HORIZONTALLY too, and a scroll container clips at its padding box. Sitting at the
            content box it sheared every child's box-shadow flat 24px inside the dialog edge — a hard
            vertical cut down the side of the last footer button and a hard horizontal one under the
            footer row. Cancelling the padding moves that clip out to where the dialog's own
            overflow-hidden already clips, which does the same job and follows the rounded corners.
            The two utilities are a pair: overriding padding alone via bodyClassName re-offsets the
            body by the leftover negative margin. */}
        <div
          data-slot="dialog-layout"
          className={cn(
            "-m-6 grid min-h-0 min-w-0 gap-4 overflow-y-auto p-6 [&>*]:min-w-0",
            "has-[>[data-slot=dialog-body]]:flex has-[>[data-slot=dialog-body]]:flex-col has-[>[data-slot=dialog-body]]:overflow-visible",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("flex shrink-0 flex-col space-y-1.5 text-center @sm/dialog-content:text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

/**
 * The scrolling region of a dialog. Optional: put it between DialogHeader and DialogFooter and only it
 * scrolls, with the header and footer fixed around it; leave it out and the whole dialog content scrolls
 * as one, as before.
 * `-mx-6 px-6` runs the scroll box out to the dialog's edges (a scroll container clips at its padding
 * box, so sitting at the content box it sheared child shadows 24px inside the edge), and `-my-2 py-2`
 * gives a glow 8px of room above and below without moving the content.
 */
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-body"
    className={cn("-mx-6 -my-2 grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-2 [&>*]:min-w-0", className)}
    {...props}
  />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  showCloseButton?: boolean;
}) => (
  <div
    data-slot="dialog-footer"
    className={cn("flex shrink-0 flex-col-reverse gap-2 @sm/dialog-content:flex-row @sm/dialog-content:justify-end", className)}
    {...props}
  >
    {children}
    {showCloseButton && (
      <DialogPrimitive.Close asChild>
        <Button variant="outline">Close</Button>
      </DialogPrimitive.Close>
    )}
  </div>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
