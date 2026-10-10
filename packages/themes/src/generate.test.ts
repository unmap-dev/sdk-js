import { describe, it, expect } from "vitest";
import { generateTheme, DEFAULT_SEEDS } from "./generate";
import { hexToOklch, oklchToHex } from "./oklch";
import { contrastWarnings } from "./contrast";
import { resolveTheme } from "./compose";
import { validateTheme } from "./validate";
import { encodeTheme, decodeTheme } from "./codec";
import { THEME_BASES } from "./recipe";
import type { ThemeSeeds } from "./doc";

describe("oklch", () => {
  it("round-trips hex colours within one step per channel", () => {
    for (const hex of ["#FF3E9A", "#9CCFD2", "#0E191C", "#FFFFFF", "#000000", "#366042"]) {
      const back = oklchToHex(hexToOklch(hex));
      const dist = (a: string, b: string, i: number) =>
        Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16));
      for (const i of [1, 3, 5]) expect(dist(hex, back, i), `${hex} ch${i}`).toBeLessThanOrEqual(1);
    }
  });

  it("gamut-maps by desaturating, preserving lightness", () => {
    const wild = oklchToHex({ l: 0.5, c: 0.4, h: 150 });
    expect(wild).toMatch(/^#[0-9A-F]{6}$/);
    expect(Math.abs(hexToOklch(wild).l - 0.5)).toBeLessThan(0.02);
  });
});

describe("generateTheme", () => {
  const seeds: ThemeSeeds = {
    land: "#8A7355",
    water: "#3B6EA5",
    nature: "#7A8C3F",
    accent: "#D6136F",
  };

  it("emits a valid, codec-round-trippable document carrying its seeds", async () => {
    const doc = generateTheme("base", seeds);
    expect(validateTheme(doc)).toEqual(doc);
    expect(doc.seeds).toEqual(seeds);
    const code = await encodeTheme(doc);
    expect(code.length).toBeLessThanOrEqual(4096);
    expect(await decodeTheme(code)).toEqual(doc);
  });

  it("is deterministic", () => {
    expect(generateTheme("outdoor", seeds)).toEqual(generateTheme("outdoor", seeds));
  });

  it("recolours by family: water seed moves water, land seed moves earth, nature moves parks", () => {
    const light = resolveTheme(generateTheme("base", seeds), "light");
    const hue = (hex: string) => hexToOklch(hex).h;
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) < 25;
    expect(near(hue(light.flavor.water), hue(seeds.water)), "water hue").toBe(true);
    expect(near(hue(light.flavor.earth), hue(seeds.land)), "earth hue").toBe(true);
    expect(near(hue(light.flavor.park_a!), hue(seeds.nature)), "park hue").toBe(true);
  });

  it("keeps lightness ladders: dark mode stays dark, light stays light", () => {
    const doc = generateTheme("base", seeds);
    const lightBg = hexToOklch(resolveTheme(doc, "light").flavor.background!).l;
    const darkBg = hexToOklch(resolveTheme(doc, "dark").flavor.background!).l;
    expect(lightBg).toBeGreaterThan(0.8);
    expect(darkBg).toBeLessThan(0.3);
  });

  it("routes the accent to marker and route, never the basemap", () => {
    const doc = generateTheme("base", seeds);
    const { marker, route, flavor } = resolveTheme(doc, "light");
    expect(marker.color).toBe(seeds.accent);
    expect(route.color).toBe(seeds.accent);
    expect(route.casingColor).toBe(seeds.accent);
    expect(JSON.stringify(flavor)).not.toContain(seeds.accent);
  });

  it("default seeds stay close to stock (small override sets)", () => {
    const doc = generateTheme("base", DEFAULT_SEEDS);
    // Rounding through OKLCH may perturb a few slots; the point is it's a tweak, not a repaint.
    const json = JSON.stringify(doc);
    expect(json.length).toBeLessThan(3000);
  });

  it("GUARANTEE: any seed combination clears the label floors, every style, both modes", () => {
    const failures: string[] = [];
    for (const base of THEME_BASES) {
      for (let hue = 0; hue < 360; hue += 45) {
        for (const c of [0.05, 0.18]) {
          const s: ThemeSeeds = {
            land: oklchToHex({ l: 0.55, c, h: hue }),
            water: oklchToHex({ l: 0.5, c, h: (hue + 120) % 360 }),
            nature: oklchToHex({ l: 0.5, c, h: (hue + 240) % 360 }),
          };
          const warnings = contrastWarnings(generateTheme(base, s));
          if (warnings.length > 0) {
            failures.push(
              `${base} hue=${hue} c=${c}: ${warnings
                .map((w) => `${w.mode}.${w.label} ${w.ratio.toFixed(2)}<${w.floor}`)
                .join(", ")}`,
            );
          }
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
