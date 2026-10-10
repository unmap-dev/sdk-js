import { hexToOklch, oklchToHex } from "./oklch";
import type { ThemeSeeds } from "./doc";
import { DEFAULT_SEEDS } from "./generate";

/**
 * Map an extracted image palette onto the four simple-mode seeds. Deterministic: the same
 * colours always produce the same seeds, and `generateTheme` then carries the contrast
 * guarantee. Lightness on land/water/nature is display-only (the generator re-hues stock
 * ladders); accent is used verbatim for the marker and route.
 */

export interface PaletteColor {
  hex: string;
  proportion: number;
}

const CHROMATIC_FLOOR = 0.04;
const HUE_DEDUP = 20;
const WATER_HUE = { lo: 190, hi: 270 };
const NATURE_HUE = { lo: 100, hi: 170 };
const DISPLAY_L = { lo: 0.35, hi: 0.7 };

interface Ranked {
  hex: string;
  proportion: number;
  l: number;
  c: number;
  h: number;
  score: number;
}

const wrapHue = (h: number) => ((h % 360) + 360) % 360;

const hueDelta = (a: number, b: number) => {
  const d = Math.abs(wrapHue(a) - wrapHue(b));
  return Math.min(d, 360 - d);
};

const inBand = (h: number, band: { lo: number; hi: number }) => {
  const hue = wrapHue(h);
  return hue >= band.lo && hue <= band.hi;
};

const normalizeHex = (hex: string) => {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  return `#${raw.slice(0, 6).toUpperCase()}`;
};

const parse = (color: PaletteColor): Ranked | null => {
  if (!/^#?[0-9a-fA-F]{6}/.test(color.hex)) return null;
  const hex = normalizeHex(color.hex);
  const { l, c, h } = hexToOklch(hex);
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) return null;
  return { hex, proportion: Math.max(color.proportion, 0), l, c, h, score: 0 };
};

/** Clamp land/water/nature into a mid range so a pale or near-black brand colour still reads. */
const displaySeed = (color: Ranked): string =>
  oklchToHex({
    l: Math.min(DISPLAY_L.hi, Math.max(DISPLAY_L.lo, color.l)),
    c: color.c,
    h: color.h,
  });

const byScore = (a: Ranked, b: Ranked) =>
  b.score - a.score || b.proportion - a.proportion || a.hex.localeCompare(b.hex);

/** Distinct hues in score order: skip a candidate within 20° of one already kept. */
const distinctHues = (ranked: Ranked[]): Ranked[] => {
  const out: Ranked[] = [];
  for (const color of ranked) {
    if (out.some((kept) => hueDelta(kept.h, color.h) < HUE_DEDUP)) continue;
    out.push(color);
  }
  return out;
};

const pickInBand = (candidates: Ranked[], band: { lo: number; hi: number }): Ranked | undefined =>
  candidates.find((color) => inBand(color.h, band));

function fromNeutrals(neutrals: Ranked[]): Required<ThemeSeeds> {
  const mid =
    neutrals.slice().sort((a, b) => Math.abs(a.l - 0.5) - Math.abs(b.l - 0.5))[0] ??
    parse({ hex: "#808080", proportion: 1 })!;
  const grey = displaySeed(mid);
  return { land: grey, water: grey, nature: grey, accent: DEFAULT_SEEDS.accent };
}

/**
 * Brand colours in, the four simple-mode seeds out. Empty input falls back to the stock seeds.
 */
export function seedsFromPalette(colors: PaletteColor[]): Required<ThemeSeeds> {
  const parsed = colors.map(parse).filter((c): c is Ranked => c !== null);
  if (parsed.length === 0) return { ...DEFAULT_SEEDS };

  const chromatic = parsed.filter((c) => c.c >= CHROMATIC_FLOOR);
  if (chromatic.length === 0) return fromNeutrals(parsed);

  const total = chromatic.reduce((sum, c) => sum + c.proportion, 0) || 1;
  for (const color of chromatic) {
    color.score = 0.7 * (color.proportion / total) + 0.3 * Math.min(color.c / 0.15, 1);
  }
  const ranked = chromatic.slice().sort(byScore);
  const distinct = distinctHues(ranked);
  const land = distinct[0]!;
  const rest = distinct.slice(1);
  const water = pickInBand(rest, WATER_HUE) ?? rest[0] ?? land;
  const afterWater = distinct.filter((c) => c !== land && c !== water);
  const nature = pickInBand(afterWater, NATURE_HUE) ?? afterWater[0] ?? land;
  const accent = ranked.slice().sort((a, b) => b.c - a.c || byScore(a, b))[0]!;

  return {
    land: displaySeed(land),
    water: displaySeed(water),
    nature: displaySeed(nature),
    accent: accent.hex,
  };
}
