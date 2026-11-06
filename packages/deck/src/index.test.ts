import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as api from "./index";

describe("@unmap/deck exports", () => {
  it("exports the public helpers", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "LIFTS_3D_SCHEMA",
        "LIFT_COLORS",
        "Lifts3dError",
        "UnmapError",
        "bakedZ",
        "createDeckOverlay",
        "deckMapOptions",
        "fetchLifts3d",
        "liftCablesLayer",
        "liftModelInstances",
        "liftModelsLayer",
      ].sort(),
    );
  });

  it("keeps fetch, bakedZ and deckMapOptions free of deck.gl and maplibre-gl at runtime", () => {
    // These three are what a page needs before it decides to load the 3D layer, so they must
    // not drag the renderers in. Type-only imports are erased and do not count.
    for (const file of ["fetch.ts", "geometry.ts", "options.ts", "types.ts"]) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      const runtime = src.split("\n").filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
      for (const line of runtime) expect(line).not.toMatch(/@deck\.gl|@luma\.gl|maplibre-gl/);
    }
  });
});

describe("@unmap/maps never imports @unmap/deck", () => {
  it("keeps the plain map free of the deck.gl bundle", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../maps/package.json", import.meta.url), "utf8")) as Record<string, Record<string, string> | undefined>;
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      expect(Object.keys(pkg[field] ?? {})).not.toContain("@unmap/deck");
      expect(Object.keys(pkg[field] ?? {}).some((d) => d.startsWith("@deck.gl/"))).toBe(false);
    }
  });
});
