import { hexToOklch, oklchToHex } from "./oklch";
import { buildRecipes, RECIPES, STOCK_RAMPS, type RampSet } from "./recipes";
import { makeFlavor, MODES, type Recipe, type ThemeBase } from "./recipe";
import type { BasemapOverrides, ThemeDoc, ThemeSeeds } from "./doc";
import { contrast, LABEL_PAIRS } from "./contrast";

/**
 * The simple-mode generator: three seed colours in, a full light + dark theme out.
 *
 * The trick is the one the hand-built ramps were made with. Each stock ramp is a *lightness
 * ladder* — its steps were solved so the label-contrast floors hold — and hue/chroma merely
 * carry identity. So the generator keeps every step's OKLCH lightness exactly, swaps in the
 * seed's hue, scales chroma to the seed's vividness, and rebuilds the recipes through the same
 * `buildRecipes` factory the shipped cartography uses. Casing/tunnel/bridge coherence and the
 * figure/ground relationships come along for free; the seeds only ever recolour.
 *
 * The output is a plain, valid ThemeDoc (sparse overrides + the seeds themselves), so nothing
 * downstream — codec, gateway, SDK — knows generation exists.
 */

/** Neutrals must stay a cast, not a colour, or the whole map shouts. */
const NEUTRAL_CHROMA_CAP = 0.045;
/** `muted` exists to vanish under data; its cast cap is a whisper of the normal one. */
const MUTED_CHROMA_CAP = 0.012;
/** Ceiling for chromatic families (water, vegetation) before gamut mapping. */
const CHROMA_CAP = 0.32;
/** Below this mid-step chroma a ramp is greyscale and is re-hued from the seed directly. */
const NEUTRAL_RAMP_CHROMA = 0.005;

/** The seeds that reproduce (approximately) the stock cartography. Simple mode opens on these. */
export const DEFAULT_SEEDS: Required<ThemeSeeds> = {
  land: STOCK_RAMPS.ink[500],
  water: STOCK_RAMPS.wave[500],
  nature: STOCK_RAMPS.verdant[500],
  accent: "#FF3E9A",
};

type Ramp = Record<string | number, string>;

/**
 * Re-emit a ramp in the seed's hue: every step keeps its stock lightness, chroma scales by the
 * seed's vividness relative to the ramp's own mid-step, clamped to `cap`.
 */
function reRamp<T extends Ramp>(ref: T, seedHex: string, cap: number): T {
  const seed = hexToOklch(seedHex);
  const steps = Object.keys(ref);
  const midStep = steps[Math.floor(steps.length / 2)]!;
  const midChroma = hexToOklch(ref[midStep]!).c;
  // A greyscale ramp (`graphite`, `mist`) has no chroma to scale, so it takes the seed's
  // chroma outright at every step; the cap still decides how much of it survives.
  const neutral = midChroma < NEUTRAL_RAMP_CHROMA;
  const factor = Math.min(Math.max(seed.c / Math.max(midChroma, 0.005), 0.15), 3);
  const out: Ramp = {};
  for (const step of steps) {
    const refColor = hexToOklch(ref[step]!);
    out[step] = oklchToHex({
      l: refColor.l,
      c: Math.min(neutral ? seed.c : refColor.c * factor, cap),
      h: seed.h,
    });
  }
  return out as T;
}

/**
 * Enforce the label floors on a generated flavor's recipe. Lightness is preserved from the
 * stock ladders, which pass with margin, but WCAG contrast is computed in sRGB luminance and a
 * strong hue shift can erode that margin — so each breaching label slot has its OKLCH lightness
 * nudged away from its background until the pair clears. Bounded and deterministic.
 */
function enforceLabelContrast(recipe: Recipe): Recipe {
  const fixed = structuredClone(recipe);
  for (const [labelSlot, bgSlot, floor] of LABEL_PAIRS) {
    for (let i = 0; i < 40; i++) {
      const flavor = makeFlavor(fixed) as unknown as Record<string, string>;
      const label = flavor[labelSlot as string]!;
      const bg = flavor[bgSlot as string]!;
      if (contrast(label, bg) >= floor) break;
      const l = hexToOklch(label);
      const direction = hexToOklch(bg).l > l.l ? -1 : 1;
      const nudged = oklchToHex({
        ...l,
        l: Math.min(1, Math.max(0, l.l + direction * 0.015)),
      });
      setLabelSlot(fixed, labelSlot as string, nudged);
    }
  }
  return fixed;
}

/** Map a Flavor label slot back to its Recipe field. Only slots LABEL_PAIRS can name. */
const LABEL_SLOT_TO_RECIPE: Record<string, (r: Recipe, hex: string) => void> = {
  city_label: (r, v) => (r.labels.city = v),
  state_label: (r, v) => (r.labels.state = v),
  country_label: (r, v) => (r.labels.country = v),
  roads_label_major: (r, v) => (r.labels.roadMajor = v),
  subplace_label: (r, v) => (r.labels.subplace = v),
  address_label: (r, v) => (r.labels.address = v),
  roads_label_minor: (r, v) => (r.labels.roadMinor = v),
  ocean_label: (r, v) => (r.labels.ocean = v),
};

function setLabelSlot(recipe: Recipe, slot: string, hex: string): void {
  LABEL_SLOT_TO_RECIPE[slot]?.(recipe, hex);
}

/** Diff a generated recipe against the stock one into sparse overrides. */
function diffRecipe(
  stock: Recipe,
  generated: Recipe,
): BasemapOverrides | undefined {
  const walk = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [key, stockValue] of Object.entries(a)) {
      const genValue = b[key];
      if (stockValue !== null && typeof stockValue === "object") {
        const nested = walk(
          stockValue as Record<string, unknown>,
          (genValue ?? {}) as Record<string, unknown>,
        );
        if (Object.keys(nested).length > 0) out[key] = nested;
      } else if (typeof genValue === "string" && genValue !== stockValue) {
        out[key] = genValue;
      }
    }
    return out;
  };
  const diff = walk(
    stock as unknown as Record<string, unknown>,
    generated as unknown as Record<string, unknown>,
  );
  return Object.keys(diff).length > 0 ? (diff as BasemapOverrides) : undefined;
}

/**
 * Generate a full theme from seed colours. Deterministic; the result always clears the label
 * floors in both modes (enforced, and asserted by the hue-sweep test).
 *
 * Family mapping: `land` recolours the land spines — `ink`, `base`'s `paper`, `muted`'s
 * `graphite` at a whisper of chroma (that style exists to vanish under data), and the
 * single-hue family of `blueprint` (`cobalt`) at full chroma (and `jade`, which `orchid`, `tropic`, `bold` and `pastel` draw their greens from), so a
 * seed can carry them to any hue, plus `blush`'s `rose`, `orchid`'s `lilac`, the cream `linen` of
 * `tropic` and `sunset`, and `sunset`'s `indigo`. `nature` recolours `verdant`, `sunset`'s `peach`
 * and the teal `aqua` of `orchid` and `lagoon`. `water` recolours the wave, sky, azure and mist ramps (`mist` is
 * greyscale in stock `muted` and takes the water seed's hue outright), `nature` the verdant
 * ramp. Warm landcover (sandstone), the highway ramps (ember, coral, amber), POI accents and white road fills stay stock: they
 * are tuned relationships, not identity. `accent` styles the marker and route overlays only —
 * it never enters the basemap, same rule as the brand magenta.
 */
export function generateTheme(base: ThemeBase, seeds: ThemeSeeds): ThemeDoc {
  const ramps: RampSet = {
    ...STOCK_RAMPS,
    atlasPaper: reRamp(STOCK_RAMPS.atlasPaper, seeds.land, NEUTRAL_CHROMA_CAP),
    atlasWater: reRamp(STOCK_RAMPS.atlasWater, seeds.water, CHROMA_CAP),
    atlasGreen: reRamp(STOCK_RAMPS.atlasGreen, seeds.nature, CHROMA_CAP),
    swissPaper: reRamp(STOCK_RAMPS.swissPaper, seeds.land, NEUTRAL_CHROMA_CAP),
    swissWater: reRamp(STOCK_RAMPS.swissWater, seeds.water, CHROMA_CAP),
    swissGreen: reRamp(STOCK_RAMPS.swissGreen, seeds.nature, CHROMA_CAP),

    ink: reRamp(STOCK_RAMPS.ink, seeds.land, NEUTRAL_CHROMA_CAP),
    paper: reRamp(STOCK_RAMPS.paper, seeds.land, NEUTRAL_CHROMA_CAP),
    graphite: reRamp(STOCK_RAMPS.graphite, seeds.land, MUTED_CHROMA_CAP),
    jade: reRamp(STOCK_RAMPS.jade, seeds.land, CHROMA_CAP),
    cobalt: reRamp(STOCK_RAMPS.cobalt, seeds.land, CHROMA_CAP),
    rose: reRamp(STOCK_RAMPS.rose, seeds.land, CHROMA_CAP),
    lilac: reRamp(STOCK_RAMPS.lilac, seeds.land, NEUTRAL_CHROMA_CAP),
    linen: reRamp(STOCK_RAMPS.linen, seeds.land, NEUTRAL_CHROMA_CAP),
    indigo: reRamp(STOCK_RAMPS.indigo, seeds.land, CHROMA_CAP),
    aqua: reRamp(STOCK_RAMPS.aqua, seeds.nature, CHROMA_CAP),
    wave: reRamp(STOCK_RAMPS.wave, seeds.water, CHROMA_CAP),
    sky: reRamp(STOCK_RAMPS.sky, seeds.water, CHROMA_CAP),
    mist: reRamp(STOCK_RAMPS.mist, seeds.water, CHROMA_CAP),
    azure: reRamp(STOCK_RAMPS.azure, seeds.water, CHROMA_CAP),
    verdant: reRamp(STOCK_RAMPS.verdant, seeds.nature, CHROMA_CAP),
    peach: reRamp(STOCK_RAMPS.peach, seeds.nature, CHROMA_CAP),
  };
  const generated = buildRecipes(ramps);

  const doc: ThemeDoc = { v: 1, base, seeds: { ...seeds } };
  for (const mode of MODES) {
    const recipe = enforceLabelContrast(generated[base][mode]);
    const basemap = diffRecipe(RECIPES[base][mode], recipe);
    const half: NonNullable<ThemeDoc["light"]> = {};
    if (basemap) half.basemap = basemap;
    if (seeds.accent) {
      half.marker = { color: seeds.accent };
      half.route = { color: seeds.accent, casingColor: seeds.accent };
    }
    if (Object.keys(half).length > 0) doc[mode] = half;
  }
  return doc;
}
