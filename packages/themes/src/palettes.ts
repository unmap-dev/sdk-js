import { oklchToHex } from "./oklch";
import type { ThemeSeeds } from "./doc";
import { DEFAULT_SEEDS } from "./generate";

/**
 * The named theme presets of the builder's simple mode — the hand-picked starting points, named
 * for Canadian landscapes. Each is just a seed trio + accent; `generateTheme` does the rest,
 * and its contrast guarantee holds for these like any other seeds (asserted in tests).
 */
export interface ThemePreset {
  /** Display name, lowercase like the style names. Not translated — these are names. */
  name: string;
  seeds: Required<ThemeSeeds>;
}

export const THEME_PRESETS: ThemePreset[] = [
  { name: "process ink", seeds: DEFAULT_SEEDS },
  {
    name: "boreal",
    seeds: { land: "#7D8B87", water: "#33606B", nature: "#3F6B4F", accent: "#E4572E" },
  },
  {
    name: "prairie",
    seeds: { land: "#A08D6B", water: "#4E7E99", nature: "#7C8A4D", accent: "#C33149" },
  },
  {
    name: "tundra",
    seeds: { land: "#8B9AA6", water: "#4A7BA6", nature: "#6E8B74", accent: "#FF3E9A" },
  },
  {
    name: "badlands",
    seeds: { land: "#A67B5B", water: "#3E7C8F", nature: "#6B7F53", accent: "#22577A" },
  },
  {
    name: "aurora",
    seeds: { land: "#8C86A3", water: "#4F6D9E", nature: "#56828A", accent: "#58E1C1" },
  },
  {
    name: "pacific",
    seeds: { land: "#7F9089", water: "#2E7D74", nature: "#38755B", accent: "#F25F5C" },
  },
  {
    name: "chinook",
    seeds: { land: "#9C8A5D", water: "#56789C", nature: "#8A9A5B", accent: "#D95D39" },
  },
  // The seven below (2026-09-09) are deliberately unlike one another and unlike the landscapes
  // above: each is one idea pushed to the edge of what the generator allows. Land is capped at a
  // cast, so the idea lives in the water and nature seeds, which can go to full chroma.
  //
  // Fifteen is the ceiling for a three-character code: the preset index sits above bit 8, and
  // index 15 pushes every style past 62² (`preset.ts`). A sixteenth preset still works, at four
  // characters, but `preset.test.ts` holds the curated set to three.
  {
    // Lava for water, scorched olive for nature, warm ash land, a sulphur accent.
    name: "magma",
    seeds: { land: "#8A7A72", water: "#D6461A", nature: "#5C5A32", accent: "#FFC61A" },
  },
  {
    // Electric cyan water, acid-green nature, a violet cast on the land, hot-pink accent.
    name: "neon",
    seeds: { land: "#7C78A0", water: "#00D5F2", nature: "#8CE800", accent: "#FF2E9E" },
  },
  {
    // Bubblegum water, turquoise nature, a pink cast, a lemon accent.
    name: "candy",
    seeds: { land: "#A3808E", water: "#FF6FB5", nature: "#2ED1C2", accent: "#FFD400" },
  },
  {
    // Deep violet water, plum nature, violet land, a lime accent.
    name: "ultraviolet",
    seeds: { land: "#7A6E9E", water: "#5A2ECC", nature: "#9B4DCA", accent: "#C8FF3A" },
  },
  {
    // No chroma anywhere but the accent: a greyscale map with one red.
    name: "noir",
    seeds: { land: "#808080", water: "#6E6E6E", nature: "#707070", accent: "#E10600" },
  },
  {
    // Brown everything: a walnut cast, tea-coloured water, ochre nature, oxblood accent.
    name: "sepia",
    seeds: { land: "#8B7355", water: "#8C6A42", nature: "#A48A4A", accent: "#7A1F1F" },
  },
  {
    // Ultramarine water, navy-teal nature, a blue cast on the land, a coral accent.
    name: "ultramarine",
    seeds: { land: "#6F7A9C", water: "#1F3BFF", nature: "#215E7A", accent: "#FF6A4D" },
  },
  {
    // The larch that turns gold across the boreal every autumn, and the one Canadian landscape
    // colour the set was missing: `nature` is a green in all fifteen before it (hues 74 to 199),
    // so foliage had only ever meant summer. The cold violet accent is the complement of that
    // gold and the only occupant of the 210-to-320 band.
    //
    // Sixteenth, and the first to cost four characters: a preset code packs its index above the
    // style slot, and index 15 clears what two base62 digits hold. See `preset.ts`.
    name: "tamarack",
    seeds: { land: "#A59A8A", water: "#4C6A78", nature: "#C4881F", accent: "#6D4AFF" },
  },
];

/** Wrap a hue into [0, 360). */
const wrap = (h: number) => ((h % 360) + 360) % 360;

/**
 * A random but *harmonic* seed trio — the shuffle button. Hues are related (water lands
 * cool-of-complementary, nature analogous-of-triadic, the accent opposes the land) and chroma
 * stays inside a tasteful band, so shuffles read as designed rather than random; the
 * generator's contrast guarantee makes every one of them legible regardless.
 *
 * `rng` is injectable (returns [0,1)) so tests can drive it deterministically.
 */
export function shuffleSeeds(rng: () => number = Math.random): Required<ThemeSeeds> {
  const h = rng() * 360;
  return {
    land: oklchToHex({ l: 0.55, c: 0.03 + rng() * 0.05, h }),
    water: oklchToHex({ l: 0.5, c: 0.08 + rng() * 0.1, h: wrap(h + 150 + rng() * 60) }),
    nature: oklchToHex({ l: 0.5, c: 0.06 + rng() * 0.08, h: wrap(h + 60 + rng() * 80) }),
    accent: oklchToHex({ l: 0.65, c: 0.22 + rng() * 0.08, h: wrap(h + 170 + rng() * 40) }),
  };
}
