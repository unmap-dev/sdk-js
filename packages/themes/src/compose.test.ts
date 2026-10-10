import { describe, it, expect } from "vitest";
import {
  mergeRecipe,
  resolveTheme,
  DEFAULT_MARKER,
  DEFAULT_ROUTE,
} from "./compose";
import { RECIPES, makeFlavor } from "./index";
import type { ThemeDoc } from "./doc";

describe("mergeRecipe", () => {
  it("returns the base unchanged for empty overrides", () => {
    expect(mergeRecipe(RECIPES.base.light)).toEqual(RECIPES.base.light);
    expect(mergeRecipe(RECIPES.base.light, {})).toEqual(RECIPES.base.light);
  });

  it("lands a nested override without touching siblings or the base", () => {
    const before = JSON.parse(JSON.stringify(RECIPES.base.light));
    const merged = mergeRecipe(RECIPES.base.light, { roads: { highway: "#123456" } });
    expect(merged.roads.highway).toBe("#123456");
    expect(merged.roads.minor).toBe(RECIPES.base.light.roads.minor);
    expect(merged.water).toBe(RECIPES.base.light.water);
    expect(RECIPES.base.light).toEqual(before); // no mutation
  });

  it("never lets unexpected override keys ride along", () => {
    const merged = mergeRecipe(
      RECIPES.base.light,
      { rogue: "#000000" } as unknown as Parameters<typeof mergeRecipe>[1],
    );
    expect("rogue" in merged).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("zero-override theme is the stock flavor", () => {
    const { flavor, flavorName } = resolveTheme({ v: 1, base: "base" }, "light");
    expect(flavor).toEqual(makeFlavor(RECIPES.base.light));
    expect(flavorName).toBe("base-light");
  });

  it("names outdoor-dark for outdoor in dark mode", () => {
    expect(resolveTheme({ v: 1, base: "outdoor" }, "dark").flavorName).toBe("outdoor-dark");
  });

  it("fills marker and route from the platform defaults", () => {
    const { marker, route } = resolveTheme({ v: 1, base: "muted" }, "light");
    expect(marker).toEqual(DEFAULT_MARKER);
    expect(route).toEqual(DEFAULT_ROUTE);
  });

  it("honours partial marker/route overrides per half", () => {
    const doc: ThemeDoc = {
      v: 1,
      base: "base",
      light: { route: { width: 6 } },
      dark: { marker: { color: "#00FF00" } },
    };
    const light = resolveTheme(doc, "light");
    expect(light.route.width).toBe(6);
    expect(light.route.color).toBe(DEFAULT_ROUTE.color);
    expect(light.marker).toEqual(DEFAULT_MARKER);
    const dark = resolveTheme(doc, "dark");
    expect(dark.marker.color).toBe("#00FF00");
    expect(dark.marker.scale).toBe(DEFAULT_MARKER.scale);
    expect(dark.route).toEqual(DEFAULT_ROUTE);
  });

  it("applies basemap overrides to the resolved flavor", () => {
    const doc: ThemeDoc = { v: 1, base: "base", light: { basemap: { water: "#0000FF" } } };
    expect(resolveTheme(doc, "light").flavor.water).toBe("#0000FF");
    expect(resolveTheme(doc, "dark").flavor.water).toBe(RECIPES.base.dark.water);
  });
});
