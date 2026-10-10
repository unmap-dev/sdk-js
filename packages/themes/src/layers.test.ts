import { describe, it, expect } from "vitest";
import { layers as protomapsLayers } from "@protomaps/basemaps";
import { LAYER_GROUPS, type LayerGroup } from "./doc";
import { resolveTheme } from "./compose";
import { STYLE_THEMES } from "./presets";
import { THEME_BASES } from "./recipe";
import {
  BUILDINGS_3D_LAYER_ID,
  DEFAULT_LAYER_VISIBILITY,
  applyThemeLayers,
  effectiveLayerOrder,
  isLayerVisible,
  isStockLayers,
  layerGroupOf,
} from "./layers";

type StyleLayer = { id: string; type: string; source?: string; paint?: Record<string, unknown> };

function expanded(base: (typeof THEME_BASES)[number] = "base"): StyleLayer[] {
  return protomapsLayers("unmap", resolveTheme(STYLE_THEMES[base], "light").flavor, {
    lang: "en",
  }) as StyleLayer[];
}

const groupsIn = (ls: StyleLayer[]) => ls.map((l) => layerGroupOf(l));

describe("layerGroupOf", () => {
  it("places every stock layer of every style in a group, background excepted", () => {
    for (const base of THEME_BASES) {
      const strays = expanded(base).filter((l) => l.id !== "background" && layerGroupOf(l) === null);
      expect(strays.map((l) => l.id), base).toEqual([]);
    }
  });

  it("keeps the background out of every group", () => {
    expect(layerGroupOf({ id: "background", type: "background" })).toBeNull();
  });

  it("files symbols as labels whatever their source, and airport surfaces as land", () => {
    const ls = expanded();
    const byId = (id: string) => layerGroupOf(ls.find((l) => l.id === id)!);
    expect(byId("pois")).toBe("labels");
    expect(byId("roads_shields")).toBe("labels");
    expect(byId("roads_oneway")).toBe("labels");
    expect(byId("roads_runway")).toBe("land");
    expect(byId("roads_bridges_highway")).toBe("roads");
    expect(byId("roads_rail")).toBe("roads");
    expect(byId("water_river")).toBe("water");
    expect(byId("boundaries_country")).toBe("boundaries");
    expect(byId("buildings")).toBe("buildings");
    expect(byId("landuse_park")).toBe("land");
  });
});

describe("defaults", () => {
  it("draw every group except the extrusions", () => {
    for (const g of LAYER_GROUPS) {
      expect(isLayerVisible(undefined, g)).toBe(g !== "buildings3d");
    }
    expect(effectiveLayerOrder(undefined)).toEqual(LAYER_GROUPS);
  });

  it("recognise a field that changes nothing as stock", () => {
    expect(isStockLayers(undefined)).toBe(true);
    expect(isStockLayers({})).toBe(true);
    expect(isStockLayers({ visible: { labels: true, buildings3d: false }, order: [...LAYER_GROUPS] })).toBe(
      true,
    );
    expect(isStockLayers({ visible: { labels: false } })).toBe(false);
    expect(isStockLayers({ visible: { buildings3d: true } })).toBe(false);
    expect(isStockLayers({ order: [...LAYER_GROUPS].reverse() })).toBe(false);
  });
});

describe("applyThemeLayers", () => {
  const stock = expanded();

  it("returns the very same array for a stock field", () => {
    expect(applyThemeLayers(stock, undefined, "#000000")).toBe(stock);
    expect(applyThemeLayers(stock, { visible: { land: true } }, "#000000")).toBe(stock);
  });

  it("drops a hidden group and leaves everything else in place", () => {
    const out = applyThemeLayers(stock, { visible: { labels: false } }, "#000000");
    expect(out.some((l) => l.type === "symbol")).toBe(false);
    expect(out).toEqual(stock.filter((l) => l.type !== "symbol"));
  });

  it("keeps the background when land is hidden", () => {
    const out = applyThemeLayers(stock, { visible: { land: false } }, "#000000");
    expect(out[0]!.id).toBe("background");
    expect(groupsIn(out)).not.toContain("land");
  });

  it("slots the extrusions just under the labels in the stock order", () => {
    const out = applyThemeLayers(stock, { visible: { buildings3d: true } }, "#ABCDEF");
    const at = out.findIndex((l) => l.id === BUILDINGS_3D_LAYER_ID);
    expect(at).toBeGreaterThan(0);
    expect(out.slice(0, at).every((l) => l.type !== "symbol")).toBe(true);
    expect(out[at + 1]!.type).toBe("symbol");
    const extrusion = out[at]!;
    expect(extrusion.type).toBe("fill-extrusion");
    expect(extrusion.source).toBe("unmap");
    expect(extrusion.paint?.["fill-extrusion-color"]).toBe("#ABCDEF");
    // Everything else is untouched.
    expect([...out.slice(0, at), ...out.slice(at + 1)]).toEqual(stock);
  });

  it("regroups under a custom order, stock order within each group", () => {
    const order: LayerGroup[] = ["water", "land", "roads", "boundaries", "buildings", "labels", "buildings3d"];
    const out = applyThemeLayers(stock, { order }, "#000000");
    expect(out[0]!.id).toBe("background");
    const groups = groupsIn(out.slice(1));
    // Each group is one contiguous block, blocks in the requested order (buildings3d hidden).
    const blocks = groups.filter((g, i) => i === 0 || g !== groups[i - 1]);
    expect(blocks).toEqual(["water", "land", "roads", "boundaries", "buildings", "labels"]);
    // Within a group the stock relative order survives.
    const roads = out.filter((l) => layerGroupOf(l) === "roads").map((l) => l.id);
    expect(roads).toEqual(stock.filter((l) => layerGroupOf(l) === "roads").map((l) => l.id));
    expect(out).toHaveLength(stock.length);
  });

  it("places the extrusions where a custom order says", () => {
    const order: LayerGroup[] = ["land", "water", "buildings", "roads", "boundaries", "labels", "buildings3d"];
    const out = applyThemeLayers(stock, { order, visible: { buildings3d: true } }, "#000000");
    expect(out[out.length - 1]!.id).toBe(BUILDINGS_3D_LAYER_ID);
    expect(out).toHaveLength(stock.length + 1);
  });

  it("combines hiding and reordering", () => {
    const out = applyThemeLayers(
      stock,
      { order: [...LAYER_GROUPS].reverse(), visible: { water: false, boundaries: false } },
      "#000000",
    );
    const groups = new Set(groupsIn(out));
    expect(groups.has("water")).toBe(false);
    expect(groups.has("boundaries")).toBe(false);
    // Reversed: labels first after the background, land last.
    expect(layerGroupOf(out[1]!)).toBe("labels");
    expect(layerGroupOf(out[out.length - 1]!)).toBe("land");
  });

  it("never touches the input array", () => {
    const before = stock.map((l) => l.id);
    applyThemeLayers(stock, { order: [...LAYER_GROUPS].reverse(), visible: { labels: false } }, "#000");
    expect(stock.map((l) => l.id)).toEqual(before);
  });

  it("stock visibility table matches the group list", () => {
    expect(Object.keys(DEFAULT_LAYER_VISIBILITY).sort()).toEqual([...LAYER_GROUPS].sort());
  });
});
