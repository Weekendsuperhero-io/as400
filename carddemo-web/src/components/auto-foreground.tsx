"use client";

import * as React from "react";
import {
  showThrough as backdropShowThrough,
  boostBand,
  type ContrastBand,
  compositeSurface,
  foregroundRamp,
  formatOklch,
  glassSolidSurface,
  HARMONIC_OFFSETS,
  type HarmonicName,
  harmonicHue,
  LC_AIM_KNOWN,
  LC_MARGIN,
  limitingSurface,
  parseGradientStops,
  pickTonalInBand,
  READABLE_USAGE,
  readableTonal,
  type ThemeForegroundOptions,
} from "@/lib/oklch-utils";

/** localStorage key holding the persisted {@link FgConfig}. Exported so an app that reads or seeds the
 * config (a settings screen, a pre-hydration script) never retypes the string. */
export const FG_STORAGE_KEY = "sistine-fg";
/** localStorage key holding the persisted {@link RampConfig}. */
export const RAMP_KEY = "sistine-ramp";
/** Window event AutoForeground listens for to re-band: dispatch it after changing the tint, the mode or
 * the stored config (`window.dispatchEvent(new Event(FG_EVENT))`). */
export const FG_EVENT = "sistine-fg";

// Dev instrumentation: set localStorage["sistine-fg-debug"] = "1" (then reload) to log each update()'s
// wall-time and how far it nudges --foreground off the CSS baseline (the "marginal bump"). Off by default.
const fgDebug = () => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("sistine-fg-debug") === "1";
  } catch {
    return false;
  }
};

export type FgPalette = ThemeForegroundOptions["palette"];
export interface FgConfig {
  palette: FgPalette;
  /** Icon foreground hue for `--foreground-ui`: a number (0–360) pins a hue; a harmonic name
   * ("complement" | "triad-1" | "split-2" | … — a color-wheel relationship rotated off --harmony-h,
   * tracked live); null → icons follow the theme/text color. Always contrast-solved (APCA/ARC). */
  iconHue: number | HarmonicName | null;
  /** Heading/large-text hue for `--foreground-soft` — same semantics as iconHue (number pins, a harmonic
   * name rotates off the theme live, null → follow the chosen palette ramp). */
  softHue: number | HarmonicName | null;
  /** Fine/small-text hue for `--foreground-strong` — same semantics (null → follow the palette ramp). */
  strongHue: number | HarmonicName | null;
}
/** The /colors ramp generator's base color + step count, shared with the foreground. */
export interface RampConfig {
  l: number;
  c: number;
  h: number;
  count: number;
}

const FG_PALETTES: FgPalette[] = [
  "tonal",
  "lightness",
  "hue",
  "chroma",
];
const DEFAULT_FG: FgConfig = {
  palette: "lightness", // linear ramp — holds the theme's chroma, so high-contrast text reads as a soft tinted white, not gray
  iconHue: null,
  softHue: null,
  strongHue: null,
};
/* The tonal clip bounds, the margins and the pick/solve themselves now live in lib/oklch-utils — see
   the "Foreground solve" section there. They were duplicated into components/foreground-tester.tsx and
   scripts/check-contrast.mjs, and every copy had drifted from this one in a way no test could see. */
const DEFAULT_RAMP: RampConfig = {
  l: 60,
  c: 0.15,
  h: 255,
  count: 12, // finest ramp (12 steps/side) — the most cohesive foreground set in practice
};

/** Normalize a stored hue choice: a harmonic relationship name, a pinned number, else null. */
const hueChoice = (v: unknown): number | HarmonicName | null =>
  typeof v === "string" && v in HARMONIC_OFFSETS ? (v as HarmonicName) : typeof v === "number" ? v : null;

/** Read the persisted foreground palette; falls back to the default (Linear). */
export function readFgConfig(): FgConfig {
  try {
    const raw = localStorage.getItem(FG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FgConfig>;
      if (FG_PALETTES.includes(parsed.palette as FgPalette)) {
        return {
          palette: parsed.palette as FgPalette,
          iconHue: hueChoice(parsed.iconHue),
          softHue: hueChoice(parsed.softHue),
          strongHue: hueChoice(parsed.strongHue),
        };
      }
    }
  } catch {
    // ignore parse / storage failures
  }
  return DEFAULT_FG;
}

/** Persist the foreground config + notify AutoForeground to re-apply it site-wide. */
export function writeFgConfig(config: Partial<FgConfig>): void {
  try {
    localStorage.setItem(
      FG_STORAGE_KEY,
      JSON.stringify({
        ...readFgConfig(),
        ...config,
      }),
    );
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event(FG_EVENT));
}

/** Read the ramp generator's base color + count (shared from the /colors ramp card). */
export function readRampConfig(): RampConfig {
  try {
    const raw = localStorage.getItem(RAMP_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<RampConfig>;
      if (
        [
          p.l,
          p.c,
          p.h,
          p.count,
        ].every((n) => typeof n === "number")
      ) {
        return {
          l: p.l as number,
          c: p.c as number,
          h: p.h as number,
          count: p.count as number,
        };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_RAMP;
}

/** Persist the ramp base color + count + notify AutoForeground (called by the ramp generator). */
export function writeRampConfig(config: RampConfig): void {
  try {
    localStorage.setItem(RAMP_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(FG_EVENT));
}

export interface AutoForegroundProps {
  /** Foreground ramp palette. Overrides the persisted config when set. */
  palette?: FgPalette;
  /** Ramp base color + step count. Overrides the persisted ramp when set. */
  ramp?: RampConfig;
}

/**
 * Sets the foreground tokens on <html> by drawing COLORS from the chosen OKLCH ramp (palette + base
 * color + step count): `--foreground`, `--muted-foreground`, and the ARC-Bronze size tiers
 * `--foreground-soft` (large) / `--foreground-strong` (fine), plus the icon foreground `--foreground-ui`
 * (ui band, optional hue). Each is picked from that ramp to hit its contrast target on the glass-SOLID
 * surface text sits on — so foregrounds are real theme colors, not neutral gray, and track light/dark +
 * tint automatically. globals.css carries static fallbacks (no flash); the tiers are exposed as the
 * `text-foreground-soft` / `-strong` / `-ui` utilities.
 *
 * Configure declaratively — `<AutoForeground palette="tonal" ramp={{ l, c, h, count }} />` — or, with no
 * props, it reads a persisted config (`writeRampConfig`, e.g. the /colors generator) and re-applies on the
 * `sistine-fg` event. Mount it once at the app root. The foreground level is contrast-target-driven
 * (the ARC-Bronze band per tier), not a manual ramp index.
 */
export function AutoForeground({ palette: paletteProp, ramp: rampProp }: AutoForegroundProps = {}) {
  const rl = rampProp?.l;
  const rc = rampProp?.c;
  const rh = rampProp?.h;
  const rcount = rampProp?.count;

  React.useEffect(() => {
    const root = document.documentElement;

    const update = (inputs?: Record<string, number>) => {
      const dbg = fgDebug();
      const t0 = dbg ? performance.now() : 0;
      const dark = root.classList.contains("dark");
      const storedFg = readFgConfig();
      const storedRamp = readRampConfig();
      const palette = paletteProp ?? storedFg.palette;
      const count = rcount ?? storedRamp.count;
      // A snapshot from the switcher (the drag hot path) lets us skip getComputedStyle — the read-after-write
      // forced reflow measured at 7–22ms. Fall back to the DOM for mount / mode toggle / frescoes (no snapshot).
      const cs = inputs ? null : getComputedStyle(root);
      const fgBefore = dbg ? (cs ? cs.getPropertyValue("--foreground").trim() : root.style.getPropertyValue("--foreground").trim()) : "";
      const num = (name: string, fb: number) => {
        const v = inputs ? inputs[name] : cs ? Number.parseFloat(cs.getPropertyValue(name)) : Number.NaN;
        return v == null || Number.isNaN(v) ? fb : v;
      };
      /* A fresco's multi-hue sheet, if one is active (--glass-crystal-fresco is unset on every other preset).
         Every material paints it over its surface, so every tier set bands against the hardest stop of it
         (see applyTiers). Frescoes always take the DOM path, so the snapshot never has to carry it. */
      const frescoStops = cs ? parseGradientStops(cs.getPropertyValue("--glass-crystal-fresco")) : [];
      // Foregrounds FOLLOW THE CHOSEN FOREGROUND HUE: the ramp's hue is --glass-fg-h (which defaults to
      // the glass tint --glass-tint-h, but frescoes set it apart so text anchors off their surface).
      // Lightness + chroma (vividness) and step count come from the /colors ramp config. Picks are
      // measured on the glass-SOLID surface body text sits on — a known surface, so a real Lc.
      const tintH = num("--glass-fg-h", num("--glass-tint-h", rh ?? storedRamp.h));
      const tintA = num("--glass-tint-a", 0);
      // Colorfulness gate — CHROMA is the single master now that Wash is retired: tint-c > 0 → colored
      // foregrounds (at the ramp's vividness) + hue-tracking harmonics; chroma 0 → achromatic. (tintA still
      // feeds the glass-solid SURFACE color below, but no longer decides "is this theme colored?".)
      const tintC = num("--glass-tint-c", 0);
      // Harmony anchor — the wheel origin the icon/foreground harmonics rotate from. Mirrors the CSS
      // --harmony-h (content hue, or 0 for the hue-less selenite/moonstone themes set inline by the tint switcher);
      // falls back to the content hue when unset (jewels), so JS harmonics land on the SAME angle as the
      // --hue-* swatches. harmonicHue(fgHarmonyH, name) below matches calc(var(--harmony-h) + N) exactly.
      const harmonyH = num("--harmony-h", tintH);
      const cfgC = rc ?? storedRamp.c;
      // User accent: on the hue-LESS themes only (selenite + moonstone anchor --harmony-h at 0), a chosen accent
      // colors ALL text tiers — its hue + vividness drive the ramp base, so foregrounds tint toward the accent
      // instead of gray (selenite) / warm-moonstone. Frescoes (--harmony-h != 0) are untouched. Band-picking below
      // still hits each tier's ARC-Bronze APCA target, so accent-tinted text stays legible.
      const accentH = num("--accent-h", Number.NaN);
      const accentC = num("--accent-c", 0.15);
      // Uncertainty-aware contrast margin. The normal tiers are banded against the veiled floor MODEL,
      // whose only unknown is the backdrop showing through — and the backdrop's weight in that mix is
      // exactly (1 − solidA)·(1 − tintA) (see glassSolidSurface). The more the backdrop shows, the less
      // the model can be trusted, so each band's TARGET gets a safety margin of up to +LC_MARGIN
      // (≈ one ARC band step) at fully-sheer, decaying to +0 at a fully-known floor (solidA 1 — e.g. the
      // opaque page style sets --glass-solid-a: 1). Ceilings still cap the pick (anti-harshness).
      // (LC_MARGIN / LC_AIM_KNOWN are exported from lib/oklch-utils so every consumer aims the same.)
      // Parity aim for a FULLY-KNOWN floor. LC_MARGIN above is an UNCERTAINTY margin — it decays to 0 as the
      // floor becomes exactly modelable, which is right on its own terms but leaves the one surface we model
      // exactly (opaque) aiming at the BARE band target while every other surface aims 3.6–5.7 Lc above it.
      // Measured at the shipped defaults that made opaque the lowest-contrast surface in the system for every
      // tint in BOTH modes (body 80.0 vs 82.0–87.3, muted 72.0 vs 73.0–79.3) — the "soft / out-of-focus"
      // opaque card. Certainty about the floor is no reason to aim at the minimum, so a known floor gets this
      // baseline aim instead. Sized to the MIDDLE of the other surfaces' effective margins so opaque lands
      // LEVEL with them; the full LC_MARGIN here would pin body+muted to the band ceiling and just invert the
      // asymmetry (opaque becomes the harshest surface). Ceilings still cap the pick.
      const solidA = num("--glass-solid-a", 0.65);
      // Wash knobs — moonstone is the ONE preset that overrides them at night (--glass-wash-l: 72%,
      // --glass-wash-c-mult: 2 — its pale-cream character), which the hardcoded model missed and
      // every moonstone-night surface banded ~3 L too dark (bright page, faint text). num() reads the
      // truth on the computed path; snapshots can't carry these, so the FALLBACK is moonstone-aware via
      // the data-glass-tint attribute (cheap, race-free on both paths). Every other theme resolves
      // to the standard mode values either way — this is a moonstone-only correction by construction.
      // check-theme [moonstone-sync] keeps these mirrored constants equal to presets.css.
      const moonstone = root.dataset.glassTint === "moonstone";
      const washL = num("--glass-wash-l", moonstone && dark ? 64 : dark ? 58 : 72);
      const washCMult = num("--glass-wash-c-mult", moonstone && dark ? 2 : 2.5);
      // THE SOLIDIFY FLOOR — `glass` paints --glass-solidify (the --glass-opacity dial, default 0.7) as the
      // bottom background-image layer of EVERY sheer material, so it is 70% of what text actually sits on.
      // The models below used to skip it entirely and band against the sheer floor alone. On most themes the
      // opaque floor sits the same side of mid-grey as the page, so that cost a few Lc (utilities.css measured
      // body 91.5 → 86.5). Moonstone NIGHT is the case that breaks it: a cream L84.9 opaque floor under an L20
      // page, i.e. the two OPPOSE, so the crystal model landed 27.5 L too dark, called for near-white text, and
      // reported Lc 87.1 for a surface that actually delivers 52.2 — below the body floor of 75, silently.
      // Reading it here fixes every sheer surface at once, and the fallbacks mirror tokens.css.
      const glassOpacity = Math.min(Math.max(num("--glass-opacity", 0.7), 0), 1);
      /* The CAP is not cosmetic: engine.css paints this floor as
         `min(--glass-tint-c * --glass-opaque-c-scale, --glass-opaque-c-max)`, because a jewel's tint chroma
         scaled up would leave the sRGB gamut at the opaque floor's lightness and WebKit clips out-of-gamut
         oklch() per channel rather than reducing chroma — which trades lightness away and drifts hue. The
         cap is what each preset's own ceiling is FOR. Modelling the floor uncapped bands text against a
         surface more colourful (and so slightly darker) than the one actually painted; scripts/
         check-contrast.mjs already clamps here, so an uncapped model here also silently disagrees with the
         guard that signs the presets off. Keep the three in step. */
      const opaqueCMax = num("--glass-opaque-c-max", dark ? 0.12 : 0.055);
      /* --glass-solidify-*, NOT --glass-opaque-*: the backing under sheer glass is its own surface (see
         tokens.css). It is the one high-weight term in the composite that is not part of a preset's
         declared identity, which is why LIGHT lifts it to 92 to buy body-text contrast without touching
         a single tint token. Dark pins both back to the opaque floor, so this reads identically there.
         Fallbacks mirror tokens.css: the derived cap is --glass-opaque-c-max × 0.65 in light. */
      const solidifyFloor = {
        l: num("--glass-solidify-l", dark ? 36.4 : 92),
        c: Math.min(tintC * num("--glass-opaque-c-scale", dark ? 0.98 : 0.85), num("--glass-solidify-c-max", dark ? opaqueCMax : opaqueCMax * 0.65)),
        a: glassOpacity,
      };
      /** The solidify floor as a compositable layer — the layer order `glass` paints. */
      const solidifyLayer = {
        l: solidifyFloor.l,
        c: solidifyFloor.c,
        h: tintH,
        a: solidifyFloor.a,
      };
      /* --glass-tint-c-hi (engine.css): the HIGHLIGHT chroma budget, min(--glass-tint-c, 0.017). The
         sheet stops and the crystal floor are all scaled off this, not off raw --glass-tint-c — at
         near-white lightnesses the gamut ceiling collapses, so the cap is what keeps those layers
         rendering what they ask for. check-theme [gamut] holds the 0.017 in step with engine.css. */
      const TINT_C_HI_MAX = 0.017;
      const tintCHi = Math.min(tintC, TINT_C_HI_MAX);
      /* The gloss triple (top / streak / glow) — crystal AND chakra bake the same --glass-gloss-ink, so
         it is derived once here. Only the TOP highlight is modeled: it peaks at 0.4α and fades out by
         30% height, so ≈0.2 is its mean across the title zone (modeling the 0.4 peak would make the band
         unsatisfiable on mid-gray). The streak (0.15α on a 135° diagonal) and glow (0.2α radial centred
         at 50% 120%, i.e. BELOW the card) are left out: the glow is past its 70% fade before it reaches
         the title zone, and the streak's mean there is a geometry estimate rather than a measurement.
         Both would only ADD light, so omitting them is the conservative direction. */
      const GLOSS_TOP_A = 0.2;
      const glossLayer = {
        /* Mode-aware fallback: --glass-gloss-l is a twin (97 light / 66 dark), so a single 66 here would
           model the light crystal surface ~6 L darker than it renders and band text too weak. */
        l: num("--glass-gloss-l", dark ? 66 : 97),
        // --glass-gloss-ink is TINTED — min(--glass-tint-c × --glass-gloss-tint, --glass-gloss-c-max).
        // Modeling it achromatic dropped the gloss's colour from every crystal/chakra band.
        c: Math.min(tintC * num("--glass-gloss-tint", 4.25), num("--glass-gloss-c-max", dark ? 0.109 : 0.013)),
        h: tintH,
        a: GLOSS_TOP_A,
      };
      const normalLcBoost = LC_MARGIN * backdropShowThrough(solidA, tintA, glassOpacity);
      const huelessAccent = harmonyH === 0 && !Number.isNaN(accentH);
      // The wheel origin harmonics rotate from — the accent on hue-less+accent, else the CSS --harmony-h.
      const fgHarmonyH = huelessAccent ? accentH : harmonyH;
      /* The veiled floor body text sits on (page + translucent/veiled cards). Derived HERE, above the
         ramp, because the ramp's hue comes from it — see below. */
      const normalSurface = glassSolidSurface(
        dark,
        {
          h: tintH,
          c: tintC,
          a: tintA,
        },
        solidA,
        washL,
        washCMult,
        solidifyFloor,
      );
      /* TEXT FOLLOWS THE SURFACE'S HUE, NOT THE TINT TOKEN'S. --glass-tint-h is what the WASH declares;
         what a reader sees is the wash composited over the solid/solidify floor, and that mix does not
         travel a radial path — the floor is near-neutral, so it has almost no hue to interpolate toward
         and the result lands a few degrees off the declared angle (measured light: rose 8 → 2.5, goldstone
         22 → 17.1, lapis 268 → 271.7). Seeding the ramp from tintH therefore painted text at an angle the
         surface underneath it never actually occupies. Opaque is the one surface unaffected: it is a solid
         painted colour with nothing composited over it, so its hue IS tintH and surface.h returns exactly
         that. The residual spread BETWEEN materials is ≤5.5°, which at the ink's chroma (~0.08) sits well
         under a just-noticeable difference — far smaller than the ink-vs-surface mismatch it removes. */
      const surfaceH = huelessAccent ? accentH : normalSurface.h;
      // A neutral tint → ACHROMATIC foregrounds (black/white/gray by lightness). EXCEPTION: the Hue palette
      // stays a full-spectrum color wheel even when neutral. A hue-less accent overrides both — it hue +
      // vividnesses the whole ramp so every text tier tints toward the chosen accent.
      const base = {
        l: rl ?? storedRamp.l,
        c: huelessAccent ? accentC || cfgC : palette === "hue" ? cfgC || 0.15 : tintC > 0 ? cfgC : 0,
        h: surfaceH,
      };
      /* Draw every foreground from the chosen tonal/lightness ramp — real theme COLORS, not neutral gray —
         each picked to hit its ARC-Bronze contrast target on the surface text actually sits on. Only the
         READABLE half (count + 1 levels) is built: the far side of the base is display-only, and picking
         from it would offer steps the surface can never make legible.
         foregroundRamp also drops both achromatic ends on tinted themes — see lib/oklch-utils for why the
         two thresholds are not symmetric. Before that clip, --foreground-strong was #000000 on 20 of 21
         presets in light and #ffffff on 18 of 21 in dark, and body text ALSO went black on 10 of 21. */
      const ramp = foregroundRamp({
        palette,
        count,
        base,
        dark,
      });
      const iconHue = storedFg.iconHue;
      /* Set the full foreground tier set against a given SURFACE, under a var suffix. Run FOUR times, once
         per modeled surface: "" (the normal glass-SOLID floor), "-opaque", "-crystal", "-chakra". Each
         material's [data-material] block remaps --foreground* → its own suffixed set, so a LIGHT opaque
         floor (dark-mode moonstone cream) gets DARK card text while the dark page keeps light text — one
         global foreground cannot do both.
         FIVE materials share those four sets: `glass` and `frosted` both fall through to "". They are not
         quite the same surface — frosted paints --glass-frosted-bg, the same sheet lifted by
         --glass-frost-boost (0.1 light / 0.06 dark) — and the "" model deliberately stops at the wash, so
         NEITHER sheet is in it. Both are therefore banded against a floor darker than what renders, which
         is the safe direction (measured light: text lands 2.2–2.6 Lc over-contrasted on glass, 4.2–4.6 on
         frosted, and no tier breaches its band ceiling). Frosted is the loosest fit in the system; giving
         it a fifth set would tighten it. */
      const applyTiers = (
        surface: {
          l: number;
          c: number;
          h: number;
        },
        suffix: string,
        adaptive: boolean,
        lcBoost = 0,
        // Baseline aim, kept SEPARATE from lcBoost so the two stay honest: lcBoost answers "how much don't
        // we know about this floor", lcAim answers "how far above the bare minimum should we aim on a floor
        // we DO know". Only the opaque set passes it (see LC_AIM_KNOWN); every other surface earns its
        // margin from uncertainty and leaves this 0.
        lcAim = 0,
      ) => {
        // Lift the band's TARGET toward its ceiling by the uncertainty boost + the baseline aim. Floors and
        // ceilings stay — the margin aims higher, it never legalizes a harsher pick than the band allowed.
        const boost = (band: ContrastBand) => boostBand(band, lcBoost, lcAim);
        /* What the text is SOLVED against: the surface itself, or, under a fresco, the composite at the
           gradient stop that leaves the least contrast (lib/oklch-utils limitingSurface). Text sized for the
           plain surface dipped to 66–74 Lc at the stops. The HUE still comes from `surface`: ink follows the
           material it sits on, not whichever stop of the sweep happens to be hardest. */
        const bg = limitingSurface(surface, frescoStops);
        /* Pick from the TONAL ramp, never at the cost of the band's floor — see pickTonalInBand in
           lib/oklch-utils. Today no band needs the fallback (light body bottoms out at 75.4 Lc on the
           clipped ramp), but /colors lets a consumer re-base the ramp entirely, so the guard exists so
           the hue preference can never become a readability regression. */
        /* The adaptive twin, readableTonal, also lives in lib/oklch-utils: an unreachable aim makes
           readableForeground return the lightness EXTREME, where the gamut annihilates chroma, so every
           jewel's --foreground-opaque solved to pure black in light. Same clip, same ~1 Lc cost. */
        // Band-aware pick: honor each tier's floor (minimum) + ceiling (anti-spike), aiming for target. Normal
        // surfaces draw a COLORED pick from the theme ramp; `adaptive` (opaque floors) uses readableForeground
        // instead, which flips the lightness DIRECTION to whatever the floor needs — the ramp only spans the
        // readable half (white→base in dark mode), so it can't produce DARK text for a light floor (moonstone cream).
        const tier = (rawBand: ContrastBand) => {
          const band = boost(rawBand);
          return formatOklch(
            adaptive
              ? readableTonal(bg, band, {
                  // Opaque cards on the hue-less themes (selenite + moonstone) follow the chosen accent too — same as
                  // the normal surface above — so moonstone/selenite opaque-card text tints toward the accent.
                  // Otherwise THIS surface's own composited hue, not the tint token's (see surfaceH): each
                  // adaptive material composites a different stack, so each gets ink at its own angle.
                  hue: huelessAccent ? accentH : surface.h,
                  chroma: huelessAccent ? accentC : tintC > 0 ? cfgC : 0,
                  // Accent path ONLY — the one case where the background CAN hold the kept chroma, so the
                  // minChroma search does not bail to the extreme (see readableTonal).
                  minChroma: huelessAccent ? 0.08 : 0,
                })
              : pickTonalInBand(ramp, bg, band),
          );
        };
        root.style.setProperty(`--foreground${suffix}`, tier(READABLE_USAGE.body));
        root.style.setProperty(
          `--muted-foreground${suffix}`,
          tier({
            // Raised from 45/60/75 → muted lands darker (≈L30 on a light opaque floor) — a firmer secondary,
            // not a faint one. Global + computed per-hue (moonstone, sistine, every jewel), both surfaces + opaque.
            floor: 60,
            target: 72,
            ceiling: 84,
          }),
        );
        // Size tiers default to a palette-ramp pick (tier). softHue/strongHue (mirroring iconHue) optionally
        // pin a tier to its OWN readable hue — a number, "complement" (theme's opposite, live), or null =
        // follow the palette — so headings / fine text can be tinted independently of body text.
        const tierAtHue = (usage: "large" | "small", choice: number | HarmonicName | null) =>
          choice == null
            ? tier(READABLE_USAGE[usage])
            : formatOklch(
                // Clipped like every other solve: a PINNED hue is the one case where collapsing to the
                // achromatic extreme is most obviously wrong — the whole point of pinning is to see it.
                readableTonal(bg, boost(READABLE_USAGE[usage]), {
                  hue: typeof choice === "string" ? harmonicHue(fgHarmonyH, choice) : choice,
                  chroma: 0.15,
                }),
              );
        root.style.setProperty(`--foreground-soft${suffix}`, tierAtHue("large", storedFg.softHue));
        // REACH-LIMITED IN LIGHT MODE, by design of the surfaces themselves: the small band floors at Lc 90,
        // and a mid-light floor simply cannot deliver that much even with pure black text. Light opaque (L90)
        // tops out at 82.6–87.6 across the tints and light chakra (L88) at 82.0–83.7, so --foreground-strong
        // on those two surfaces lands 2.4–8.0 Lc under its floor. readableForeground's documented
        // reach < floor fallback covers it — it returns the MOST contrast available rather than failing —
        // and no margin can close the gap. Only raising --glass-opaque-l past ~94.5 / --glass-chakra-l past
        // ~92.5 would (measurably paler cards); that is a design call, not a banding bug. Dark mode has
        // headroom to spare (reach 96–104) and hits the floor everywhere.
        root.style.setProperty(`--foreground-strong${suffix}`, tierAtHue("small", storedFg.strongHue));
        // Icons get their own foreground: a ui-band-legible color (lightness solved for contrast) at an
        // OPTIONAL chosen hue — so icons can be tinted/cycled while staying readable, independent of the
        // text palette. iconHue null → follow the theme (neutral → gray, tinted → the tint hue).
        // null → follow the theme, which means THIS surface's composited hue (see surfaceH), so an icon
        // sits at the same angle as the material behind it. A pinned number / harmonic is a deliberate
        // choice and overrides that.
        const iconH = typeof iconHue === "string" ? harmonicHue(fgHarmonyH, iconHue) : typeof iconHue === "number" ? iconHue : surface.h;
        root.style.setProperty(
          `--foreground-ui${suffix}`,
          formatOklch(
            readableTonal(bg, boost(READABLE_USAGE.ui), {
              hue: iconH,
              chroma: iconHue != null ? 0.15 : tintC > 0 ? cfgC : 0,
            }),
          ),
        );
      };

      // Normal surface: the veiled floor body text sits on (page + translucent/veiled cards), with the
      // show-through margin lifting each band target as the floor gets sheerer. Derived above the ramp
      // (see normalSurface) because the ramp's hue is read off it.
      applyTiers(normalSurface, "", false, normalLcBoost);
      /* Opaque cards paint --glass-opaque-bg (under the wash), so band a second set against THAT — derived here from
         --glass-opaque-l / -c-max rather than reused from solidifyFloor. Those two used to be the same
         colour, and this call read `solidifyFloor` on exactly that basis; they are separate surfaces now
         (tokens.css), so sharing would band opaque-card text against the sheer backing instead of the
         card. In dark the two still resolve identically; in light the card stays at L88 while the backing
         sits at L92. Keep in step with tokens.css — an earlier version of this re-derivation drifted,
         carrying its own `* 0.9` multiplier (matching neither mode) and no chroma cap at all.
         `adaptive` so a LIGHT floor (moonstone cream) gets DARK text — the theme ramp only spans the
         readable half and can't. */
      /* The opaque card is its floor PLUS the tint wash (materials.css: the glass stack at full opacity),
         so the tier bands against the composite. The floor's cap is the preset cap times
         --glass-opaque-cap-scale (the light floor sits at L93, where the L88 caps would overshoot). */
      const opaqueFloor = {
        l: num("--glass-opaque-l", dark ? 33.4 : 93),
        c: Math.min(tintC * num("--glass-opaque-c-scale", dark ? 0.98 : 0.85), opaqueCMax * num("--glass-opaque-cap-scale", dark ? 1 : 0.55)),
        h: tintH,
      };
      applyTiers(
        compositeSurface(opaqueFloor, [
          {
            l: washL,
            c: tintC * washCMult,
            h: tintH,
            a: tintA,
          },
        ]),
        "-opaque",
        true,
        0, // no uncertainty — --glass-opaque-l models this floor exactly
        LC_AIM_KNOWN,
      );
      // Crystal cards: the specular gloss is baked UNDER content, so title-zone text sits on a locally
      // LIGHTENED surface — worst in dark mode, where the ~L94 highlight over a dark floor pulls the
      // local surface toward mid-gray. Band a THIRD set against the crystal surface + the title zone's
      // mean gloss term (see glossLayer). [data-material="crystal"] and the crystal page style remap the
      // tiers to this set — except veiled crystal, whose floor is what the NORMAL tiers are banded for.
      // Same show-through margin logic: the backdrop's weight in this mix is (1−crysA)(1−tintA)(1−glossA).
      {
        const crysA = num("--glass-crystal-bg-a", dark ? 0.1 : 0.3);
        // Layer order: --glass-crystal-bg (background-COLOR) → solidify → wash → gloss. The solidify step
        // was missing, which is what put moonstone-night crystal 27.5 L below what it paints. Each layer
        // now composites in sRGB (see compositeSurface) rather than lerping OKLCH coordinates — on this
        // surface that error CHANGED SIGN by preset, so nothing shorter than a real composite fixes it.
        const uCrystal = Math.min(Math.max((1 - crysA) * (1 - tintA) * (1 - GLOSS_TOP_A) * (1 - glassOpacity), 0), 1);
        applyTiers(
          compositeSurface(
            {
              l: dark ? 20 : 95,
              c: 0,
              h: tintH,
            },
            [
              // --glass-crystal-bg, engine.css: oklch(--glass-crystal-l, --glass-tint-c-hi × 0.6). This
              // modeled a flat L100 at the RAW tint chroma — 100 carries no chroma at all (which is why
              // the token pins 96), and skipping the -c-hi cap asked for up to 6× the colour that
              // renders (tourmaline 0.0636 vs the 0.0102 ceiling).
              {
                l: num("--glass-crystal-l", 96),
                c: tintCHi * 0.6,
                h: tintH,
                a: crysA,
              },
              solidifyLayer,
              {
                l: washL,
                c: tintC * washCMult,
                h: tintH,
                a: tintA,
              },
              glossLayer,
            ],
          ),
          "-crystal",
          true,
          LC_MARGIN * uCrystal,
        );
      }
      // Chakra cards: content sits on the translucent body, banded against the whole stack it paints.
      // The facet bands need no term — they live in box-shadow, ride the outer few px of the edge, and
      // pair a highlight against an ink on opposite sides, so they contribute nothing where text
      // actually sits. Show-through is (1 − body a)(1 − tintA)(1 − glossA)(1 − glassOpacity) — the same
      // four-term form crystal uses, since chakra bakes the same gloss. `adaptive` for the same reason
      // opaque is: an L88 body can sit on a dark page, and the theme ramp only spans the readable half.
      {
        const bodyA = num("--glass-chakra-a", dark ? 0.58 : 0.62);
        /* --glass-chakra-bg is the background-COLOR and it is TRANSLUCENT (--glass-chakra-a, 0.62 light
           / 0.58 dark), so --glass-chakra-l was never the banding lightness on its own — the page shows
           through it. And --glass-chakra-stack-bg is the SAME stack crystal bakes (gloss triple, fresco
           slot, wash layer) with solidify composed under it, so chakra takes the tint wash and the gloss
           too. Modeling only `chakra-l → solidify` dropped the page, the body's own alpha, the entire
           wash and the gloss; it agreed with the truth on moonstone night by coincidence, because that
           preset pins --glass-chakra-l (84) near its cream opaque floor. Full stack, real paint order. */
        /* (1 − GLOSS_TOP_A) belongs here for the same reason it does on crystal: show-through is the
           backdrop's SURVIVING weight, so every layer painted above it attenuates — and chakra bakes the
           gloss now. Omitting it overstated the backdrop's share by 1/(1−0.2) = 1.25×, which inflated an
           UNCERTAINTY margin (the boost is LC_MARGIN × this) on a surface that is in fact better known
           than the model claimed. */
        const uChakra = Math.min(Math.max((1 - bodyA) * (1 - tintA) * (1 - GLOSS_TOP_A) * (1 - glassOpacity), 0), 1);
        applyTiers(
          compositeSurface(
            {
              l: dark ? 20 : 95,
              c: 0,
              h: tintH,
            },
            [
              {
                l: num("--glass-chakra-l", dark ? 28 : 88),
                c: Math.min(tintC, num("--glass-chakra-c-max", dark ? 0.046 : 0.055)),
                h: tintH,
                a: bodyA,
              },
              solidifyLayer,
              {
                l: washL,
                c: tintC * washCMult,
                h: tintH,
                a: tintA,
              },
              glossLayer,
            ],
          ),
          "-chakra",
          true,
          LC_MARGIN * uChakra,
        );
      }
      if (dbg) {
        const dur = performance.now() - t0;
        // Wall-time = the getComputedStyle forced recalc + the JS solve (58 µs). The post-write recalc from
        // the setProperty calls shows separately as "Recalculate Style" in the Performance panel.
        console.debug(
          `[AutoForeground] update ${dur.toFixed(2)}ms · --foreground ${fgBefore || "(unset)"} → ${root.style.getPropertyValue("--foreground")}`,
        );
        try {
          performance.measure("AutoForeground.update", {
            start: t0,
            duration: dur,
          });
        } catch {
          // options form of performance.measure not supported
        }
      }
    };

    update();
    // Mode toggle (class) uses the DOM-read fallback — the one place we still pay the recalc, by design.
    // Tint / accent / lightness changes arrive via FG_EVENT carrying a JS snapshot (no getComputedStyle).
    // Inline STYLE mutations re-band ONLY when a surface-model input actually changed: --glass-solid-a
    // (the veil-floor slider) or --glass-gloss-l (the crystal gloss-boldness slider) — the two inputs
    // with no FG_EVENT. The old-vs-new gate keeps tint drags on the event fast path AND breaks the
    // self-trigger loop from our own --foreground* writes (which touch neither).
    const STYLE_INPUTS = [
      /--glass-solid-a:\s*([^;]+)/,
      /--glass-gloss-l:\s*([^;]+)/,
      // --glass-opacity is a surface-model input now that the solidify floor is banded against, and the
      // component-opacity slider writes it inline with no FG_EVENT — without this the tiers go stale the
      // moment a consumer dials solidity, which is exactly when the floor moves most.
      /--glass-opacity:\s*([^;]+)/,
    ];
    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName === "class") {
          update();
          return;
        }
        if (m.attributeName === "style") {
          const now = root.getAttribute("style") ?? "";
          const was = m.oldValue ?? "";
          if (STYLE_INPUTS.some((re) => re.exec(was)?.[1]?.trim() !== re.exec(now)?.[1]?.trim())) {
            update();
            return;
          }
        }
      }
    });
    observer.observe(root, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        "class",
        "style",
      ],
    });
    const onFg = (e: Event) => update((e as CustomEvent<Record<string, number>>).detail ?? undefined);
    window.addEventListener(FG_EVENT, onFg);
    return () => {
      observer.disconnect();
      window.removeEventListener(FG_EVENT, onFg);
    };
  }, [
    paletteProp,
    rl,
    rc,
    rh,
    rcount,
  ]);

  return null;
}
