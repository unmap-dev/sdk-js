import { describe, expect, it } from "vitest";
import { looksLikeRuralRoute, parseRuralRoute } from "./rural-route";

describe("parseRuralRoute", () => {
  it("reads the spellings Canada Post actually publishes", () => {
    for (const q of ["RR 2 Okotoks", "R.R. 2 Okotoks", "RR#2 Okotoks", "Rural Route 2, Okotoks"]) {
      expect(parseRuralRoute(q), q).toMatchObject({
        kind: "rural-route",
        number: "2",
        remainder: "Okotoks",
      });
    }
  });

  it("normalises the route number so RR 02 and RR 2 are one route", () => {
    expect(parseRuralRoute("RR 02 Okotoks")?.number).toBe("2");
    expect(parseRuralRoute("RR 2 Okotoks")?.number).toBe("2");
  });

  it("handles the other delivery kinds, and leaves general delivery unnumbered", () => {
    expect(parseRuralRoute("SS 1 Vernon")).toMatchObject({ kind: "suburban-service", number: "1" });
    expect(parseRuralRoute("MR 3 Gimli")).toMatchObject({ kind: "mobile-route", number: "3" });
    const gd = parseRuralRoute("General Delivery, Iqaluit");
    expect(gd).toMatchObject({ kind: "general-delivery", remainder: "Iqaluit" });
    expect(gd?.number).toBeUndefined();
  });

  it("pulls the position within the route out of the community name", () => {
    // The whole point: Site 5 Comp 12 must not reach the civic corpus as search terms, or it
    // ranks on the digits and returns something arbitrary.
    expect(parseRuralRoute("RR 1 Site 5 Comp 12 Millarville")).toEqual({
      raw: "RR 1 Site 5 Comp 12 Millarville",
      kind: "rural-route",
      number: "1",
      site: "5",
      compartment: "12",
      remainder: "Millarville",
    });
  });

  it("keeps the retail outlet separate from the community", () => {
    expect(parseRuralRoute("RR 2 STN Main Brandon")).toMatchObject({
      number: "2",
      station: "MAIN",
      remainder: "Brandon",
    });
  });

  it("takes only one word as the station, so a two-word station leaves a word behind", () => {
    // "STN ST LAURENT Montreal" is genuinely ambiguous. The parser keeps the community rather
    // than the full station name, because the community is the part that can be geocoded.
    expect(parseRuralRoute("RR 3 STN St Laurent Montreal")).toMatchObject({
      station: "ST",
      remainder: "Laurent Montreal",
    });
  });

  it("returns an empty remainder when there is no community to look up", () => {
    // Not an error: the caller decides what to do with a query that names a route and nowhere.
    expect(parseRuralRoute("RR 2")?.remainder).toBe("");
    expect(parseRuralRoute("General Delivery")?.remainder).toBe("");
  });

  it("leaves ordinary civic addresses alone", () => {
    for (const q of [
      "17 Ave SW Calgary",
      "123 Main Street",
      "Calgary",
      "Grande Prairie",
      // "Sussex Drive" contains no delivery keyword; a bare "RR" inside a word must not fire.
      "Carrs Landing",
      "Barrhead",
    ]) {
      expect(looksLikeRuralRoute(q), q).toBe(false);
    }
  });

  it("is not fooled by a non-string or an empty query", () => {
    expect(parseRuralRoute("")).toBeNull();
    expect(parseRuralRoute("   ")).toBeNull();
    expect(parseRuralRoute(undefined as unknown as string)).toBeNull();
  });
});
