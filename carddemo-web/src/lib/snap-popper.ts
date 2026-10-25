"use client";

import * as React from "react";

/**
 * Keeps text crisp on Radix popper surfaces (dropdown-menu, popover, tooltip, select, hover-card,
 * context-menu).
 *
 * THE DEFECT: on a high-density display the text in a popper rendered visibly soft. Radix positions the
 * surface with an inline `transform: translate(x, y)` on a wrapper element, written from Floating UI's
 * `floatingStyles`, and at a device pixel ratio of 1.5 or more Floating UI adds `will-change: transform`
 * to the same style (`@floating-ui/react-dom`, `floatingStyles`). `will-change` promotes the wrapper to
 * its own compositing layer, and WebKit drops subpixel (LCD) antialiasing for text on a composited layer;
 * sistine's popper content is glass, so a blurred backdrop sits right behind that text. Resetting
 * `will-change` to `auto` is the fix. The cost is a repaint on reposition instead of a layer move, for a
 * surface that is open for seconds.
 *
 * The ROUNDING below predates that diagnosis. Its premise was that unrounded offsets put glyphs off the
 * pixel grid, but Floating UI already rounds x/y to the device pixel grid (`roundByDPR`) before writing
 * them. It is kept for browser zoom, where the device grid and the CSS-pixel grid diverge, which has not
 * been verified either way; it is cheap and harmless, and removing it is a separate decision.
 *
 * Radix rewrites the style on scroll, resize and collision flips, so a MutationObserver re-applies both
 * after each write. The observer is re-entrant (our own write retriggers it), so each write is skipped
 * when the value is already what we want, which terminates the loop on the second pass at the latest.
 */
/**
 * The whole snap, as a pure string transform: given the wrapper's SPECIFIED inline `transform`, return
 * what it should be rewritten to, or `null` to leave it alone.
 *
 * Returning null is load-bearing in two cases and both are re-entrancy guards, since our own write
 * retriggers the MutationObserver that called us:
 *   - the value is already integral, so there is nothing to do and the loop terminates on pass one;
 *   - the value isn't a translate we recognise (Radix hasn't positioned yet), so we must not invent one.
 *
 * Split out of the hook so it can be checked without a DOM — see tests/snap-popper.test.tsx.
 */
export function snapTransform(specified: string): string | null {
  const parts = /^translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/.exec(specified);
  if (!parts) return null;
  const next = `translate(${Math.round(Number(parts[1]))}px, ${Math.round(Number(parts[2]))}px)`;
  return specified === next ? null : next;
}

export function useSnappedPopper<T extends HTMLElement>(): React.RefCallback<T> {
  const cleanupRef = React.useRef<(() => void) | null>(null);

  return React.useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;

    const wrapper = node.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
    if (!wrapper) return; // not popper-positioned (e.g. an inline/anchored render) — nothing to snap

    const snap = () => {
      // Read and write the SPECIFIED value, never the computed one. Under browser `zoom` the computed
      // transform is in a scaled space, so rounding it and writing the result back as authored px
      // never converges — snapTransform's equality guard would never hold and the observer would
      // re-enter forever.
      const next = snapTransform(wrapper.style.transform);
      if (next !== null) wrapper.style.transform = next;
      // Floating UI's will-change (DPR >= 1.5) is what costs the text its antialiasing. Only written when
      // something else is set, so the pass our own write triggers sees `auto` and stops.
      const willChange = wrapper.style.willChange;
      if (willChange !== "" && willChange !== "auto") wrapper.style.willChange = "auto";
    };

    snap();
    const observer = new MutationObserver(snap);
    observer.observe(wrapper, {
      attributes: true,
      attributeFilter: [
        "style",
      ],
    });
    cleanupRef.current = () => observer.disconnect();
  }, []);
}

/**
 * Merge the forwarded ref with the snapping ref, MEMOIZED — use this, not `composeRefs`, in JSX.
 *
 * A ref callback written inline gets a fresh identity on every render, and React responds by detaching
 * the old one (calling it with `null`) and attaching the new one. For a plain ref that is merely
 * wasteful; here the detach runs `useSnappedPopper`'s cleanup, so the MutationObserver watching the
 * popper wrapper is torn down and rebuilt on every single render of the surface.
 *
 * Same shape as Radix's own `useComposedRefs` — `useCallback` over the composed callback, with the
 * refs themselves as the dependency array, so the identity holds as long as the individual refs do.
 * Kept local rather than importing @radix-ui/react-compose-refs: these components ship through the
 * registry, and a direct dependency would have to be declared on all six of them.
 */
export function useComposedRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  /* The spread refs ARE the dependency list — the identity holds while each individual ref does. */
  return React.useCallback(composeRefs(...refs), refs);
}

/** Merge the forwarded ref with the snapping ref — both need the same node. Prefer the memoized
 *  {@link useComposedRefs} anywhere the result is handed to JSX. */
export function composeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}
