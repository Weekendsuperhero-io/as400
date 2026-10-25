import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { type MaterialAxisProps, materialSurface, splitAxisProps } from "@/lib/material";
import { cn } from "@/lib/utils";

/* Variant classes carry BEHAVIOR only; the surface comes from materialSurface. */
const tableVariants = cva("w-full caption-bottom text-sm", {
  variants: {
    variant: {
      default: "",
      /* Rounded, but NOT overflow-hidden: `overflow: hidden` makes the <table> a scroll container, and a
         sticky header binds to its nearest one, so it rode along with the rows. The container clips the
         corners instead (see below). */
      glass: "rounded-lg",
    },
  },
  defaultVariants: {
    variant: "glass",
  },
});

/* Role: bordered adaptive glass. */
const ROLE = {
  border: true,
};

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> &
    VariantProps<typeof tableVariants> &
    MaterialAxisProps & {
      /** When true, rows alternate in brightness and the per-row dividers are removed. */
      striped?: boolean;
      /** Classes for the wrapping container, which is the element that scrolls: pass a height and an
       * overflow (`max-h-96 overflow-y-auto`) and a `sticky top-0` TableHeader pins to it. */
      containerClassName?: string;
      /** Let a table wider than its container scroll sideways instead of being clipped (shadcn's table
       * always does). Opt-in because it makes the container a scroll container: a `sticky top-0` header
       * then pins to the container rather than the page, so pair it with a max height when the header
       * should stay visible as the rows scroll. */
      scrollX?: boolean;
    }
>(({ className, containerClassName, variant = "glass", striped = false, scrollX = false, ...props }, ref) => {
  const [axes, rest] = splitAxisProps(props);
  const m = materialSurface(variant === "default" ? null : ROLE, axes);

  const stripedClass = striped
    ? "[&_tbody_tr]:border-0 [&_tbody_tr:nth-child(even)]:bg-black/[0.07] dark:[&_tbody_tr:nth-child(even)]:bg-black/[0.22] [&_tbody_tr:nth-child(even):hover]:bg-muted/50"
    : "";

  return (
    /* `overflow-clip`, not `overflow-hidden`: it clips the header and row fills to the rounded corners
       without making the container a scroll container, so it never captures a sticky header on its own.
       A consumer's `overflow-y-auto` (containerClassName) makes it the scroller on purpose; the x axis
       then computes to hidden and keeps the corners clipped. */
    <div data-slot="table-container" className={cn(m !== null && "rounded-lg overflow-clip", scrollX && "overflow-x-auto", containerClassName)}>
      <table
        ref={ref}
        data-slot="table"
        data-striped={striped}
        data-material={m?.["data-material"]}
        className={cn(
          m?.className,
          tableVariants({
            variant,
          }),
          stripedClass,
          className,
        )}
        {...rest}
      />
    </div>
  );
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <thead ref={ref} data-slot="table-header" className={cn("[&_tr]:border-b bg-black/[0.12] dark:bg-black/[0.35]", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tbody ref={ref} data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tfoot ref={ref} data-slot="table-footer" className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    data-slot="table-row"
    className={cn(
      "border-b border-[var(--glass-border)] transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    data-slot="table-head"
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    data-slot="table-cell"
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(({ className, ...props }, ref) => (
  <caption ref={ref} data-slot="table-caption" className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
