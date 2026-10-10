import { describe, it, expect } from "vitest";
import { seedsFromPalette } from "./seeds-from-palette";
import { generateTheme, DEFAULT_SEEDS } from "./generate";
import { hexToOklch } from "./oklch";
import { contrastWarnings } from "./contrast";
import { THEME_BASES } from "./recipe";

const nearHue = (hex: string, target: string, deg = 20) => {
  const a = hexToOklch(hex).h;
  const b = hexToOklch(target).h;
  return Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) < deg;
};

describe("seedsFromPalette", () => {
  it("picks the cool hue for water on a two-hue brand", () => {
    const warm = "#C33149";
    const cool = "#3B6EA5";
    const seeds = seedsFromPalette([
      { hex: warm, proportion: 0.65 },
      { hex: cool, proportion: 0.35 },
    ]);
    expect(nearHue(seeds.land, warm), "land is the dominant warm hue").toBe(true);
    expect(nearHue(seeds.water, cool), "water is the cool hue").toBe(true);
    expect(hexToOklch(cool).h).toBeGreaterThanOrEqual(190);
    expect(hexToOklch(cool).h).toBeLessThanOrEqual(270);
  });

  it("yields a monochrome trio sharing one hue", () => {
    const brand = "#5A2ECC";
    const seeds = seedsFromPalette([{ hex: brand, proportion: 1 }]);
    expect(nearHue(seeds.land, brand)).toBe(true);
    expect(nearHue(seeds.water, seeds.land)).toBe(true);
    expect(nearHue(seeds.nature, seeds.land)).toBe(true);
  });

  it("treats a neutral-only palette as a grey trio with the stock accent", () => {
    const seeds = seedsFromPalette([
      { hex: "#222222", proportion: 0.4 },
      { hex: "#808080", proportion: 0.4 },
      { hex: "#F5F5F5", proportion: 0.2 },
    ]);
    expect(hexToOklch(seeds.land).c).toBeLessThan(0.04);
    expect(nearHue(seeds.water, seeds.land, 1) || hexToOklch(seeds.water).c < 0.04).toBe(true);
    expect(hexToOklch(seeds.nature).c).toBeLessThan(0.04);
    expect(seeds.land).toBe(seeds.water);
    expect(seeds.land).toBe(seeds.nature);
    expect(seeds.accent).toBe(DEFAULT_SEEDS.accent);
  });

  it("uses the most saturated colour as the accent, as-is", () => {
    const vivid = "#FF2E9E";
    const seeds = seedsFromPalette([
      { hex: "#7D8B87", proportion: 0.5 },
      { hex: vivid, proportion: 0.15 },
      { hex: "#33606B", proportion: 0.35 },
    ]);
    expect(seeds.accent).toBe(vivid);
  });

  it("falls back to the stock seeds on an empty palette", () => {
    expect(seedsFromPalette([])).toEqual(DEFAULT_SEEDS);
  });

  it("clamps land/water/nature lightness into the mid display range", () => {
    const seeds = seedsFromPalette([
      { hex: "#0A1A20", proportion: 0.7 },
      { hex: "#E8F4FF", proportion: 0.3 },
    ]);
    for (const hex of [seeds.land, seeds.water, seeds.nature]) {
      const { l } = hexToOklch(hex);
      expect(l).toBeGreaterThanOrEqual(0.35 - 0.02);
      expect(l).toBeLessThanOrEqual(0.7 + 0.02);
    }
  });

  it("generated themes from extracted seeds clear the label floors on every style", () => {
    const palettes = [
      [
        { hex: "#C33149", proportion: 0.5 },
        { hex: "#3B6EA5", proportion: 0.3 },
        { hex: "#3F6B4F", proportion: 0.2 },
      ],
      [{ hex: "#5A2ECC", proportion: 1 }],
      [
        { hex: "#222222", proportion: 0.6 },
        { hex: "#F5F5F5", proportion: 0.4 },
      ],
      [
        { hex: "#00D5F2", proportion: 0.4 },
        { hex: "#8CE800", proportion: 0.3 },
        { hex: "#FF2E9E", proportion: 0.3 },
      ],
    ];
    const failures: string[] = [];
    for (const [i, colors] of palettes.entries()) {
      const seeds = seedsFromPalette(colors);
      for (const base of THEME_BASES) {
        const warnings = contrastWarnings(generateTheme(base, seeds));
        if (warnings.length > 0) {
          failures.push(
            `palette ${i} ${base}: ${warnings
              .map((w) => `${w.mode}.${w.label} ${w.ratio.toFixed(2)}<${w.floor}`)
              .join(", ")}`,
          );
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
