import { afterEach, describe, expect, it, vi } from "vitest";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { doc } from "./fixtures";
import { liftCablesLayer } from "./layers";
import { createDeckOverlay, type DeckOverlayMap } from "./overlay";
import { deckMapOptions } from "./options";
import type { MapOptions } from "maplibre-gl";

/** Just enough of a MapLibre map for the helper: no WebGL, no DOM. */
function fakeMap(antialias: boolean | null = true, styleLoaded = true) {
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const idle: (() => void)[] = [];
  const map = {
    isStyleLoaded: () => styleLoaded,
    once(event: string, fn: () => void) {
      if (event === "idle") idle.push(fn);
      return map;
    },
    addControl(control: unknown) {
      added.push(control);
      return map;
    },
    removeControl(control: unknown) {
      removed.push(control);
      return map;
    },
    getCanvas() {
      return {
        getContext: (type: string) =>
          type === "webgl2" && antialias !== null ? { getContextAttributes: () => ({ antialias }) } : null,
      };
    },
  };
  return { map: map as unknown as DeckOverlayMap, added, removed, fireIdle: () => idle.splice(0).forEach((fn) => fn()) };
}

// The overlay's interleaved flag and props are private; tests read them through this view.
type Inside = { _interleaved: boolean; _props: { layers?: unknown[] } };
const inside = (o: unknown) => o as Inside;

afterEach(() => vi.restoreAllMocks());

describe("deckMapOptions", () => {
  it("turns antialiasing on through MapLibre 6's canvasContextAttributes", () => {
    expect(deckMapOptions).toEqual({ canvasContextAttributes: { antialias: true } });
  });

  it("fits createMap's `maplibre` passthrough (Partial<MapOptions>)", () => {
    const passthrough: Partial<MapOptions> = deckMapOptions;
    expect(passthrough.canvasContextAttributes?.antialias).toBe(true);
  });
});

describe("createDeckOverlay", () => {
  it("adds one interleaved MapLibreOverlay to the map", () => {
    const { map, added } = fakeMap();
    const handle = createDeckOverlay(map);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(MapLibreOverlay);
    expect(handle.overlay).toBe(added[0]);
    expect(inside(handle.overlay)._interleaved).toBe(true);
  });

  it("stays interleaved even when asked otherwise (one WebGL context)", () => {
    const { map } = fakeMap();
    const handle = createDeckOverlay(map, { interleaved: false } as never);
    expect(inside(handle.overlay)._interleaved).toBe(true);
  });

  it("starts with the layers given and replaces them with setLayers", () => {
    const { map } = fakeMap();
    const cables = liftCablesLayer(doc);
    const handle = createDeckOverlay(map, { layers: [cables] });
    expect(inside(handle.overlay)._props.layers).toEqual([cables]);
    const wider = liftCablesLayer(doc, { width: 4 });
    handle.setLayers([wider]);
    expect(inside(handle.overlay)._props.layers).toEqual([wider]);
    handle.setLayers([]);
    expect(inside(handle.overlay)._props.layers).toEqual([]);
  });

  it("re-applies its layers once the map is idle when tiles were still loading", () => {
    // @deck.gl/maplibre only adds interleaved layers while map.isStyleLoaded() is true, which is
    // false while any tile is loading, and retries only on styledata: a flight's tiles never fire it.
    const { map, fireIdle } = fakeMap(true, false);
    const deck = createDeckOverlay(map);
    const setProps = vi.spyOn(deck.overlay, "setProps");
    deck.setLayers([liftCablesLayer(doc)]);
    setProps.mockClear();
    fireIdle();
    expect(setProps).toHaveBeenCalledWith({ layers: [expect.objectContaining({ id: "unmap-lift-cables" })] });
  });

  it("removes the overlay from the map once", () => {
    const { map, removed } = fakeMap();
    const handle = createDeckOverlay(map);
    handle.remove();
    handle.remove();
    expect(removed).toEqual([handle.overlay]);
  });

  it("warns once per map when the map was created without antialiasing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { map } = fakeMap(false);
    createDeckOverlay(map).remove();
    createDeckOverlay(map).remove();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("deckMapOptions");

    createDeckOverlay(fakeMap(false).map);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not warn when the map has antialiasing, or when it cannot tell", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createDeckOverlay(fakeMap(true).map);
    createDeckOverlay(fakeMap(null).map);
    expect(warn).not.toHaveBeenCalled();
  });
});
