import { describe, it, expect } from "vitest";
import { contrast, contrastWarnings } from "./contrast";
import { STYLE_THEMES } from "./presets";
import type { ThemeDoc } from "./doc";

describe("contrast", () => {
  it("black on white is ~21:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });
});

describe("contrastWarnings", () => {
  it("all shipped presets are clean in both modes", () => {
    for (const preset of Object.values(STYLE_THEMES)) {
      expect(contrastWarnings(preset), preset.name).toEqual([]);
    }
  });

  it("flags a washed-out city label with the 4.5 floor, in the right mode", () => {
    const doc: ThemeDoc = {
      v: 1,
      base: "base",
      light: { basemap: { labels: { city: "#DDDDDD" } } },
    };
    const warnings = contrastWarnings(doc);
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.mode).toBe("light");
      expect(w.floor).toBe(4.5);
      expect(w.ratio).toBeLessThan(4.5);
    }
    expect(warnings.some((w) => w.label === "city_label")).toBe(true);
  });

  it("checks each mode independently", () => {
    const doc: ThemeDoc = {
      v: 1,
      base: "base",
      dark: { basemap: { labels: { subplace: "#222222" } } },
    };
    const warnings = contrastWarnings(doc);
    expect(warnings.some((w) => w.mode === "dark" && w.floor === 3)).toBe(true);
    expect(warnings.every((w) => w.mode === "dark")).toBe(true);
  });
});
