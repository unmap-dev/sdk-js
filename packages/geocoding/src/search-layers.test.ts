import { describe, it, expect } from "vitest";
import { parseSearchLayers, parseFocus, CIVIC_SEARCH_LAYERS } from "./search-layers";

describe("parseSearchLayers", () => {
  it("treats absence and emptiness as no filter", () => {
    expect(parseSearchLayers(undefined)).toEqual({ kind: "none" });
    expect(parseSearchLayers("")).toEqual({ kind: "none" });
    expect(parseSearchLayers("  ,  ")).toEqual({ kind: "none" });
  });

  it("accepts every civic layer and preserves order without duplicates", () => {
    expect(parseSearchLayers(CIVIC_SEARCH_LAYERS.join(","))).toEqual({
      kind: "civic",
      layers: [...CIVIC_SEARCH_LAYERS],
    });
    expect(parseSearchLayers("poi, address ,poi")).toEqual({ kind: "civic", layers: ["poi", "address"] });
  });

  it("still routes the energy values to the energy corpus", () => {
    expect(parseSearchLayers("well,facility")).toEqual({ kind: "energy", layers: ["well", "facility"] });
  });

  it("refuses to guess at a mix of the two", () => {
    const r = parseSearchLayers("address,well");
    expect("error" in r && r.error).toMatch(/cannot mix/);
  });

  it("rejects an unknown value rather than dropping it", () => {
    // The old behaviour dropped it silently, so a typo searched everything and looked fine.
    const r = parseSearchLayers("adress");
    expect("error" in r && r.error).toMatch(/unknown layer "adress"/);
    expect("error" in r && r.error).toMatch(/address, street, locality, region, poi/);
  });
});

describe("parseFocus", () => {
  it("parses lng,lat", () => {
    expect(parseFocus("-114.07,51.04")).toEqual({ focus: [-114.07, 51.04] });
    expect(parseFocus(" -114.07 , 51.04 ")).toEqual({ focus: [-114.07, 51.04] });
  });

  it("is absent when not supplied", () => {
    expect(parseFocus(undefined)).toBeUndefined();
    expect(parseFocus("")).toBeUndefined();
  });

  it("rejects the wrong shape", () => {
    for (const bad of ["abc", "-114.07", "-114,51,0", "-114,"]) {
      const r = parseFocus(bad);
      expect(r && "error" in r).toBe(true);
    }
  });

  it("rejects coordinates outside the world, and names which one", () => {
    const lng = parseFocus("-200,51");
    expect(lng && "error" in lng && lng.error).toMatch(/longitude/);
    const lat = parseFocus("-114,95");
    expect(lat && "error" in lat && lat.error).toMatch(/latitude/);
  });

  it("does not reject a point outside Canada", () => {
    // focus only tilts ranking. A caller whose map is over Detroit gets Windsor first, which is
    // the right answer, and rejecting the point would just be wrong about what focus does.
    expect(parseFocus("-83.05,42.33")).toEqual({ focus: [-83.05, 42.33] });
  });
});
