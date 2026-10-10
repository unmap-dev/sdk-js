import { describe, it, expect } from "vitest";
import { THEME_PRESETS, shuffleSeeds } from "./palettes";
import { generateTheme } from "./generate";
import { contrastWarnings } from "./contrast";
import { validateTheme } from "./validate";
import { THEME_BASES } from "./recipe";

describe("theme presets", () => {
  it("every preset generates a valid, contrast-clean theme on every style", () => {
    for (const palette of THEME_PRESETS) {
      for (const base of THEME_BASES) {
        const doc = generateTheme(base, palette.seeds);
        expect(() => validateTheme(doc), `${palette.name}/${base}`).not.toThrow();
        expect(contrastWarnings(doc), `${palette.name}/${base}`).toEqual([]);
      }
    }
  });

  it("preset names are unique", () => {
    const names = THEME_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("shuffleSeeds", () => {
  /** Tiny deterministic LCG so shuffles are reproducible in tests. */
  const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  it("is deterministic under an injected rng", () => {
    expect(shuffleSeeds(lcg(7))).toEqual(shuffleSeeds(lcg(7)));
    expect(shuffleSeeds(lcg(7))).not.toEqual(shuffleSeeds(lcg(8)));
  });

  it("every shuffle validates and stays contrast-clean across styles", () => {
    for (let i = 0; i < 12; i++) {
      const seeds = shuffleSeeds(lcg(i * 31 + 1));
      for (const base of THEME_BASES) {
        const doc = generateTheme(base, seeds);
        expect(() => validateTheme(doc), `seed ${i}/${base}`).not.toThrow();
        expect(contrastWarnings(doc), `seed ${i}/${base}`).toEqual([]);
      }
    }
  });
});
