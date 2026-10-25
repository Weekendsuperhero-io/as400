/**
 * OKLCH color primitives — parse / format an oklch string and generate symmetric ramps
 * (hue or chroma) around an existing color. Dependency-free; shares the {l, c, h} shape with
 * `GradientColor` in gradient-utils.ts.
 */

export interface OklchColor {
  /** Lightness, 0–100 (%) */
  l: number;
  /** Chroma, 0–~0.37 */
  c: number;
  /** Hue, 0–360 (degrees) */
  h: number;
  /** Optional alpha, 0–1 */
  alpha?: number;
}

/**
 * Practical oklch chroma ceiling. Both sRGB and Display-P3 colors stay below ~0.37 (per Evil
 * Martians; confirmed by sweeping every L×hue with the gamut math below — sRGB max ≈ 0.321,
 * P3 max ≈ 0.363). Used as the binary-search bound and the chroma-ramp default range.
 */
export const MAX_CHROMA = 0.37;

/** Wrap a hue into [0, 360). */
export function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Clamp chroma into [0, MAX_CHROMA]. */
export function clampChroma(c: number): number {
  return Math.max(0, Math.min(MAX_CHROMA, c));
}

/** A bare lightness ≤ 1 is the 0–1 form (×100); otherwise it's already 0–100. */
function normalizeLightness(l: number): number {
  return l <= 1 ? l * 100 : l;
}

/**
 * Parse an `oklch()` string into components. Handles both lightness conventions used in this
 * repo — `oklch(72% 0.05 255)` and `oklch(0.72 0.05 255)` — plus an optional `/ alpha`.
 * Returns null if the string isn't a parseable oklch().
 */
export function parseOklch(input: string): OklchColor | null {
  const match = /^\s*oklch\(([^)]+)\)\s*$/i.exec(input);
  if (!match) return null;

  const [coords, alphaPart] = match[1].split("/");
  const parts = coords.trim().split(/\s+/);
  if (parts.length < 3) return null;

  const lRaw = parts[0];
  const l = lRaw.endsWith("%") ? Number.parseFloat(lRaw) : normalizeLightness(Number.parseFloat(lRaw));
  const c = Number.parseFloat(parts[1]);
  const h = Number.parseFloat(parts[2]);
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) return null;

  const color: OklchColor = {
    l,
    c,
    h,
  };
  if (alphaPart !== undefined) {
    const a = Number.parseFloat(alphaPart.trim());
    if (Number.isFinite(a)) color.alpha = a;
  }
  return color;
}

/** Format components back into an `oklch()` string (lightness as %). */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const a = alpha ?? color.alpha;
  const base = `${color.l.toFixed(1)}% ${color.c.toFixed(3)} ${color.h.toFixed(1)}`;
  return a === undefined ? `oklch(${base})` : `oklch(${base} / ${a})`;
}

/** Coerce a base argument (string | OklchColor) into components; throws on an unparseable string. */
function toColor(base: OklchColor | string): OklchColor {
  if (typeof base !== "string") return base;
  const parsed = parseOklch(base);
  if (!parsed) throw new Error(`oklch-utils: could not parse "${base}"`);
  return parsed;
}

/** Per-side step count, clamped to a sane [3, 12] (rounded). */
function clampCount(count: number): number {
  return Math.max(3, Math.min(12, Math.round(count)));
}

/**
 * A full-range value ramp: `count` steps each side of `seed`, reaching `min` on the left and
 * `max` on the right, with the seed held at the center index. Step sizes differ per side (the
 * seed is rarely the midpoint), so the whole [min, max] range is always covered — more steps
 * just sample it finer. Returns `2 * count + 1` values, min → seed → max.
 */
function rangeRamp(seed: number, min: number, max: number, count: number): number[] {
  const leftStep = (seed - min) / count;
  const rightStep = (max - seed) / count;
  const out: number[] = [];
  for (let i = count; i >= 1; i--) out.push(seed - leftStep * i);
  out.push(seed);
  for (let i = 1; i <= count; i++) out.push(seed + rightStep * i);
  return out;
}

/**
 * Hue ramp covering the FULL wheel: `count` steps each side, the seed centered, hues spread evenly
 * around the wheel (step = 360 / (2·count + 1)) and wrapped into [0, 360). Lightness + chroma are
 * held; `count` clamped to [3, 12]. Unlike chroma/lightness, hue is cyclic — 0° ≡ 360° — so the ramp
 * is distributed cyclically instead of running to both endpoints, which keeps the two edge swatches
 * distinct. e.g. seed 120, count 4 → 320, 0, 40, 80, 120, 160, 200, 240, 280.
 */
export function hueRampColors(base: OklchColor | string, count: number): OklchColor[] {
  const color = toColor(base);
  const n = clampCount(count);
  const seed = wrapHue(color.h);
  const step = 360 / (2 * n + 1);
  const out: OklchColor[] = [];
  for (let k = -n; k <= n; k++) {
    out.push({
      ...color,
      h: wrapHue(seed + k * step),
    });
  }
  return out;
}

/** Full-wheel hue ramp as CSS oklch strings (the seed sits at the center index). */
export function hueRamp(base: OklchColor | string, count: number): string[] {
  return hueRampColors(base, count).map((color) => formatOklch(color));
}

// ── Hue harmonies ─────────────────────────────────────────────────────────────
// Rotate the base hue to derive complementary / harmonious colors (lightness + chroma held). oklch
// hue is perceptually even, so a 180° "complement" is a balanced opposite — not the skewed HSL/RGB one.

/** The perceptual complement: same L + C, hue rotated 180° (alpha preserved), gamut-clamped — the
 * 180° case of {@link harmony}. */
export function complement(base: OklchColor | string, gamut: "srgb" | "p3" = "srgb"): OklchColor {
  return harmony(
    base,
    [
      180,
    ],
    gamut,
  )[1];
}

/**
 * Hue-harmony set: the base plus a color at each rotation `angle` in degrees (same L + C),
 * gamut-clamped. Returns `[base, …rotations]`. Common sets — analogous `[-30, 30]`, triadic
 * `[120, 240]`, split-complement `[150, 210]`, tetradic `[90, 180, 270]`.
 */
export function harmony(base: OklchColor | string, angles: number[], gamut: "srgb" | "p3" = "srgb"): OklchColor[] {
  const c = toColor(base);
  return [
    clampToGamut(c, gamut),
    ...angles.map((a) =>
      clampToGamut(
        {
          ...c,
          h: wrapHue(c.h + a),
        },
        gamut,
      ),
    ),
  ];
}

/** Named color-wheel relationships — the JS mirror of the --hue-* tokens in app/globals.css. */
export type HarmonicName =
  | "base"
  | "complement"
  | "analogous-1"
  | "analogous-2"
  | "split-1"
  | "split-2"
  | "triad-1"
  | "triad-2"
  | "tetrad-1"
  | "tetrad-2"
  | "tetrad-3"
  | "square-1"
  | "square-2"
  | "square-3";

/**
 * Hue offsets (degrees) for each color-wheel relationship. MUST stay in lockstep with the `--hue-*`
 * tokens in app/globals.css (`calc(var(--harmony-h) + N)`) so a JS-solved icon/foreground hue lands on
 * the SAME angle as the CSS harmonic swatches. Pair with `harmonicHue()` + `readableForeground()` to get
 * a contrast-solved (APCA/ARC) color at the harmonic angle.
 */
export const HARMONIC_OFFSETS: Record<HarmonicName, number> = {
  base: 0,
  complement: 180,
  "analogous-1": -30,
  "analogous-2": 30,
  "split-1": 150,
  "split-2": 210,
  "triad-1": 120,
  "triad-2": 240,
  "tetrad-1": 60,
  "tetrad-2": 180,
  "tetrad-3": 240,
  "square-1": 90,
  "square-2": 180,
  "square-3": 270,
};

/** All harmonic relationship names, in wheel order (for building pickers). */
export const HARMONIC_NAMES = Object.keys(HARMONIC_OFFSETS) as HarmonicName[];

/**
 * Rotate an anchor hue by a named color-wheel relationship, wrapped to [0, 360). The anchor is normally
 * the harmony hue (--harmony-h: the content hue, or 0 for the hue-less selenite/moonstone themes). Feed the
 * result to `readableForeground({ hue })` to keep the contrast solve while landing on the harmonic angle.
 */
export function harmonicHue(anchorH: number, name: HarmonicName): number {
  return wrapHue(anchorH + HARMONIC_OFFSETS[name]);
}

/**
 * Chroma ramp covering [0, cap]: `count` steps each side, the seed centered (left → 0, right →
 * cap). Lightness + hue are held; `count` clamped to [3, 12]. `max` defaults to the largest chroma
 * actually DISPLAYABLE for this L+hue in sRGB (≈0.32, varies by L/hue) — so the ramp reaches the
 * visible edge instead of a flat MAX_CHROMA that just clamps on screen. Pass `maxP3Chroma(l, h)` on
 * P3-capable displays for a punchier top end, or any explicit number to sweep a custom range.
 */
export function chromaRampColors(base: OklchColor | string, count: number, max?: number): OklchColor[] {
  const color = toColor(base);
  const cap = max ?? maxSrgbChroma(color.l, color.h);
  const seed = Math.max(0, Math.min(cap, color.c));
  return rangeRamp(seed, 0, cap, clampCount(count)).map((c) => ({
    ...color,
    c,
  }));
}

/** Chroma ramp as CSS oklch strings (the seed sits at the center index). */
export function chromaRamp(base: OklchColor | string, count: number, max?: number): string[] {
  return chromaRampColors(base, count, max).map((color) => formatOklch(color));
}

/**
 * Lightness ramp covering the FULL range [0, 100]: `count` steps each side, the seed centered
 * (left → 0, right → 100). Chroma + hue are held; `count` clamped to [3, 12].
 */
export function lightnessRampColors(base: OklchColor | string, count: number): OklchColor[] {
  const color = toColor(base);
  return rangeRamp(color.l, 0, 100, clampCount(count)).map((l) => ({
    ...color,
    l,
  }));
}

/** Full-range lightness ramp as CSS oklch strings (the seed sits at the center index). */
export function lightnessRamp(base: OklchColor | string, count: number): string[] {
  return lightnessRampColors(base, count).map((color) => formatOklch(color));
}

// ── Gamut-aware tonal scale ───────────────────────────────────────────────────
// A tonal scale (the Radix/Tailwind 1→N pattern) is NOT a chroma shift: lightness eases
// light→dark while chroma rises with the scale but is capped by the sRGB gamut — so chroma is
// near-zero in the light tints, peaks in the mid-dark "brand" steps, then tapers in the darkest
// steps (because dark colors can't physically hold as much chroma). The gamut cap is what
// produces that peak-then-fall curve; a flat chroma shift cannot.

/** OKLCH (l 0–100) → linear sRGB channels (values outside [0,1] mean out of gamut). */
function oklchToLinearSrgb(
  l: number,
  c: number,
  hDeg: number,
): [
  number,
  number,
  number,
] {
  const L = l / 100;
  const hr = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const ll = l_ * l_ * l_;
  const mm = m_ * m_ * m_;
  const ss = s_ * s_ * s_;
  return [
    4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss,
  ];
}

/** Whether an oklch color (l 0–100) sits inside the sRGB gamut. */
export function inSrgbGamut(l: number, c: number, h: number): boolean {
  const [r, g, b] = oklchToLinearSrgb(l, c, h);
  const eps = 1e-4;
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

/** OKLCH (l 0–100) → linear Display-P3 channels (values outside [0,1] mean out of gamut). */
function oklchToLinearP3(
  l: number,
  c: number,
  h: number,
): [
  number,
  number,
  number,
] {
  // linear sRGB → linear Display-P3 (same color, wider basis) — valid even for out-of-sRGB values.
  const [sr, sg, sb] = oklchToLinearSrgb(l, c, h);
  return [
    0.8224621 * sr + 0.177538 * sg,
    0.0331942 * sr + 0.9668058 * sg,
    0.0170608 * sr + 0.072374 * sg + 0.9105652 * sb,
  ];
}

/** Whether an oklch color (l 0–100) sits inside the Display-P3 gamut. */
export function inP3Gamut(l: number, c: number, h: number): boolean {
  const [r, g, b] = oklchToLinearP3(l, c, h);
  const eps = 1e-4;
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

/** Largest in-gamut chroma for (l, h) under the given gamut test, via binary search. */
function maxChromaFor(l: number, h: number, test: (l: number, c: number, h: number) => boolean): number {
  let lo = 0;
  let hi = MAX_CHROMA;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (test(l, mid, h)) lo = mid;
    else hi = mid;
  }
  // Sit 3% inside the boundary. A color exactly at the gamut edge renders fine in Chrome (CSS Color 4
  // hue-preserving gamut mapping) but Safari per-channel-clamps it toward GREY — so edge-chroma
  // foregrounds/icons went grey in Safari while staying tinted in Chrome. This margin keeps every emitted
  // color clearly in-gamut, so both engines show the same tint.
  return lo * 0.97;
}

/** Largest chroma keeping (l, h) inside the sRGB gamut. */
export function maxSrgbChroma(l: number, h: number): number {
  return maxChromaFor(l, h, inSrgbGamut);
}

/** Largest chroma keeping (l, h) inside the Display-P3 gamut. */
export function maxP3Chroma(l: number, h: number): number {
  return maxChromaFor(l, h, inP3Gamut);
}

/** Reduce a color's chroma until it fits the given gamut (lightness + hue preserved). */
export function clampToGamut(color: OklchColor, gamut: "srgb" | "p3" = "srgb"): OklchColor {
  const max = gamut === "p3" ? maxP3Chroma(color.l, color.h) : maxSrgbChroma(color.l, color.h);
  return {
    ...color,
    c: Math.min(color.c, max),
  };
}

export interface TonalScaleOptions {
  /** Fixed hue, 0–360. */
  hue: number;
  /** Number of steps. Default 12. */
  steps?: number;
  /** Lightness (0–1) at the lightest step. Default 0.98. */
  lightest?: number;
  /** Lightness (0–1) at the darkest step. Default 0.35. */
  darkest?: number;
  /** Peak chroma intent — the scale builds toward this (gamut permitting). Default 0.2. */
  chroma?: number;
  /** Easing exponent for the lightness descent (>1 stays light longer). Default 2.2. */
  lightEase?: number;
  /** Easing exponent for the chroma rise (>1 stays subtle longer). Default 1.1. */
  chromaRise?: number;
  /** Fraction of the in-gamut chroma ceiling to use, for headroom. Default 0.94. */
  gamutFraction?: number;
  /** Cap chroma to a gamut envelope (gives the natural peak + dark falloff). `"p3"` allows a
   *  punchier peak on wide-gamut displays; `false` disables clamping. Default `"srgb"`. */
  gamut?: "srgb" | "p3" | false;
}

/**
 * Generate a tonal color scale — a single hue with lightness eased light→dark and chroma that
 * rises with the scale but is capped by the chosen gamut (sRGB by default; pass `gamut: "p3"` for a
 * punchier wide-gamut peak). Returns lightest → darkest as OklchColor[].
 * `tonalScaleColors({ hue: 252 })` gives a Radix/Tailwind-shaped 12-step blue scale.
 */
export function tonalScaleColors(options: TonalScaleOptions): OklchColor[] {
  const {
    hue,
    steps = 12,
    lightest = 0.98,
    darkest = 0.35,
    chroma = 0.2,
    lightEase = 2.2,
    chromaRise = 1.1,
    gamutFraction = 0.94,
    gamut = "srgb",
  } = options;

  const ceiling = gamut === "p3" ? maxP3Chroma : maxSrgbChroma;
  const n = Math.max(2, Math.round(steps));
  const out: OklchColor[] = [];
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const l = (lightest - (lightest - darkest) * p ** lightEase) * 100;
    let c = chroma * p ** chromaRise;
    if (gamut) c = Math.min(c, ceiling(l, hue) * gamutFraction);
    out.push({
      l,
      c: clampChroma(c),
      h: hue,
    });
  }
  return out;
}

/** Which ramp drives a {@link rampGradient}. */
export type RampGradientAxis = "hue" | "lightness" | "tonal" | "chroma";

/** Gradient painting shape — same color-stop list, different geometry. */
export type GradientShape = "linear" | "radial" | "conic";

/** Geometry knobs for {@link wrapGradient}: `angle` (linear direction / conic `from` rotation), `position`
 *  (radial + conic center, e.g. `"50% 50%"`, `"top left"`), and the radial `shape` / `size`. All optional;
 *  the defaults reproduce a centered circle / 90° linear (so omitting them is a no-op). */
export interface GradientGeometry {
  angle?: number;
  position?: string;
  radialShape?: "circle" | "ellipse";
  radialSize?: "closest-side" | "closest-corner" | "farthest-side" | "farthest-corner";
}

/** Wrap a `<color-stop-list>` in the chosen gradient function (all interpolate `in oklch`). Linear uses the
 *  angle as its direction; conic as the `from` rotation about `position`; radial paints a `shape`+`size`
 *  centered at `position` (angle unused). */
export function wrapGradient(shape: GradientShape, stops: string, geom: GradientGeometry = {}): string {
  const { angle = 90, position = "50% 50%", radialShape = "circle", radialSize = "farthest-corner" } = geom;
  switch (shape) {
    case "radial":
      return `radial-gradient(${radialShape} ${radialSize} at ${position} in oklch, ${stops})`;
    case "conic":
      return `conic-gradient(from ${angle}deg at ${position} in oklch, ${stops})`;
    default:
      return `linear-gradient(${angle}deg in oklch, ${stops})`;
  }
}

/**
 * Build a CSS `linear-gradient` from one of the ramps, the seed centered as a slightly wider plateau
 * so the theme color anchors the middle; the rest sit in equal-width bands left → right. `count`
 * steps each side (clamped [3,8]). Interpolated `in oklch` for a perceptual blend.
 * e.g. rampGradient("tonal", { l: 62, c: 0.15, h: 250 }, 5).
 */
/**
 * THE one axis → colors mapping every backdrop shares (CSS gradient background, canvas background,
 * docs demos), seed-centered with `count` steps per side. Single-sourced so an axis can't mean
 * different math in different engines: `tonal` is the seed's own lightness ramp, gamut-clamped
 * (theme-true — the pure-CSS gradient's original definition), NOT the fixed-chroma tonal scale.
 */
export function rampAxisColors(axis: RampGradientAxis, seed: OklchColor, count: number, gamut: "srgb" | "p3" = "srgb"): OklchColor[] {
  switch (axis) {
    case "hue":
      return hueRampColors(seed, count);
    case "lightness":
      return lightnessRampColors(seed, count);
    case "chroma":
      return chromaRampColors(seed, count, gamut === "p3" ? maxP3Chroma(seed.l, seed.h) : maxSrgbChroma(seed.l, seed.h));
    default:
      return lightnessRampColors(seed, count).map((color) => clampToGamut(color, gamut));
  }
}

/**
 * The lightness range a full-bleed BACKDROP may use while text over it stays readable.
 *
 * The ramps below deliberately cover their whole range — that is what makes them useful as swatches.
 * As a wallpaper it is the opposite of what you want: a lightness ramp runs L 0 → 100, so a single
 * solved foreground is legible at one end of the viewport and invisible at the other. This returns
 * the sub-range on the far side of `fg` where |Lc| stays at or above `targetLc`, measured with the
 * same APCA implementation the rest of the theme uses.
 *
 * Default target is 60 — APCA's non-body level. Body copy sits on veiled glass ABOVE the backdrop and
 * clears 75 comfortably from there; 60 is for the headings that sit directly on it. Asking 75 of the
 * raw backdrop would squeeze light mode into L 87–100 and leave nothing to make a gradient out of.
 *
 * |Lc| is monotonic in backdrop lightness on either side of a foreground, so this binary-searches the
 * boundary rather than sweeping.
 */
export function readableLightnessBand(
  fg: OklchColor | string,
  seed: OklchColor,
  targetLc = 60,
  headroom = 7,
): {
  lMin: number;
  lMax: number;
} {
  const text = toColor(fg);
  const passes = (l: number) =>
    Math.abs(
      apcaContrast(text, {
        ...seed,
        l,
      }),
    ) >= targetLc;
  /* A dark foreground pushes the backdrop light, and vice versa. */
  const backdropGoesLight = text.l < 50;
  let lo = backdropGoesLight ? 0 : 100;
  let hi = backdropGoesLight ? 100 : 0;
  if (!passes(hi)) {
    /* Nothing on this side clears the target (a mid-lightness foreground). Give back the whole
       range rather than an empty one — banding is a readability aid, not a hard gate. */
    return {
      lMin: 0,
      lMax: 100,
    };
  }
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (passes(mid)) hi = mid;
    else lo = mid;
  }
  /* Stop `headroom` short of the absolute extreme. That end is the HIGH-contrast one, so backing off
     it costs no readability — but L 0 and L 100 are the two lightnesses that hold no chroma at all, so
     running to them washes the tint out of one edge of the wallpaper. Never let it cross the boundary. */
  const edge = Math.ceil(hi);
  return backdropGoesLight
    ? {
        lMin: edge,
        lMax: Math.max(edge + 1, 100 - headroom),
      }
    : {
        lMin: Math.min(Math.floor(hi) - 1, headroom),
        lMax: Math.floor(hi),
      };
}

/** Remap a ramp's lightnesses into `band`, preserving the ramp's shape. A ramp whose lightness is
 *  constant (the hue and chroma axes) is clamped into the band instead of stretched across it.
 *  Exported so the canvas backdrop bands the same ramps the CSS gradient does. */
export function fitToBand(
  colors: OklchColor[],
  band: {
    lMin: number;
    lMax: number;
  },
): OklchColor[] {
  const ls = colors.map((c) => c.l);
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);
  const span = hi - lo;
  if (span < 0.001) {
    const l = Math.min(band.lMax, Math.max(band.lMin, lo));
    return colors.map((c) => ({
      ...c,
      l,
    }));
  }
  return colors.map((c) => ({
    ...c,
    l: band.lMin + ((c.l - lo) / span) * (band.lMax - band.lMin),
  }));
}

/* Frescoes are authored as fixed multi-hue stops at one lightness, so they skip the ramp entirely —
   which also means they skip its banding and its conic loop-close. Apply both here. */
export function bandedFrescoStops(
  colors: string[],
  band:
    | {
        lMin: number;
        lMax: number;
      }
    | undefined,
  shape: GradientShape,
): string {
  let out = colors;
  if (band) {
    out = out.map((css) => {
      const parsed = parseOklch(css);
      if (!parsed) return css;
      return formatOklch({
        ...parsed,
        l: Math.min(band.lMax, Math.max(band.lMin, parsed.l)),
      });
    });
  }
  if (shape === "conic" && out.length > 1) {
    const loop = [
      ...out,
      out[0],
    ];
    return loop.map((css, i) => `${css} ${((i / (loop.length - 1)) * 100).toFixed(1)}%`).join(", ");
  }
  return out.join(", ");
}

export function rampGradient(
  axis: RampGradientAxis,
  seed: OklchColor,
  count: number,
  options: {
    gamut?: "srgb" | "p3";
    shape?: GradientShape;
    /** Constrain the ramp's lightness to a readable range — see {@link readableLightnessBand}. */
    band?: {
      lMin: number;
      lMax: number;
    };
  } & GradientGeometry = {},
): string {
  const { gamut = "srgb", shape = "linear", band, angle, position, radialShape, radialSize } = options;
  const ramped = rampAxisColors(axis, seed, count, gamut);
  const colors = band ? fitToBand(ramped, band) : ramped;

  /* A conic gradient wraps: whatever sits at 360° butts straight into 0°. An open ramp therefore
     meets its own opposite end at the twelve-o'clock line and draws a hard seam right through the
     wallpaper — at full range that is white against black. Close the loop instead, and drop the
     center plateau, which reads as a lopsided wedge once the ramp is bent into a circle.
       hue   — already cyclic, so repeating the first color at 360° spaces evenly and joins invisibly.
       other — mirror out and back, giving a symmetric sweep that also ends where it started. */
  if (shape === "conic") {
    const loop =
      axis === "hue"
        ? [
            ...colors,
            colors[0],
          ]
        : [
            ...colors,
            ...colors.slice(0, -1).reverse(),
          ];
    const stops = loop.map((color, i) => `${formatOklch(color)} ${((i / (loop.length - 1)) * 100).toFixed(1)}%`);
    return wrapGradient(shape, stops.join(", "), {
      angle,
      position,
      radialShape,
      radialSize,
    });
  }

  const mid = Math.floor(colors.length / 2);
  const plateau = 7; // half-width (%) of the centered theme-color band
  const leftEnd = 50 - plateau;
  const rightStart = 50 + plateau;
  const parts = colors.map((color, i) => {
    const css = formatOklch(color);
    if (i === mid) return `${css} ${leftEnd}%, ${css} ${rightStart}%`;
    const pos = i < mid ? (i / mid) * leftEnd : rightStart + ((i - mid) / mid) * (100 - rightStart);
    return `${css} ${pos.toFixed(1)}%`;
  });
  return wrapGradient(shape, parts.join(", "), {
    angle,
    position,
    radialShape,
    radialSize,
  });
}

// ── APCA contrast (APCA-W3 / ARC) ─────────────────────────────────────────────
// Inlined port of the APCA-W3 reference (© Andrew Somers / Myndex Research, licensed to the W3/AGWG).
// The APCA constants below are the LOCKED beta set (0.1.x) and are used UNMODIFIED. APCA/ARC measures
// readability contrast — it is NOT a means to claim WCAG 2 conformance. Verified to match apca-w3's
// APCAcontrast() — see scripts/apca-oracle.mjs. Lc is signed: positive = dark text on a light
// background, negative = light text on a dark one; |Lc| is the perceptual level (~45 large/UI, ~60
// other content, ~75 body, ~90 fine). Polarity-aware — which WCAG-2's ratio is not — so it fits dark
// mode + tinted glass far better.

/** OKLCH (l 0–100) → gamma-encoded sRGB channels in [0, 1] (out-of-gamut values are clipped). */
export function oklchToSrgb(
  l: number,
  c: number,
  h: number,
): [
  number,
  number,
  number,
] {
  const [lr, lg, lb] = oklchToLinearSrgb(l, c, h);
  const encode = (v: number) => {
    const x = Math.max(0, Math.min(1, v));
    return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return [
    encode(lr),
    encode(lg),
    encode(lb),
  ];
}

/** Gamma-encoded sRGB channels in [0, 1] → OKLCH (l 0–100). Exact inverse of {@link oklchToSrgb} for
 *  in-gamut input, so a composite→decompose round trip is lossless. */
export function srgbToOklch([r, g, b]: [
  number,
  number,
  number,
]): OklchColor {
  const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [
    decode(r),
    decode(g),
    decode(b),
  ];
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return {
    l: L * 100,
    c: Math.hypot(a, bb),
    h: wrapHue((Math.atan2(bb, a) * 180) / Math.PI),
  };
}

/**
 * Composite a stack of translucent OKLCH layers THE WAY THE BROWSER DOES — CSS source-over on
 * gamma-encoded sRGB channels — and report the result in OKLCH.
 *
 * The obvious shortcut is to lerp the OKLCH coordinates instead (`l1·(1−a) + l2·a`, same for chroma).
 * That is a different operation and it is measurably wrong: OKLCH lightness is a cube-root-ish
 * perceptual scale, sRGB is a ~2.2 gamma, and chroma is a POLAR coordinate, so lerping it mixes two
 * hues along a straight line through the chroma plane rather than around it. Measured against the
 * shipped presets, the shortcut overstated light-mode body contrast by up to 2.8 Lc on the veiled
 * surface — enough to hide four presets sitting under the ARC body floor — while on the crystal
 * surface the error CHANGES SIGN by preset (+0.95 carnelian, −2.66 aventurine). That sign flip is why
 * this is a compositing fix and not a fudge factor: no single correction term can be both.
 *
 * `layers` paint bottom-first; `base` is fully opaque. Each layer's alpha is its own (a layer at
 * alpha 1 simply replaces what is under it). Hue is carried through from the top-most layer that
 * actually contributed chroma, so a neutral stack keeps its nominal hue instead of collapsing to 0.
 */
export function compositeSurface(
  base: OklchColor,
  layers: Array<
    OklchColor & {
      a: number;
    }
  >,
): OklchColor {
  let px = oklchToSrgb(base.l, base.c, base.h);
  let hue = base.h;
  for (const layer of layers) {
    const a = Math.min(Math.max(layer.a, 0), 1);
    if (a <= 0) continue;
    const src = oklchToSrgb(layer.l, layer.c, layer.h);
    px = [
      src[0] * a + px[0] * (1 - a),
      src[1] * a + px[1] * (1 - a),
      src[2] * a + px[2] * (1 - a),
    ];
    if (layer.c > 0) hue = layer.h;
  }
  const out = srgbToOklch(px);
  // Below this the hue angle is numerical noise off a near-neutral pixel — keep the stack's nominal
  // hue so callers that tint from the surface (readableForeground, the ramp base) stay on the theme.
  return out.c < 1e-4
    ? {
        ...out,
        h: hue,
      }
    : out;
}

/** APCA screen luminance (Ys) from gamma-encoded sRGB. */
function apcaLuminance([r, g, b]: [
  number,
  number,
  number,
]): number {
  return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
}

/**
 * The colour stops of a fresco gradient (`linear-gradient(135deg in oklch, oklch(85% 0.1 222 / 0.32) 0%, …)`)
 * as compositable layers. Reads the computed value of `--glass-crystal-fresco`, which the four fresco presets
 * point at their multi-hue sheet and every other preset leaves unset (empty string → no stops).
 */
export function parseGradientStops(gradient: string): Array<
  OklchColor & {
    a: number;
  }
> {
  const out: Array<
    OklchColor & {
      a: number;
    }
  > = [];
  for (const m of gradient.matchAll(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)/g)) {
    out.push({
      l: m[2] ? Number(m[1]) : Number(m[1]) * 100,
      c: Number(m[3]),
      h: Number(m[4]),
      a: m[5] === undefined ? 1 : m[6] ? Number(m[5]) / 100 : Number(m[5]),
    });
  }
  return out;
}

/**
 * The hardest place on a surface to read text, once a fresco's multi-hue gradient is painted over it.
 *
 * A fresco sheet is bold (stops at L78–89, chroma up to 0.2, alpha 0.2–0.46), and nothing modelled it:
 * every material banded its text against the plain surface, so text sized for the average dipped to
 * 66–74 Lc where a gradient stop pulled the surface toward it. A linear gradient's extremes are its
 * stops, so the worst point is the surface with one stop composited over it. Which stop is worst depends
 * on the text's polarity, so that is decided first, by which of black or white reaches further on the
 * plain surface. Returns the plain surface when there are no stops.
 */
export function limitingSurface(
  surface: OklchColor,
  stops: Array<
    OklchColor & {
      a: number;
    }
  >,
): OklchColor {
  if (stops.length === 0) return surface;
  const black = {
    l: 0,
    c: 0,
    h: 0,
  };
  const white = {
    l: 100,
    c: 0,
    h: 0,
  };
  const ink = Math.abs(apcaContrast(black, surface)) >= Math.abs(apcaContrast(white, surface)) ? black : white;
  let worst = surface;
  let worstLc = Math.abs(apcaContrast(ink, surface));
  for (const stop of stops) {
    const lit = compositeSurface(surface, [
      stop,
    ]);
    const lc = Math.abs(apcaContrast(ink, lit));
    if (lc < worstLc) {
      worst = lit;
      worstLc = lc;
    }
  }
  return worst;
}

/**
 * APCA lightness contrast (Lc) between a text color and a background color. Signed: positive = dark
 * text on a light bg, negative = light text on a dark bg; use |Lc| for the level (~60 headings,
 * ~75 body text). A dependency-free port of APCA-W3 0.1.9.
 */
export function apcaContrast(text: OklchColor | string, bg: OklchColor | string): number {
  const t = toColor(text);
  const b = toColor(bg);
  let txtY = apcaLuminance(oklchToSrgb(t.l, t.c, t.h));
  let bgY = apcaLuminance(oklchToSrgb(b.l, b.c, b.h));
  const blkThrs = 0.022;
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: APCA blkClmp tuning constant, not √2
  const blkClmp = 1.414;
  txtY = txtY > blkThrs ? txtY : txtY + (blkThrs - txtY) ** blkClmp;
  bgY = bgY > blkThrs ? bgY : bgY + (blkThrs - bgY) ** blkClmp;
  if (Math.abs(bgY - txtY) < 0.0005) return 0;
  let lc: number;
  if (bgY > txtY) {
    const sapc = (bgY ** 0.56 - txtY ** 0.57) * 1.14;
    lc = sapc < 0.1 ? 0 : sapc - 0.027;
  } else {
    const sapc = (bgY ** 0.65 - txtY ** 0.62) * 1.14;
    lc = sapc > -0.1 ? 0 : sapc + 0.027;
  }
  return lc * 100;
}

const FG_LIGHT: OklchColor = {
  l: 100,
  c: 0,
  h: 0,
};
const FG_DARK: OklchColor = {
  l: 15,
  c: 0,
  h: 0,
};

/**
 * Pick whichever foreground has the higher APCA contrast on `bg` — by default near-white vs the
 * near-black `--foreground`. The light, perceptual way to choose a readable text/icon color: cheap
 * enough to run on a theme/tint change (microseconds), no per-frame work, no canvas readback.
 */
export function pickForeground(bg: OklchColor | string, light: OklchColor = FG_LIGHT, dark: OklchColor = FG_DARK): OklchColor {
  return Math.abs(apcaContrast(light, bg)) >= Math.abs(apcaContrast(dark, bg)) ? light : dark;
}

/**
 * From `ramp`, prefer colors whose |APCA Lc| on `surface` falls within [floor, ceiling] and sit closest
 * to `target` — so the floor is honored as a MINIMUM (never undershot) and the ceiling caps the spike.
 * Draws a readable foreground from a real palette (a tonal / lightness ramp) instead of a neutral gray,
 * so text keeps the theme's color while hitting its band. If nothing lands in band (ramp too coarse or
 * the surface can't support it), returns the color nearest the band edge.
 */
export function pickInBand(
  ramp: OklchColor[],
  surface: OklchColor | string,
  band: {
    floor: number;
    target: number;
    ceiling: number;
  },
): OklchColor {
  const scored = ramp.map((c) => ({
    c,
    lc: Math.abs(apcaContrast(c, surface)),
  }));
  const inBand = scored.filter((s) => s.lc >= band.floor && s.lc <= band.ceiling);
  const pool = inBand.length ? inBand : scored;
  const err = (lc: number) => (inBand.length ? Math.abs(lc - band.target) : Math.min(Math.abs(lc - band.floor), Math.abs(lc - band.ceiling)));
  return pool.reduce((best, s) => (err(s.lc) < err(best.lc) ? s : best), pool[0]).c;
}

/**
 * The effective glass surface color for the active theme + tint — the theme's light/dark floor
 * blended with the tint wash, mirroring the glass-* utilities (the wash sits at a FIXED lightness,
 * 72 light / 58 dark; only hue, chroma and alpha vary). Pair with pickForeground to choose readable
 * text on a tinted glass surface without reading pixels back.
 */
export function glassSurface(
  dark: boolean,
  tint: {
    h: number;
    c: number;
    a: number;
  },
): OklchColor {
  const baseL = dark ? 20 : 95;
  const washL = dark ? 58 : 72;
  return compositeSurface(
    {
      l: baseL,
      c: 0,
      h: tint.h,
    },
    [
      {
        l: washL,
        c: tint.c * 2.5,
        h: tint.h,
        a: tint.a,
      },
    ],
  );
}

/**
 * The effective glass-SOLID surface color — the legible floor body text actually sits on (never sheer
 * glass). The solid floor (neutral `--glass-solid-l`, 99 light / 18 dark) is composited over the base
 * at `solidA` (the `--glass-solid-a` opacity, ~0.3–0.75), then the tint wash on top. Because that floor
 * is a KNOWN surface, banding text against this — rather than the sheer estimate — gives a real Lc.
 */
export function glassSolidSurface(
  dark: boolean,
  tint: {
    h: number;
    c: number;
    a: number;
  },
  solidA: number,
  // Wash knobs — pass the LIVE --glass-wash-l / --glass-wash-c-mult when a theme overrides them
  // (moonstone night: 72 / 2), else the defaults mirror the CSS mode values exactly.
  washL: number = dark ? 58 : 72,
  washCMult = 2.5,
  // The SOLIDIFY floor — `glass` paints --glass-solidify (--glass-opaque-bg at --glass-opacity, default
  // 0.7) as its bottom background-IMAGE layer, i.e. above the background-color modeled by solidA and
  // below the wash. Omitting it models a surface far sheerer than what ships: on most themes the opaque
  // floor sits the same side of mid-grey as the page, so the error is a few Lc, but where the two
  // OPPOSE — moonstone night pairs a cream L84.9 floor with an L20 page — the model lands 27 L on the
  // wrong side and picks text of the wrong polarity entirely. Pass { l, c, a } to include it.
  solidify?: {
    l: number;
    c: number;
    a: number;
  },
): OklchColor {
  const baseL = dark ? 20 : 95;
  const solidL = dark ? 18 : 99;
  // The real paint order, composited in the real space — see compositeSurface for why lerping the
  // OKLCH coordinates instead is not the same operation.
  return compositeSurface(
    {
      l: baseL,
      c: 0,
      h: tint.h,
    },
    [
      {
        l: solidL,
        c: 0,
        h: tint.h,
        a: solidA,
      },
      ...(solidify
        ? [
            {
              l: solidify.l,
              c: solidify.c,
              h: tint.h,
              a: solidify.a,
            },
          ]
        : []),
      {
        l: washL,
        c: tint.c * washCMult,
        h: tint.h,
        a: tint.a,
      },
    ],
  );
}

/** Options for {@link themeForeground}. */
export interface ThemeForegroundOptions {
  /** Which of the ramp generator's axes the text levels follow. */
  palette: "tonal" | "lightness" | "hue" | "chroma";
  /** Text level: 0 = the first swatch; each +1 is one step along the ramp. */
  level: number;
  /** Total steps (the ramp generator's count). */
  count: number;
  /** The chosen color the ramp is built from (the ramp generator's base). */
  base: {
    l: number;
    c: number;
    h: number;
  };
  /** Dark theme? Picks which lightness extreme the tonal/lightness ramps start from. */
  dark: boolean;
  gamut?: "srgb" | "p3";
}

/**
 * Walk one of the ramp generator's ramps — built from the chosen `base` color — mapping ramp steps
 * to text levels. The ramp is **base-centered with `count` steps EITHER SIDE** (so it matches the
 * ramp generator's "steps each side"): level 0 = the readable extreme, level `count` = the base
 * (center), level `2·count` = the opposite extreme — `2·count + 1` levels total. The readable half
 * (levels 0..count) is unchanged, so the live --foreground / --muted-foreground cascade (which only
 * reads that half) is unaffected. `palette` picks the axis:
 *  - tonal / lightness: level 0 is the readable lightness extreme (white in dark mode, black in
 *    light), easing to the base's lightness at `count`, then on to the opposite extreme;
 *  - hue: constant L + C — level 0 is base + count steps, ramping through the base and on the
 *    other way (e.g. base `oklch(60% 0.15 255)`, count 8 → level 0 `oklch(60% 0.15 64.4)`);
 *  - chroma: constant L + hue, chroma 0 → base → the gamut-displayable max.
 * Gamut-clamped.
 */
export function themeForeground(options: ThemeForegroundOptions): OklchColor {
  const { palette, level, count, base, dark, gamut = "srgb" } = options;
  // Piecewise around the centered base: readable extreme (level 0) → base (level count) → other.
  const span = (readable: number, mid: number, other: number) => {
    if (count <= 0) return mid;
    if (level <= count) return readable + (mid - readable) * (level / count);
    return mid + (other - mid) * Math.min(1, (level - count) / count);
  };
  const readableL = dark ? 100 : 0;
  const otherL = dark ? 0 : 100;
  const chromaCap = gamut === "p3" ? maxP3Chroma(base.l, base.h) : maxSrgbChroma(base.l, base.h);
  let color: OklchColor;
  switch (palette) {
    case "hue":
      color = {
        l: base.l,
        c: base.c,
        h: wrapHue(base.h + (count - level) * (360 / (2 * count + 1))),
      };
      break;
    case "chroma":
      color = {
        l: base.l,
        c: span(0, base.c, chromaCap),
        h: base.h,
      };
      break;
    case "lightness":
      color = {
        l: span(readableL, base.l, otherL),
        c: base.c,
        h: base.h,
      };
      break;
    default:
      color = {
        l: span(readableL, base.l, otherL),
        c: span(0, base.c, chromaCap),
        h: base.h,
      };
  }
  return clampToGamut(color, gamut);
}

// ── Readable foreground (soft contrast / ARC Bronze Simple Mode) ──────────────
// pickForeground() maximizes contrast — it slams to the lightness extreme (pure white / near-black),
// which reads as a glare/heaviness "spike". readableForeground() instead AIMS for a target APCA Lc
// and stops: legible, but soft. The usage presets follow the ARC "Bronze Simple Mode" criterion
// (readtech.org/ARC) — content-text thresholds, no font-lookup table: body Lc 75 (preferred 90),
// other content Lc 60, large-fluent (>36px) Lc 45 with a MAX of Lc 90 to "prevent excessive contrast"
// (so the ceiling is straight from the spec). floor = legible minimum, target = aim, ceiling = the cap.
// `ui` / `non-text` / `disabled` are OUR extension — Bronze scopes to content text, excluding spot text.

/** APCA-derived contrast bands per use case. floor = legible minimum, target = aim, ceiling = cap. */
export const READABLE_USAGE = {
  /** Fine / thin / small text — needs the most contrast; little soft room. */
  small: {
    floor: 90,
    target: 90,
    ceiling: 100,
  },
  /** Body text (~16px / 400) — ARC Bronze body: min 75, preferred 90. */
  body: {
    floor: 75,
    target: 80,
    ceiling: 90,
  },
  /** Large or fluent body (~18–24px) / semibold. */
  "body-large": {
    floor: 60,
    target: 72,
    ceiling: 88,
  },
  /** Headings / other content text — ARC Bronze "other content": min 60. */
  heading: {
    floor: 60,
    target: 66,
    ceiling: 82,
  },
  /** Large fluent text >36px (or ≥24px bold) — ARC Bronze: min 45, max 90. */
  large: {
    floor: 45,
    target: 58,
    ceiling: 76,
  },
  /** UI labels, icons, focus rings — beyond ARC Bronze scope (Bronze is content-text only). Target at the
   * APCA "other content" level (60); ceiling 70 stays below body's 75 floor, so icons read quieter than text. */
  ui: {
    floor: 45,
    target: 60,
    ceiling: 70,
  },
  /** Non-text: borders, dividers, graphics — beyond ARC Bronze scope. */
  "non-text": {
    floor: 30,
    target: 40,
    ceiling: 58,
  },
  /** Disabled / placeholder — beyond ARC Bronze scope (spot text). */
  disabled: {
    floor: 30,
    target: 33,
    ceiling: 46,
  },
} as const;

export type ReadableUsage = keyof typeof READABLE_USAGE;

/** Options for {@link readableForeground}. */
export interface ReadableForegroundOptions {
  /** Use-case preset that sets the {floor, target, ceiling} band (default "body"). */
  usage?: ReadableUsage;
  /** Aim for this |APCA Lc| — overrides the usage preset's target. */
  target?: number;
  /** Never exceed this |Lc| — the anti-spike cap; overrides the usage preset. */
  ceiling?: number;
  /** Legibility minimum; if even the extreme can't reach it you get max contrast (add a scrim). */
  floor?: number;
  /** Hue to keep for tinted-but-readable text. Defaults to the background's hue. */
  hue?: number;
  /** Chroma to keep, gamut-clamped at the chosen lightness. 0 = neutral gray. */
  chroma?: number;
  /** Opt-in chroma floor (capped at `chroma`). When the band pins the pick to the lightness EXTREME
   * (target/floor beyond the surface's reach), the gamut annihilates the requested chroma there and
   * tinted text reads pure black/white; this backs the aim off to the most contrast available at a
   * lightness that still HOLDS this much chroma — never below an ACHIEVABLE band floor. Reachable
   * bands are unaffected. 0 (default) = off. */
  minChroma?: number;
  gamut?: "srgb" | "p3";
}

/**
 * A foreground that AIMS for a target APCA contrast on `bg` instead of maximizing it — legible
 * without the harsh pure-black / pure-white spike. Picks the lightness direction with headroom and
 * binary-searches the NEAREST lightness whose |Lc| meets the target (capped at the ceiling); keeps an
 * optional hue/chroma for tinted-but-readable text. The soft-contrast companion to {@link pickForeground}.
 * If even the lightness extreme can't reach the floor (a mid-gray background), it returns the maximum
 * contrast available — the signal that the text needs a scrim / solid backing.
 */
export function readableForeground(bg: OklchColor | string, opts: ReadableForegroundOptions = {}): OklchColor {
  const band = READABLE_USAGE[opts.usage ?? "body"];
  const target = opts.target ?? band.target;
  const ceiling = opts.ceiling ?? band.ceiling;
  const floor = opts.floor ?? band.floor;
  const { chroma = 0, minChroma = 0, gamut = "srgb" } = opts;

  const b = toColor(bg);
  const h = opts.hue ?? b.h;
  const cAt = (l: number) => Math.min(chroma, gamut === "p3" ? maxP3Chroma(l, h) : maxSrgbChroma(l, h));
  const lcAt = (l: number) =>
    Math.abs(
      apcaContrast(
        {
          l,
          c: cAt(l),
          h,
        },
        b,
      ),
    );

  const extreme = lcAt(0) >= lcAt(100) ? 0 : 100; // the lightness direction with headroom
  const reach = lcAt(extreme); // the most contrast this background can give
  // Aim for the target, never past the ceiling; if we can't even clear the floor, take the max.
  let want = reach < floor ? reach : Math.min(target, ceiling, reach);

  // Chroma preservation (opt-in, minChroma > 0): want === reach means the band sits beyond what this
  // surface can give, so the search below would pin to the lightness EXTREME — where the gamut
  // annihilates the requested chroma and tinted text reads pure black/white (moonstone-dark cream: reach
  // ≈ 68 < body floor 75 → L≈0 → a chosen accent renders BLACK). Trade the few unreachable Lc points
  // for color: aim instead at the most contrast available at a lightness that still HOLDS the kept
  // chroma — never below the band floor when the floor is achievable. In-reach bands never get here.
  const keep = Math.min(minChroma, chroma);
  if (keep > 0 && want >= reach) {
    // Strict in-gamut test at the kept chroma (÷0.97 so the margined cAt still returns ≥ keep). The
    // shared eps-tolerant gamut test reports PHANTOM chroma at L≈0 — cubed near-zero channels sit
    // inside its 1e-4 tolerance (up to ~0.11 at red/pink hues) — which would converge this search
    // right back to the extreme; eps 1e-6 rejects it.
    const holdsKeep = (l: number) => {
      const [r, g, b3] = gamut === "p3" ? oklchToLinearP3(l, keep / 0.97, h) : oklchToLinearSrgb(l, keep / 0.97, h);
      const eps = 1e-6;
      return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b3 >= -eps && b3 <= 1 + eps;
    };
    // Max chroma is ~unimodal in lightness and 0 at both extremes: holdsKeep is false at the extreme
    // and (guarded) true at bg.l, so bisect for the holding lightness NEAREST the extreme.
    if (holdsKeep(b.l)) {
      let kLo = extreme;
      let kHi = b.l;
      for (let i = 0; i < 24; i++) {
        const mid = (kLo + kHi) / 2;
        if (holdsKeep(mid)) kHi = mid;
        else kLo = mid;
      }
      want = Math.min(want, Math.max(lcAt(kHi), reach >= floor ? floor : 0));
    }
  }

  // |Lc| rises monotonically from bg.l → the extreme, so binary-search the nearest L meeting `want`.
  let lo = b.l;
  let hi = extreme;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (lcAt(mid) < want) lo = mid;
    else hi = mid;
  }
  return clampToGamut(
    {
      l: hi,
      c: cAt(hi),
      h,
    },
    gamut,
  );
}

// ── Foreground solve ─────────────────────────────────────────────────────────
// The model AutoForeground applies to every surface, lifted out of the component so the /colors tester
// and scripts/check-contrast.mjs run the SAME solve instead of each re-deriving it. Every one of them
// had drifted from the others, and none of the drifts was visible without measuring the emitted token:
// the tester modelled no solidify floor (3.3 L off), skipped the tonal clip (so it marked the ramp's
// pure-WHITE end point as the `fine` pick, a colour the component never emits), skipped the
// show-through margin, seeded the ramp from --glass-tint-h rather than the composited surface hue, and
// picked from the whole 2·count+1 ramp where the component only ever considers the readable half; the
// guard measured readableForeground where the page ships a discrete ramp pick, which hid four presets
// emitting #000000. Duplication was the root cause in all of them, so it is the thing being removed.

/** A tier's contrast band: floor = legible minimum, target = aim, ceiling = anti-spike cap. */
export interface ContrastBand {
  floor: number;
  target: number;
  ceiling: number;
}

/** Lightness below which an sRGB colour renders as black whatever chroma is asked for — the ramp's dark
 *  end is clipped here on tinted themes so a reach-limited tier keeps its hue instead of collapsing to
 *  #000. 18 sits just above L15 (#130900 at the warm hue, still reading black at text size). */
export const TONAL_MIN_L = 18;
/** The same clip at the WHITE end, where L100 is exactly achromatic. Deliberately much tighter than its
 *  dark twin: near black a whole 18 points of lightness read as one colour and cost ~1.5 Lc to give up,
 *  while near white a single 3-point step is worth 6–8 Lc. */
export const TONAL_MAX_L = 97;
/** How far under the body floor a tonal pick may sit and still be kept over an extreme that does not
 *  clear the floor either. 72 Lc and 74.8 Lc are not a difference a reader can use in body text; ink-blue
 *  versus #000002 is one they see. */
export const TONAL_HUE_SLACK_LC = 3;
/** Uncertainty margin at a fully-sheer floor, decaying to 0 as the floor becomes exactly modelable. */
export const LC_MARGIN = 12;
/** Baseline aim for a floor that IS modelled exactly, so certainty is not a reason to aim at the bare
 *  minimum. Only the opaque set earns it; every other surface earns its margin from uncertainty. */
export const LC_AIM_KNOWN = 4;

/** The backdrop's SURVIVING weight through a stack of alphas — every layer painted above attenuates it.
 *  This is what the uncertainty margin scales: the more backdrop shows, the less the model can be
 *  trusted. Pass each layer's alpha; order is irrelevant. */
export function showThrough(...alphas: number[]): number {
  return Math.min(
    Math.max(
      alphas.reduce((acc, a) => acc * (1 - Math.min(Math.max(a, 0), 1)), 1),
      0,
    ),
    1,
  );
}

/** Lift a band's TARGET by the uncertainty boost + the baseline aim. Floors and ceilings never move —
 *  the margin aims higher, it never legalizes a harsher pick than the band allowed. */
export function boostBand(band: ContrastBand, lcBoost = 0, lcAim = 0): ContrastBand {
  return {
    ...band,
    target: Math.min(band.target + lcBoost + lcAim, band.ceiling),
  };
}

export interface ForegroundRampOptions {
  palette: ThemeForegroundOptions["palette"];
  count: number;
  base: OklchColor;
  dark: boolean;
  /** Levels to build. Defaults to the READABLE half (count + 1) — the only part a foreground is ever
   *  drawn from. The full 2·count+1 ramp exists for display; picking from it would offer steps on the
   *  far side of the base that the surface can never make legible. */
  levels?: number;
}

/** The ramp a foreground is picked from: the full build, plus the tonally-clipped subset. */
export interface ForegroundRamp {
  raw: OklchColor[];
  tonal: OklchColor[];
}

/**
 * Build the foreground ramp and its tonal clip.
 *
 * Both achromatic ends are dropped on TINTED themes: sRGB has almost no gamut volume there, so those
 * steps are pure black / pure white wearing a theme colour's name (at L0 any requested chroma renders
 * #000000; at L100, #ffffff). pickInBand reaches them whenever a band's target sits above every step —
 * it then picks for maximum contrast, which IS the extreme. NEUTRAL themes (base chroma 0) keep the
 * full ramp, since there black and white are the genuine ends of a grey scale rather than colours that
 * lost their hue.
 */
export function foregroundRamp(o: ForegroundRampOptions): ForegroundRamp {
  const levels = o.levels ?? o.count + 1;
  const raw = Array.from(
    {
      length: levels,
    },
    (_, level) =>
      themeForeground({
        palette: o.palette,
        level,
        count: o.count,
        base: o.base,
        dark: o.dark,
      }),
  );
  if (o.base.c <= 0)
    return {
      raw,
      tonal: raw,
    };
  const tonal = raw.filter((c) => c.l >= TONAL_MIN_L && c.l <= TONAL_MAX_L);
  return {
    raw,
    tonal: tonal.length ? tonal : raw,
  };
}

/**
 * Pick from the TONAL ramp, but never at the cost of the band's floor.
 *
 * The clip drops the steps that render black or white; if a band is so demanding that only those could
 * satisfy its FLOOR, legibility outranks hue and the full ramp comes back. Guard the FLOOR, not each
 * band's aspiration: the `small` band asks Lc 90, which no light surface reaches at all, so testing
 * against band.floor there would hand the extreme straight back on every light preset.
 *
 * The trade is bounded from the other side too. When the tonal pick is within {@link TONAL_HUE_SLACK_LC}
 * of the floor and the extreme does NOT clear it either, the extreme is only "less unreadable" by under
 * that much, and the hue stays: that was body text solving to #000002 on a dark-wash preset (lapis) over
 * a darker backing, where black bought 1.8 Lc and still missed the floor. A fallback that DOES clear the
 * floor always wins, so nothing that was readable becomes less so. And a tonal pick far under the floor
 * (the mid-tone dead zone, ~43 Lc) still hands back the extreme: there the guard's job is only to take
 * whatever contrast is left.
 */
export function pickTonalInBand(ramp: ForegroundRamp, surface: OklchColor | string, band: ContrastBand): OklchColor {
  const best = pickInBand(ramp.tonal, surface, band);
  if (ramp.tonal === ramp.raw) return best;
  const lc = (c: OklchColor) => Math.abs(apcaContrast(c, surface));
  if (lc(best) >= READABLE_USAGE.body.floor) return best;
  const full = pickInBand(ramp.raw, surface, band);
  if (lc(best) >= READABLE_USAGE.body.floor - TONAL_HUE_SLACK_LC && lc(full) < READABLE_USAGE.body.floor) return best;
  return lc(full) > lc(best) ? full : best;
}

/**
 * The ADAPTIVE twin of {@link pickTonalInBand}, for surfaces the ramp cannot serve (they may need a
 * polarity it does not span — a LIGHT opaque card on a dark page needs DARK text).
 *
 * readableForeground aims at the band target and, when the target sits beyond what the surface can
 * give, returns the most contrast AVAILABLE — which is the lightness extreme, exactly where the gamut
 * annihilates the requested chroma. In light mode that is the default rather than an edge case: an L88
 * opaque floor tops out around 81–84 Lc while the opaque tiers aim at target + LC_AIM_KNOWN, so every
 * jewel's `--foreground-opaque` solved to pure black. Clipping to the same bounds costs 0.7–1.3 Lc and
 * returns a genuinely tinted ink.
 *
 * `minChroma` is NOT a substitute despite documenting this case: its search bisects toward the
 * BACKGROUND lightness, and a near-white floor cannot hold the kept chroma at any hue on the
 * dark-peaking arc, so it bails back to the extreme. It stays on for the accent path it was built for.
 */
export function readableTonal(
  surface: OklchColor,
  band: ContrastBand,
  opts: {
    hue: number;
    chroma: number;
    minChroma?: number;
    gamut?: "srgb" | "p3";
  },
): OklchColor {
  const solved = readableForeground(surface, {
    floor: band.floor,
    target: band.target,
    ceiling: band.ceiling,
    hue: opts.hue,
    chroma: opts.chroma,
    minChroma: opts.minChroma ?? 0,
    gamut: opts.gamut,
  });
  // Neutral keeps the full range — black and white are the genuine ends of a grey scale there.
  if (opts.chroma <= 0) return solved;
  const l = Math.min(Math.max(solved.l, TONAL_MIN_L), TONAL_MAX_L);
  if (l === solved.l) return solved;
  const clipped = clampToGamut(
    {
      l,
      c: opts.chroma,
      h: opts.hue,
    },
    opts.gamut,
  );
  // Guard legibility, never the aspiration — the same line pickTonalInBand holds.
  return Math.abs(apcaContrast(clipped, surface)) >= READABLE_USAGE.body.floor ? clipped : solved;
}
