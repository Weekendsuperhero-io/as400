"use client";

import { APP_BG_FROST_FILTER, usePublishAppBackground } from "@/hooks/use-glass-backdrop";
import { backdropPalette, useBackdropTint } from "@/lib/canvas-background-utils";
import {
  bandedFrescoStops,
  type GradientGeometry,
  type GradientShape,
  type RampGradientAxis,
  rampGradient,
  readableLightnessBand,
  wrapGradient,
} from "@/lib/oklch-utils";

/**
 * A ramp-driven gradient wallpaper. The gradient is one of our oklch ramps (hue / lightness / tonal
 * / chroma) centered on the live glass-tint color (so it recolors with the theme) with the center as a
 * slightly wider plateau, painted as a `linear`, `radial`, or `conic` gradient. Pure CSS — crisp at any DPI.
 *
 * The highlight veil is a background LAYER on this element, not a child: one background string is the
 * whole backdrop, and prebaked glass (`usePublishAppBackground`) samples that same string. A child
 * overlay would frost the gradient and leave the highlights out of every bubble's slice.
 */
const BACKDROP_HIGHLIGHTS =
  "radial-gradient(circle at 20% 25%, oklch(var(--shadow-highlight) / 0.1) 0%, transparent 45%), radial-gradient(circle at 80% 75%, oklch(var(--shadow-ink) / 0.1) 0%, transparent 45%)";

type GradientBackdropOptions = {
  axis?: RampGradientAxis;
  /** Hue override (deg). When set, drives the gradient color instead of the live --glass-tint-h. */
  hue?: number;
  angle?: number;
  shape?: GradientShape;
} & GradientGeometry;

/** The one background string GradientBackground paints. Prebaked slices sample this same stack. */
export function useGradientBackdropStack({
  axis = "tonal",
  hue,
  angle = 90,
  shape = "linear",
  position,
  radialShape,
  radialSize,
}: GradientBackdropOptions = {}) {
  const tint = useBackdropTint();
  // Shared with CanvasBackground: theme-tracking base + fresco palette (the `hue` prop overrides both).
  const { base, frescoColors } = backdropPalette(tint, hue);
  /* The ramps span their FULL range by design — as a wallpaper that put pure black at one edge of the
     viewport and pure white at the other, so a single solved foreground could only be readable at one
     end. Fit the ramp into the band where text over it clears APCA 60 instead. Falls back to the whole
     range if the foreground has not resolved yet (first paint, before AutoForeground runs). */
  const band = tint.fg ? readableLightnessBand(tint.fg, base) : undefined;
  const gradient = frescoColors
    ? wrapGradient(shape, bandedFrescoStops(frescoColors, band, shape), {
        angle,
        position,
        radialShape,
        radialSize,
      })
    : rampGradient(axis, base, 5, {
        angle,
        band,
        gamut: tint.p3 ? "p3" : "srgb",
        shape,
        position,
        radialShape,
        radialSize,
      });

  /* First layer paints on top. Same highlights the old child overlay drew, still plain alpha — no
     mix-blend-mode, which can disable backdrop-filter rendering in Chromium. */
  return `${BACKDROP_HIGHLIGHTS}, ${gradient}`;
}

export function GradientBackground(props: GradientBackdropOptions) {
  const stack = useGradientBackdropStack(props);
  usePublishAppBackground(stack, APP_BG_FROST_FILTER);

  return (
    <div
      className="fixed inset-0 -z-10 glass-backdrop-layer pointer-events-none transition-[background] duration-500"
      style={{
        background: stack,
      }}
    />
  );
}
