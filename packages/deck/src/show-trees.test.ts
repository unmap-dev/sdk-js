import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKI_TREE_CLEARANCE, TREES_MIN_ZOOM, showTrees } from "./show-trees";
import { tileAt, tileBounds } from "./trees";
import type { DeckOverlayMap } from "./overlay";

// A z14 tile on Sunshine Village's slopes, and a square of woods over all of it.
const TILE = tileAt(-115.78, 51.08);
const [W, S, E, N] = tileBounds(TILE);
const CENTRE = { lng: (W + E) / 2, lat: (S + N) / 2 };
const woods = { type: "Polygon", coordinates: [[[W - 0.01, S - 0.01], [E + 0.01, S - 0.01], [E + 0.01, N + 0.01], [W - 0.01, N + 0.01], [W - 0.01, S - 0.01]]] };

type Query = { sourceLayer: string; filter?: unknown };

/** Just enough of a MapLibre map for the trees: one wooded tile on land, no WebGL. */
function fakeMap(options: { zoom?: number; antialias?: boolean; sources?: string[]; features?: Record<string, Array<{ geometry: unknown; properties?: Record<string, unknown> }>> } = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const queries: Array<{ source: string } & Query> = [];
  const sources = new Set(options.sources ?? ["unmap"]);
  const features = { "unmap/landuse": [{ geometry: woods }], "unmap/earth": [{ geometry: woods }], ...options.features };
  const map = {
    getZoom: () => options.zoom ?? 15,
    getBounds: () => ({ getWest: () => W - 1, getSouth: () => S - 1, getEast: () => E + 1, getNorth: () => N + 1 }),
    unproject: () => CENTRE,
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600, getContext: () => ({ getContextAttributes: () => ({ antialias: options.antialias ?? true }) }) }),
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    querySourceFeatures(source: string, query: Query) {
      queries.push({ source, ...query });
      return features[`${source}/${query.sourceLayer}` as keyof typeof features] ?? [];
    },
    queryTerrainElevation: () => 2000,
    getStyle: () => ({ layers: [{ id: "earth", type: "fill" }, { id: "places", type: "symbol" }] }),
    isStyleLoaded: () => true,
    on(event: string, fn: () => void) {
      (listeners[event] ??= []).push(fn);
      return map;
    },
    off(event: string, fn: () => void) {
      listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
      return map;
    },
    once: () => map,
    addControl(control: unknown) {
      added.push(control);
      return map;
    },
    removeControl(control: unknown) {
      removed.push(control);
      return map;
    },
  };
  return { map: map as unknown as DeckOverlayMap, added, removed, queries, listeners };
}

/** The layers the overlay holds now. */
const layersOf = (overlay: unknown) => ((overlay as { _props: { layers?: unknown[] } })._props.layers ?? []) as Array<{ id: string; props: { beforeId?: string; data: { length: number } } }>;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("showTrees", () => {
  it("draws a wooded tile as one mesh layer under the labels, and counts its trees", () => {
    const { map, added } = fakeMap();
    const counts: number[] = [];
    const stop = showTrees(map, { onCount: (n) => counts.push(n) });
    expect(added).toHaveLength(1);
    const layers = layersOf(added[0]);
    expect(layers.map((layer) => layer.id)).toContain(`unmap-trees-${TILE.z}/${TILE.x}/${TILE.y}`);
    expect(layers.every((layer) => layer.props.beforeId === "places")).toBe(true);
    expect(counts.at(-1)).toBeGreaterThan(5000);
    stop();
  });

  it("draws nothing below the trees' zoom", () => {
    const { map, added } = fakeMap({ zoom: TREES_MIN_ZOOM - 0.5 });
    const counts: number[] = [];
    showTrees(map, { onCount: (n) => counts.push(n) });
    expect(layersOf(added[0])).toEqual([]);
    expect(counts).toEqual([0]);
  });

  it("stops at the budget", () => {
    const { map, added } = fakeMap();
    showTrees(map, { budget: 10 });
    expect(layersOf(added[0])).toEqual([]);
  });

  it("clears the ski overlay's runs and lifts only when the map has the overlay", () => {
    const run = { geometry: { type: "LineString", coordinates: [[CENTRE.lng, S - 0.01], [CENTRE.lng, N + 0.01]] }, properties: { piste_type: "downhill" } };
    const plain = fakeMap();
    showTrees(plain.map);
    expect(plain.queries.some((query) => query.source === "overlay:ski")).toBe(false);

    const counts: number[] = [];
    const ski = fakeMap({ sources: ["unmap", "overlay:ski"], features: { "overlay:ski/runs": [run] } });
    showTrees(ski.map, { onCount: (n) => counts.push(n) });
    expect(ski.queries.filter((query) => query.source === "overlay:ski").map((query) => query.sourceLayer).sort()).toEqual(["lifts", "runs"]);
    const full: number[] = [];
    showTrees(fakeMap().map, { onCount: (n) => full.push(n) });
    // A 44 m cut down the middle of a tile about 1.5 km wide.
    expect(counts.at(-1)!).toBeLessThan(full.at(-1)!);
    expect(SKI_TREE_CLEARANCE.map((clearance) => clearance.sourceLayer)).toEqual(["runs", "lifts"]);
  });

  it("takes extra lines to keep trees off, in place of the ski overlay's", () => {
    const { map, queries } = fakeMap({ sources: ["unmap", "overlay:ski", "trails"] });
    showTrees(map, { clear: [{ source: "trails", sourceLayer: "paths", radiusM: 3 }] });
    expect(queries.some((query) => query.source === "trails" && query.sourceLayer === "paths")).toBe(true);
    expect(queries.some((query) => query.source === "overlay:ski")).toBe(false);
  });

  it("needs no antialiased map, and does not warn about one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { map, added } = fakeMap({ antialias: false });
    showTrees(map);
    expect(added).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("takes its layers and its idle listener off when stopped", () => {
    const { map, removed, listeners } = fakeMap();
    const stop = showTrees(map);
    expect(listeners.idle).toHaveLength(1);
    stop();
    expect(listeners.idle).toHaveLength(0);
    expect(removed).toHaveLength(1);
    stop();
  });
});
