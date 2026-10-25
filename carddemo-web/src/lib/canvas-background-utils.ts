/**
 * Canvas Background Utilities
 *
 * Ramp-driven canvas backgrounds. Pick a base color (the live glass tint) and a ramp axis
 * (tonal / lightness ["linear"] / chroma / hue); the colors are generated from the shared
 * oklch-utils ramps — no hard-coded palettes. Three styles, all returned as a unified
 * `step(ctx, t)` so the component can either paint one static frame (t = 0) or drive an
 * animation loop:
 *   - gradient: a linear gradient of the ramp (base centered), rotatable via `angle`, and
 *               scrolled "through" the ramp at `speed`.
 *   - lava:     a deep backdrop derived from the base color, with gooey metaballs colored
 *               from the ramp (renamed from the old "blobs").
 *   - circle:   the base color as a backdrop, with soft translucent circles colored from the
 *               ramp (renamed from the old "circles").
 */

import * as React from "react";
import { fitToBand, formatOklch, type OklchColor, parseOklch, type RampGradientAxis, rampAxisColors } from "./oklch-utils";

export type CanvasStyle = "gradient" | "lava" | "circle";
/** Ramp axis the canvas colors follow. `lightness` is the "linear" ramp. */
export type CanvasRamp = RampGradientAxis;

/**
 * Signature hues for the bespoke multi-hue fresco tints. Backgrounds build a multi-hue ramp/gradient
 * from these (at the canvas's standard L/C) instead of the single `--glass-tint-h`, so a fresco's
 * canvas/gradient matches its glass instead of collapsing to one color.
 */
export const FRESCO_HUES: Record<string, number[]> = {
  sistine: [
    75,
    8,
    255,
    158,
  ],
  muse: [
    222,
    326,
    74,
  ],
  aurora: [
    152,
    196,
    292,
  ],
  gloaming: [
    62,
    350,
    278,
  ],
};

/**
 * The canvas's own hue, used when the theme has no meaningful one of its own.
 *
 * Selenite and moonstone are the HUE-LESS stones: selenite declares chroma 0 outright, moonstone a
 * near-neutral 0.047 cream. Their `--glass-tint-h` is a placeholder (250 and 75), not a colour — which
 * is exactly why the rest of the system anchors their harmony wheel at 0° rather than warping that
 * near-neutral hue. The canvas never got that rule: it hardcodes chroma 0.15 and took the placeholder
 * hue straight, so moonstone painted #da950b — pixel-identical to the amber JEWEL — and selenite
 * painted a saturated blue despite being the grey theme.
 */
const NEUTRAL_CANVAS_HUE = 250;

/** Live theme-tint snapshot for the JS-painted backdrops (GradientBackground + CanvasBackground):
 * accent hue when the accent knob is on (else the tint hue), dark mode, the bespoke fresco preset,
 * and P3 support — kept fresh by ONE MutationObserver on <html> (class + data-glass-tint + style). */
export function useBackdropTint() {
  const [state, setState] = React.useState<{
    hue: number;
    dark: boolean;
    p3: boolean;
    preset: string | undefined;
    fg: string | undefined;
  }>({
    hue: NEUTRAL_CANVAS_HUE,
    dark: true,
    p3: false,
    preset: undefined,
    fg: undefined,
  });
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const cs = getComputedStyle(root);
      const acc = Number.parseFloat(cs.getPropertyValue("--accent-h"));
      /* Two independent signals, because the hue-less stones can arrive by either route: the switcher
         pins --harmony-h to 0 for both (it keys on chroma, plus moonstone by name), while a static
         consumer setting data-glass-tint="moonstone" gets --harmony-h: 0 from the CSS block instead.
         Chroma 0 catches a hand-rolled neutral that has neither. --harmony-h === 0 is unambiguous: no
         preset uses hue 0 (the nearest are rose at 8 and goldstone at 22), so only the deliberate
         hue-less anchor produces it. */
      const tintC = Number.parseFloat(cs.getPropertyValue("--glass-tint-c"));
      const harmonyH = Number.parseFloat(cs.getPropertyValue("--harmony-h"));
      const hueless = tintC === 0 || harmonyH === 0;
      // Honor the accent hue when the accent knob is on — that is an explicit choice and outranks
      // everything. Otherwise the live tint hue, unless the theme has no meaningful hue to give.
      const v = Number.isFinite(acc) ? acc : hueless ? NEUTRAL_CANVAS_HUE : Number.parseFloat(cs.getPropertyValue("--glass-tint-h"));
      const next = {
        hue: Number.isFinite(v) ? v : NEUTRAL_CANVAS_HUE,
        dark: root.classList.contains("dark"),
        p3: window.matchMedia?.("(color-gamut: p3)").matches ?? false,
        preset: root.dataset.glassTint,
        /* The live solved foreground — backdrops band their lightness against it so text stays
           readable wherever it lands. Re-read by the same observer, so it tracks AutoForeground. */
        fg: cs.getPropertyValue("--foreground").trim() || undefined,
      };
      setState((prev) =>
        prev.hue === next.hue && prev.dark === next.dark && prev.p3 === next.p3 && prev.preset === next.preset && prev.fg === next.fg ? prev : next,
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      attributes: true,
      attributeFilter: [
        "class",
        "data-glass-tint",
        "style",
      ],
    });
    return () => observer.disconnect();
  }, []);
  return state;
}

/** The shared backdrop palette: base color (theme-tracking lightness, `hue` prop override) + the
 * fresco multi-hue colors when a bespoke preset is active — gradient and canvas resolve identically. */
export function backdropPalette(
  tint: {
    hue: number;
    dark: boolean;
    preset: string | undefined;
  },
  hue?: number,
) {
  // Center lightness tracks the theme so it doesn't blast bright on dark / wash out on light.
  const l = tint.dark ? 52 : 72;
  const frescoHues = hue == null && tint.preset ? FRESCO_HUES[tint.preset] : undefined;
  return {
    base: {
      l,
      c: 0.15,
      h: hue ?? tint.hue,
    } as OklchColor,
    frescoColors: frescoHues?.map((h) => `oklch(${l}% 0.15 ${h})`),
  };
}

export interface CanvasConfig {
  width?: number;
  height?: number;
  /** Base color (the chosen tint) as an oklch string or components. Default a mid violet. */
  color?: OklchColor | string;
  /** Explicit color stops to use directly, bypassing the ramp — e.g. a fresco's multi-hue palette. */
  colors?: string[];
  /** Which canvas style to render. Default "gradient". */
  style?: CanvasStyle;
  /** Ramp axis the colors follow. Default "tonal". */
  ramp?: CanvasRamp;
  /** Steps PER SIDE (4–12); the ramp yields 2·steps+1 colors. Default 6. */
  steps?: number;
  /** Constrain the ramp's lightness to a readable range — see `readableLightnessBand`. The ramps span
   *  their whole range by design, which as a full-bleed backdrop puts black at one edge and white at
   *  the other; without this the canvas has the same readability problem the CSS gradient had. */
  band?: {
    lMin: number;
    lMax: number;
  };
  /** Linear-gradient angle in degrees (gradient style; 90 = left → right). Default 90. */
  angle?: number;
  /** Animation pace (0 = static, 1 = default). Default 1. */
  speed?: number;
  /** Prefer the Display-P3 chroma cap (when the display supports it). Default false. */
  p3?: boolean;
  /** Seed for deterministic blob/circle placement. */
  seed?: string;
  /** Device pixel ratio the canvas is backed at — scales blur radii. Default 1. */
  dpr?: number;
}

const DEFAULT_COLOR: OklchColor = {
  l: 60,
  c: 0.15,
  h: NEUTRAL_CANVAS_HUE,
};

function resolveColor(color: CanvasConfig["color"]): OklchColor {
  if (!color) return DEFAULT_COLOR;
  if (typeof color === "string") return parseOklch(color) ?? DEFAULT_COLOR;
  return color;
}

/** Steps per side, clamped to [4, 12]. */
function clampSteps(steps: number): number {
  return Math.max(4, Math.min(12, Math.round(steps)));
}

/**
 * Colors for the chosen ramp axis as oklch strings (2·count+1 entries). Chroma is capped to the
 * gamut-displayable max (sRGB, or P3 when `p3`) so it reaches the visible edge, not a flat 0.37.
 */
function rampColors(
  base: OklchColor,
  ramp: CanvasRamp,
  count: number,
  p3: boolean,
  band?: {
    lMin: number;
    lMax: number;
  },
): string[] {
  // Delegates to THE shared axis mapping (oklch-utils), so canvas axes — tonal included — render the
  // same color math as the pure-CSS gradient background, banding included.
  const colors = rampAxisColors(ramp, base, count, p3 ? "p3" : "srgb");
  return (band ? fitToBand(colors, band) : colors).map((c) => formatOklch(c));
}

/** Add (or replace) the alpha on an oklch() string. */
function withAlpha(color: string, alpha: number): string {
  const body = color
    .replace(/^oklch\(/i, "")
    .replace(/\)\s*$/, "")
    .split("/")[0]
    .trim();
  return `oklch(${body} / ${alpha})`;
}

/** Deterministic PRNG from a string seed, so a given seed always lays out the same field. */
function seededRandom(seed: string): () => number {
  let value = 0;
  for (let i = 0; i < seed.length; i++) {
    value = (value << 5) - value + seed.charCodeAt(i);
    value = value & value;
  }
  let seedValue = Math.abs(value) || 1;
  return () => {
    seedValue = (seedValue * 9301 + 49297) % 233280;
    return seedValue / 233280;
  };
}

/** Endpoints of the gradient line across w×h for a CSS-like angle (90° = left → right, 0° = up). */
function gradientLine(angle: number, w: number, h: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return {
    x0: cx - dx * half,
    y0: cy - dy * half,
    x1: cx + dx * half,
    y1: cy + dy * half,
  };
}

function makeGradient(w: number, h: number, angle: number, speed: number, colors: string[]): (ctx: CanvasRenderingContext2D, t: number) => void {
  // Ping-pong the ramp (out, then back) so the sequence is cyclic and the scroll wraps seamlessly:
  // the last color (c1) is adjacent to the first (c0) in the original ramp.
  const cyc =
    colors.length > 2
      ? [
          ...colors,
          ...colors.slice(1, -1).reverse(),
        ]
      : colors;
  const m = cyc.length;
  const line = gradientLine(angle, w, h);
  // Start with the base color (the ramp's middle swatch) centered at the gradient midpoint, then
  // scroll "through" the ramp over time. The ping-pong keeps that scroll seamless.
  const mid = Math.floor(colors.length / 2);
  const phase0 = 0.5 - mid / m;

  return (ctx, t) => {
    const g = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
    const scroll = speed === 0 ? 0 : t * speed * 0.05;
    const phase = (((phase0 + scroll) % 1) + 1) % 1;
    for (let j = 0; j < m; j++) {
      let off = j / m + phase;
      off -= Math.floor(off); // wrap into [0, 1)
      g.addColorStop(off, cyc[j]);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
}

function makeLava(
  w: number,
  h: number,
  dpr: number,
  speed: number,
  base: OklchColor,
  colors: string[],
  random: () => number,
): (ctx: CanvasRenderingContext2D, t: number) => void {
  // The chosen color IS the backdrop, with a gentle vertical darkening for depth.
  const bgTop = formatOklch(base);
  const bgBottom = formatOklch({
    l: Math.max(12, base.l * 0.72),
    c: base.c,
    h: base.h,
  });

  const minDim = Math.min(w, h);
  const blobCount = Math.max(colors.length, 6);
  const blobs = Array.from(
    {
      length: blobCount,
    },
    (_, i) => ({
      baseX: random() * w,
      baseY: random() * h,
      r: (random() * 0.14 + 0.13) * minDim,
      ampX: (random() * 0.05 + 0.03) * w,
      ampY: (random() * 0.16 + 0.12) * h,
      spd: random() * 0.16 + 0.05,
      phase: random() * Math.PI * 2,
      color: colors[i % colors.length],
    }),
  );

  const off = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (off) {
    off.width = w;
    off.height = h;
  }
  const offCtx = off?.getContext("2d", {
    colorSpace: "display-p3",
  });

  return (ctx, t) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, bgTop);
    grad.addColorStop(1, bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (!off || !offCtx) return;
    offCtx.clearRect(0, 0, w, h);
    const tt = t * speed;
    for (const b of blobs) {
      const x = b.baseX + Math.sin(tt * b.spd + b.phase) * b.ampX;
      const y = b.baseY + Math.cos(tt * b.spd * 0.8 + b.phase) * b.ampY;
      const r = b.r * (1 + Math.sin(tt * b.spd * 1.5 + b.phase) * 0.12);
      offCtx.beginPath();
      offCtx.arc(x, y, r, 0, Math.PI * 2);
      offCtx.fillStyle = b.color;
      offCtx.fill();
    }
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.filter = `blur(${(54 * dpr).toFixed(0)}px)`;
    ctx.drawImage(off, 0, 0);
    ctx.restore();
  };
}

function makeCircle(
  w: number,
  h: number,
  speed: number,
  baseCss: string,
  colors: string[],
  random: () => number,
): (ctx: CanvasRenderingContext2D, t: number) => void {
  const minDim = Math.min(w, h);
  const circles = Array.from(
    {
      length: colors.length * 2,
    },
    (_, i) => ({
      x: random() * w,
      y: random() * h,
      r: random() * minDim * 0.3 + 50,
      ampX: (random() * 0.04 + 0.02) * w,
      ampY: (random() * 0.04 + 0.02) * h,
      spd: random() * 0.1 + 0.03,
      phase: random() * Math.PI * 2,
      color: colors[i % colors.length],
      alpha: random() * 0.4 + 0.25,
    }),
  );

  return (ctx, t) => {
    ctx.fillStyle = baseCss;
    ctx.fillRect(0, 0, w, h);
    const tt = t * speed;
    for (const circle of circles) {
      const x = circle.x + Math.sin(tt * circle.spd + circle.phase) * circle.ampX;
      const y = circle.y + Math.cos(tt * circle.spd * 0.9 + circle.phase) * circle.ampY;
      ctx.beginPath();
      ctx.arc(x, y, circle.r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(circle.color, circle.alpha);
      ctx.fill();
    }
  };
}

/**
 * Build a ramp-driven canvas background. Returns `step(ctx, t)`: call once at `t = 0` for a static
 * frame, or per animation frame (t in seconds) to animate. The base color + ramp axis drive every
 * style, so the canvas recolors with the theme just like the CSS gradient background.
 */
export function createCanvas(config: CanvasConfig = {}): {
  step: (ctx: CanvasRenderingContext2D, t: number) => void;
} {
  const width = config.width ?? (typeof window !== "undefined" ? window.innerWidth : 1920);
  const height = config.height ?? (typeof window !== "undefined" ? window.innerHeight : 1080);
  const base = resolveColor(config.color);
  const style = config.style ?? "gradient";
  const ramp = config.ramp ?? "tonal";
  const count = clampSteps(config.steps ?? 6);
  const angle = config.angle ?? 90;
  const speed = config.speed ?? 1;
  const p3 = config.p3 ?? false;
  const dpr = config.dpr ?? 1;
  const random = config.seed ? seededRandom(config.seed) : () => Math.random();

  // Explicit stops (a fresco palette) win; otherwise generate the single-base ramp. Frescoes skip the
  // ramp, so they need the band clamped onto them directly or they ignore it.
  const band = config.band;
  const colors =
    config.colors && config.colors.length > 1
      ? band
        ? config.colors.map((css) => {
            const parsed = parseOklch(css);
            return parsed
              ? formatOklch({
                  ...parsed,
                  l: Math.min(band.lMax, Math.max(band.lMin, parsed.l)),
                })
              : css;
          })
        : config.colors
      : rampColors(base, ramp, count, p3, band);

  switch (style) {
    case "lava":
      return {
        step: makeLava(width, height, dpr, speed, base, colors, random),
      };
    case "circle":
      return {
        step: makeCircle(width, height, speed, formatOklch(base), colors, random),
      };
    default:
      return {
        step: makeGradient(width, height, angle, speed, colors),
      };
  }
}
