import { describe, it, expect } from "vitest";
import { RECIPES, makeFlavor, THEME_BASES, MODES } from "./index";

describe("recipes", () => {
  it.each(THEME_BASES.flatMap((b) => MODES.map((m) => [b, m] as const)))(
    "%s-%s expands to a complete flavor",
    (base, mode) => {
      const flavor = makeFlavor(RECIPES[base][mode]) as unknown as Record<string, unknown>;
      const unset = Object.entries(flavor)
        .filter(([, v]) => v === undefined || v === null || v === "")
        .map(([k]) => k);
      expect(unset).toEqual([]);
      expect(flavor.pois).toBeDefined();
      expect(flavor.landcover).toBeDefined();
    },
  );
});
