import * as React from "react";

/**
 * Prebaked frost — the position half of `.glass-prebaked` (app/theme/styles.css).
 *
 * A fixed background is the case this handles. Each bubble's blurred slice is a viewport-sized copy
 * of `--app-bg-blurred`, shifted by the bubble's viewport position so the copy lines up with the
 * page. One rAF reads the visible bubbles and writes `--gx` / `--gy`. No React state.
 *
 * Call `syncGlassBackdrop` from a motion `onUpdate` while a bubble animates on `y` or `scale`.
 * Between syncs the slice drifts, because the offset was measured at the previous position. Keep
 * entrance moves small when nothing is calling sync mid-animation. A `translate` lines up again on
 * the next sync; a `scale` does not, because the slice's `left` / `top` are in the bubble's local
 * pixels and the scale changes how those pixels map to the screen.
 *
 * `getBoundingClientRect` on the bubbles actually on screen (a few dozen) is cheap. If a profiler
 * disagrees, derive the offset from the virtualizer's `start` minus the scroll offset instead of
 * reading layout.
 *
 * A `[data-glass-scene]` element is a local wallpaper instead of the viewport. The sync writes that
 * box into `--gox` / `--goy` / `--gvw` / `--gvh`, which the slice subtracts from the viewport offset.
 * Leave the attribute off for a page backdrop: the slice stays `100vw` × `100vh` from the origin.
 * The scene box has to be a stacking context (`position` + `z-index`) or the slice, which is
 * `z-index: -1`, can paint behind the scene's own background.
 */

const SELECTOR = ".glass-prebaked";
const SCENE = "[data-glass-scene]";

/** Diffuse floor in px (`--blur-xl`). `APP_BG_FROST_FILTER` is this blur plus the glass saturate. */
export const APP_BG_FROST_BLUR_PX = 12;

/** Frost for a CSS background that is not already blurred. 12px is the diffuse floor (`--blur-xl`). */
export const APP_BG_FROST_FILTER = `blur(${APP_BG_FROST_BLUR_PX}px) saturate(180%)`;

/** Write `--gx` / `--gy` on every prebaked surface under `root`, and the scene box on each local wallpaper. */
export function syncGlassBackdrop(root: ParentNode) {
  const scenes: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(SCENE)) scenes.push(root);
  root.querySelectorAll<HTMLElement>(SCENE).forEach((el) => scenes.push(el));
  for (const el of scenes) {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--gox", `${r.left}px`);
    el.style.setProperty("--goy", `${r.top}px`);
    el.style.setProperty("--gvw", `${r.width}px`);
    el.style.setProperty("--gvh", `${r.height}px`);
  }

  const nodes: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(SELECTOR)) nodes.push(root);
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => nodes.push(el));
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--gx", `${r.left}px`);
    el.style.setProperty("--gy", `${r.top}px`);
  }
}

/**
 * Keep prebaked slices aligned while `scrollRef` scrolls, the window scrolls, or rows mount.
 * The scroll element has to be mounted before this effect runs (`useRef` on an always-rendered node).
 */
export function useGlassBackdrop(scrollRef: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let raf = 0;
    const sync = () => {
      raf = 0;
      syncGlassBackdrop(root);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    root.addEventListener("scroll", queue, { passive: true });
    // Scroll events do not bubble. Capture on window also sees the page scroll, which moves
    // bubbles whose own container did not scroll, and any nested scroller under the root.
    window.addEventListener("scroll", queue, { capture: true, passive: true });
    window.addEventListener("resize", queue);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", queue);
    viewport?.addEventListener("scroll", queue);
    // childList: virtualized rows. class: the prebaked class arriving on a node that already existed.
    // Not `style` — the sync writes inline style, and watching it would reschedule itself forever.
    const mo = new MutationObserver(queue);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    queue();
    return () => {
      root.removeEventListener("scroll", queue);
      window.removeEventListener("scroll", queue, { capture: true });
      window.removeEventListener("resize", queue);
      viewport?.removeEventListener("resize", queue);
      viewport?.removeEventListener("scroll", queue);
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [scrollRef]);
}

/**
 * Publish the fixed background prebaked slices sample. `filter` is `APP_BG_FROST_FILTER` for a live
 * CSS background, and omitted (or null) when `background` is already a blurred image. Pass null for
 * `background` to leave the variables alone. Cleanup removes only the values this effect set.
 */
export function usePublishAppBackground(background: string | null, filter?: string | null) {
  React.useEffect(() => {
    if (!background) return;
    const root = document.documentElement;
    root.style.setProperty("--app-bg-blurred", background);
    if (filter) root.style.setProperty("--app-bg-filter", filter);
    else root.style.removeProperty("--app-bg-filter");
    return () => {
      if (root.style.getPropertyValue("--app-bg-blurred") === background) {
        root.style.removeProperty("--app-bg-blurred");
      }
      if (filter && root.style.getPropertyValue("--app-bg-filter") === filter) {
        root.style.removeProperty("--app-bg-filter");
      }
    };
  }, [background, filter]);
}
