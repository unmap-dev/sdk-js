import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `createMap` is a thin wrapper, but the option merge order in it is a real contract: our
 * defaults must apply without ever taking precedence over what the caller passed. Constructing a
 * real map needs a DOM and WebGL, so the constructor is mocked and we assert on what it received.
 */
/**
 * A hand-rolled stand-in for the attribution element, so this file stays free of jsdom — the repo
 * deliberately runs no DOM environment anywhere, and pulling one in to observe a single class
 * removal would be a large dependency for a small assertion.
 *
 * It models only what `collapseAttribution` touches: a class set, and a `querySelector` that
 * matches a compound `.a.b` selector the way a browser would.
 */
function fakeAttrib(classes: string[]) {
  const set = new Set(classes);
  return {
    classList: {
      remove: (c: string) => set.delete(c),
      contains: (c: string) => set.has(c),
    },
    matches: (sel: string) =>
      sel
        .split(".")
        .filter(Boolean)
        .every((c) => set.has(c)),
  };
}

let lastAttrib: ReturnType<typeof fakeAttrib>;
/** Every `addControl` call of the most recent map, as [control, position] pairs. */
let added: [unknown, string | undefined][];
/** Every `setProjection` call of the most recent map. */
let projections: unknown[];
const NavigationControlMock = vi.fn(function (options?: Record<string, unknown>) {
  return { kind: "navigation", options };
});
const MapMock = vi.fn(function (_options: Record<string, unknown>) {
  // What MapLibre's `_updateCompact` produces for `compact: true`: both classes, together.
  lastAttrib = fakeAttrib([
    "maplibregl-ctrl-attrib",
    "maplibregl-compact",
    "maplibregl-compact-show",
  ]);
    added = [];
    projections = [];
  return {
    getContainer: () => ({
      querySelector: (sel: string) => (lastAttrib.matches(sel) ? lastAttrib : null),
    }),
    once: (_e: string, cb: () => void) => cb(),
    addControl: (control: unknown, position?: string) => added.push([control, position]),
    setProjection: (projection: unknown) => projections.push(projection),
  };
});
vi.mock("maplibre-gl", () => ({
  Map: MapMock,
  NavigationControl: NavigationControlMock,
  default: { Map: MapMock, NavigationControl: NavigationControlMock },
}));

const { createMap } = await import("./index");

const optionsFromLastCall = () => MapMock.mock.calls.at(-1)![0];

beforeEach(() => {
  MapMock.mockClear();
  NavigationControlMock.mockClear();
  delete (globalThis as { window?: unknown }).window;
});

describe("createMap", () => {
  it("accepts a CSS selector as the container, not only an id", () => {
    // MapLibre resolves a string container with getElementById, so `"#map"` — the first thing a
    // developer reaches for — would throw. With a document present, an id passes through and a
    // selector is resolved to its element; an unknown string is left for MapLibre to report.
    const el = { id: "map" };
    const doc = {
      getElementById: (id: string) => (id === "map" ? el : null),
      querySelector: (sel: string) => (sel === "#map" ? el : null),
    };
    (globalThis as { document?: unknown }).document = doc;
    try {
      createMap({ key: "k", container: "map" });
      expect(optionsFromLastCall().container).toBe("map");
      createMap({ key: "k", container: "#map" });
      expect(optionsFromLastCall().container).toBe(el);
      createMap({ key: "k", container: "#nope" });
      expect(optionsFromLastCall().container).toBe("#nope");
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  it("frames a city when given a center and no zoom", () => {
    createMap({ key: "k", container: "map", center: [-114, 51] });
    expect(optionsFromLastCall().zoom).toBe(11);
    createMap({ key: "k", container: "map", center: [-114, 51], zoom: 3 });
    expect(optionsFromLastCall().zoom).toBe(3);
    createMap({ key: "k", container: "map" });
    expect(optionsFromLastCall().zoom).toBeUndefined();
  });

  it("compacts the attribution control by default", () => {
    createMap({ key: "k", container: "map" });
    expect(optionsFromLastCall().attributionControl).toEqual({ compact: true });
  });

  // `compact: true` is necessary but NOT sufficient: MapLibre adds `maplibregl-compact` and
  // `maplibregl-compact-show` together, and the CSS shows the attribution text whenever
  // `compact-show` is present. So the option alone renders expanded until the user drags. This
  // asserts the class is actually gone, which is the thing a user can see.
  it("starts the compact attribution collapsed, not merely compact-capable", () => {
    createMap({ key: "k", container: "map" });
    expect(lastAttrib.classList.contains("maplibregl-compact")).toBe(true);
    expect(lastAttrib.classList.contains("maplibregl-compact-show")).toBe(false);
  });

  it("leaves the DOM alone when the caller turned attribution off", () => {
    createMap({ key: "k", container: "map", maplibre: { attributionControl: false } });
    // Nothing to collapse; touching it would be meddling with a control the caller replaced.
    expect(lastAttrib.classList.contains("maplibregl-compact-show")).toBe(true);
  });

  it("lets the caller override any default, attribution included", () => {
    createMap({
      key: "k",
      container: "map",
      maplibre: { attributionControl: { compact: false } },
    });
    // The spread of `maplibre` comes last, so this must win rather than be silently ignored.
    expect(optionsFromLastCall().attributionControl).toEqual({ compact: false });
  });

  it("only sets center and zoom when they were supplied", () => {
    createMap({ key: "k", container: "map" });
    const bare = optionsFromLastCall();
    expect("center" in bare).toBe(false);
    expect("zoom" in bare).toBe(false);

    createMap({ key: "k", container: "map", center: [-114, 51], zoom: 11 });
    const full = optionsFromLastCall();
    expect(full.center).toEqual([-114, 51]);
    expect(full.zoom).toBe(11);
  });

  it("resolves the style through unmapStyle", () => {
    createMap({ key: "k", container: "map", style: "outdoor", gateway: "https://g" });
    expect(optionsFromLastCall().style).toBe("https://g/styles/outdoor.json?key=k");
  });

  it("forwards projection to MapLibre and omits it otherwise", () => {
    // MapLibre 6 has no constructor `projection` option; the style document would also
    // overwrite one. `setProjection` after load is what actually draws a globe.
    createMap({ key: "k", container: "map" });
    expect(projections).toEqual([]);
    expect("projection" in optionsFromLastCall()).toBe(false);

    createMap({ key: "k", container: "map", projection: "globe" });
    expect(projections.length).toBeGreaterThan(0);
    expect(projections.every((p) => JSON.stringify(p) === JSON.stringify({ type: "globe" }))).toBe(true);

    createMap({ key: "k", container: "map", projection: "mercator" });
    expect(projections.every((p) => JSON.stringify(p) === JSON.stringify({ type: "mercator" }))).toBe(true);
  });

  // Navigation is on by default: a map with no zoom affordance is a map a visitor with a
  // trackpad and no scroll habit cannot move, and every competitor ships one.
  it("adds a navigation control by default", () => {
    createMap({ key: "k", container: "map" });
    expect(added).toEqual([[{ kind: "navigation", options: undefined }, "top-right"]]);
  });

  it("adds nothing when the caller opts out", () => {
    createMap({ key: "k", container: "map", controls: false });
    expect(added).toEqual([]);
    expect(NavigationControlMock).not.toHaveBeenCalled();
  });

  it("takes a position from the caller", () => {
    createMap({ key: "k", container: "map", controls: { position: "bottom-left" } });
    expect(added).toEqual([[{ kind: "navigation", options: undefined }, "bottom-left"]]);
  });

  // `controls: {}` and `controls: true` both mean "yes, with the defaults" — an object that
  // only carries a position must not read as a request for something other than navigation.
  it("treats an empty object and true alike", () => {
    createMap({ key: "k", container: "map", controls: {} });
    createMap({ key: "k", container: "map", controls: true });
    expect(added).toEqual([[{ kind: "navigation", options: undefined }, "top-right"]]);
    expect(NavigationControlMock).toHaveBeenCalledTimes(2);
  });
});
