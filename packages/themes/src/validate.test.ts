import { describe, it, expect } from "vitest";
import { validateTheme, ThemeError } from "./validate";
import type { ThemeDoc } from "./doc";

/** Run validateTheme and return the ThemeError detail paths, or null if it validated. */
function detailOf(input: unknown): string[] | null {
  try {
    validateTheme(input);
    return null;
  } catch (e) {
    if (e instanceof ThemeError) return e.detail;
    throw e;
  }
}

const FULL: ThemeDoc = {
  v: 1,
  name: "midnight-copper",
  base: "outdoor",
  light: {
    basemap: { water: "#9CCFD2", roads: { highway: "#FFFFFF" }, labels: { ocean: "#024347" } },
    marker: { color: "#FF3E9A", scale: 1.5 },
    route: {
      color: "#FF3E9A",
      width: 3,
      opacity: 1,
      casingColor: "#FF3E9A",
      casingWidth: 10,
      casingOpacity: 0.2,
    },
  },
  dark: { basemap: { pois: { green: "#50825E" }, landcover: { forest: "#1E4128" } } },
};

describe("validateTheme accepts", () => {
  it("a minimal doc", () => {
    expect(validateTheme({ v: 1, base: "base" })).toEqual({ v: 1, base: "base" });
  });

  it("a full doc with both halves", () => {
    expect(validateTheme(FULL)).toEqual(FULL);
  });

  it("boundary numbers", () => {
    expect(
      detailOf({
        v: 1,
        base: "base",
        light: {
          marker: { scale: 0.5 },
          route: { width: 1, opacity: 0, casingWidth: 0, casingOpacity: 1 },
        },
        dark: { marker: { scale: 2 }, route: { width: 12, casingWidth: 24 } },
      }),
    ).toBeNull();
  });

  it("a 40-char name and 8-digit hex", () => {
    expect(
      detailOf({ v: 1, base: "muted", name: "a".repeat(40), light: { basemap: { water: "#00112233" } } }),
    ).toBeNull();
  });
});

describe("validateTheme rejects", () => {
  it("refuses a retired style name", () => {
    for (const base of ["street", "relief", "decimal"]) {
      expect(() => validateTheme({ v: 1, base })).toThrow(ThemeError);
      expect(detailOf({ v: 1, base }), base).toContainEqual(expect.stringContaining("base: must be one of"));
    }
  });

  it("non-objects", () => {
    for (const bad of [null, [], "x", 7, undefined]) {
      expect(detailOf(bad), JSON.stringify(bad)).not.toBeNull();
    }
  });

  it("wrong version and unknown base", () => {
    expect(detailOf({ v: 2, base: "base" })).toContainEqual(expect.stringContaining("v"));
    expect(detailOf({ v: 1, base: "block" })).toContainEqual(expect.stringContaining("base"));
  });

  it("unknown keys at every depth, naming the path", () => {
    expect(detailOf({ v: 1, base: "base", extra: true })).toContainEqual(
      expect.stringContaining("extra"),
    );
    expect(
      detailOf({ v: 1, base: "base", light: { basemap: { landz: "#000000" } } }),
    ).toContainEqual(expect.stringContaining("light.basemap.landz"));
    expect(
      detailOf({ v: 1, base: "base", light: { basemap: { roads: { warp: "#000000" } } } }),
    ).toContainEqual(expect.stringContaining("light.basemap.roads.warp"));
    expect(detailOf({ v: 1, base: "base", light: { markers: {} } })).toContainEqual(
      expect.stringContaining("light.markers"),
    );
  });

  it("everything that is not a 6/8-digit hex colour", () => {
    for (const bad of ["red", "url(https://evil)", "#FFF", "rgb(0,0,0)", ["interpolate"], {}, 3]) {
      const detail = detailOf({ v: 1, base: "base", light: { basemap: { water: bad } } });
      expect(detail, JSON.stringify(bad)).toContainEqual(expect.stringContaining("light.basemap.water"));
    }
  });

  it("out-of-bounds and non-finite numbers", () => {
    const cases: Array<[string, object]> = [
      ["marker.scale low", { marker: { scale: 0.4 } }],
      ["marker.scale high", { marker: { scale: 2.1 } }],
      ["marker.scale NaN", { marker: { scale: Number.NaN } }],
      ["route.width low", { route: { width: 0 } }],
      ["route.width high", { route: { width: 13 } }],
      ["route.casingWidth low", { route: { casingWidth: -1 } }],
      ["route.casingWidth high", { route: { casingWidth: 25 } }],
      ["route.opacity low", { route: { opacity: -0.1 } }],
      ["route.casingOpacity high", { route: { casingOpacity: 1.1 } }],
      ["route.width Infinity", { route: { width: Infinity } }],
    ];
    for (const [label, half] of cases) {
      expect(detailOf({ v: 1, base: "base", light: half }), label).not.toBeNull();
    }
  });

  it("marker/route colours that are not hex", () => {
    expect(
      detailOf({ v: 1, base: "base", light: { marker: { color: "magenta" } } }),
    ).toContainEqual(expect.stringContaining("light.marker.color"));
    expect(
      detailOf({ v: 1, base: "base", dark: { route: { casingColor: "url(x)" } } }),
    ).toContainEqual(expect.stringContaining("dark.route.casingColor"));
  });

  it("names longer than 40 chars or not strings", () => {
    expect(detailOf({ v: 1, base: "base", name: "a".repeat(41) })).not.toBeNull();
    expect(detailOf({ v: 1, base: "base", name: 7 })).not.toBeNull();
  });

  it("collects every error, not just the first", () => {
    const detail = detailOf({
      v: 1,
      base: "base",
      light: { basemap: { water: "red", roads: { warp: "#000000" } }, route: { width: 99 } },
    });
    expect(detail).not.toBeNull();
    expect(detail!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("validateTheme layers", () => {
  const ORDER = ["labels", "buildings3d", "boundaries", "roads", "buildings", "water", "land"];

  it("accepts visibility, a full order, and an empty field", () => {
    expect(detailOf({ v: 1, base: "base", layers: {} })).toBeNull();
    expect(
      detailOf({ v: 1, base: "base", layers: { visible: { labels: false, buildings3d: true } } }),
    ).toBeNull();
    expect(detailOf({ v: 1, base: "base", layers: { order: ORDER } })).toBeNull();
  });

  it("rejects unknown groups, non-boolean flags, and unknown keys", () => {
    expect(detailOf({ v: 1, base: "base", layers: { visible: { hillshade: false } } })).toContainEqual(
      expect.stringContaining("layers.visible.hillshade"),
    );
    expect(detailOf({ v: 1, base: "base", layers: { visible: { labels: "none" } } })).toContainEqual(
      expect.stringContaining("layers.visible.labels"),
    );
    expect(detailOf({ v: 1, base: "base", layers: { ids: ["water"] } })).toContainEqual(
      expect.stringContaining("layers.ids"),
    );
    expect(detailOf({ v: 1, base: "base", layers: [] })).toContainEqual(
      expect.stringContaining("layers: must be an object"),
    );
  });

  it("rejects an order that is not the full set exactly once", () => {
    expect(detailOf({ v: 1, base: "base", layers: { order: ["labels"] } })).toContainEqual(
      expect.stringContaining("layers.order: must list"),
    );
    expect(detailOf({ v: 1, base: "base", layers: { order: [...ORDER, "land"] } })).toContainEqual(
      expect.stringContaining("layers.order: must list"),
    );
    expect(
      detailOf({ v: 1, base: "base", layers: { order: [...ORDER.slice(0, 6), "hillshade"] } }),
    ).toContainEqual(expect.stringContaining("layers.order[6]"));
    expect(detailOf({ v: 1, base: "base", layers: { order: "labels" } })).toContainEqual(
      expect.stringContaining("layers.order: must be an array"),
    );
  });
});
