import { describe, it, expect } from "vitest";
import { fern, verdant } from "./palette";
import { hexToOklch } from "./oklch";
import { RECIPES } from "./recipes";

describe("fern", () => {
  // The vegetation ramp for `outdoor` (2026-09-09). `verdant` is a mint at hue 152, which reads
  // cool and flat once it has to stand for a forest; the outdoor maps people already read use a
  // leaf green nearer hue 136 with more chroma. Fern keeps verdant's lightness step for step, so
  // every contrast property the ramps were solved for carries over unchanged, and only the hue
  // and chroma move.
  it("keeps verdant's lightness step for step, at a leaf-green hue with more chroma", () => {
    expect(Object.keys(fern)).toEqual(Object.keys(verdant));
    for (const step of Object.keys(verdant) as unknown as Array<keyof typeof verdant>) {
      const f = hexToOklch(fern[step]);
      const v = hexToOklch(verdant[step]);
      expect(Math.abs(f.l - v.l), `step ${step} lightness`).toBeLessThan(0.006);
      expect(Math.abs(f.h - 136), `step ${step} hue`).toBeLessThan(2);
      expect(f.c, `step ${step} chroma`).toBeGreaterThan(v.c);
    }
  });

  it("is what outdoor's vegetation is drawn from, while base keeps verdant", () => {
    const light = RECIPES.outdoor.light;
    const dark = RECIPES.outdoor.dark;
    expect(light.woodA).toBe(fern[300]);
    expect(light.parkA).toBe(fern[300]);
    expect(light.scrubA).toBe(fern[200]);
    expect(dark.woodA).toBe(fern[700]);
    expect(dark.parkA).toBe(fern[700]);
    expect(light.landcover?.forest).toBe(fern[400]);
    expect(RECIPES.base.light.woodA).toBe(verdant[200]);
  });
});
