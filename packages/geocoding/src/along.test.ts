import { describe, expect, it } from "vitest";
import { PLACES_ALONG, alongLimit, alongRadius, checkAlongLine, lineLengthMeters } from "./along";

const line = (coordinates: unknown) => ({ type: "LineString", coordinates });

describe("checkAlongLine", () => {
  it("accepts a LineString in Canada and measures it", () => {
    const r = checkAlongLine(line([[-114.07, 51.04], [-114.07, 51.05]]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lengthMeters).toBeGreaterThan(1100);
    if (r.ok) expect(r.lengthMeters).toBeLessThan(1125);
  });

  it("drops a third coordinate rather than refusing it", () => {
    const r = checkAlongLine(line([[-114.07, 51.04, 1050], [-114.07, 51.05, 1060]]));
    expect(r.ok && r.line).toEqual([[-114.07, 51.04], [-114.07, 51.05]]);
  });

  it("refuses anything that is not a LineString, naming what to pass", () => {
    for (const v of [null, "x", { type: "Feature", geometry: line([[0, 0], [1, 1]]) }, { type: "MultiLineString", coordinates: [] }]) {
      const r = checkAlongLine(v);
      expect(r).toMatchObject({ ok: false, status: 400, code: "bad_request" });
      if (!r.ok) expect(r.error).toContain("LineString");
    }
  });

  it("refuses short, malformed and non-WGS84 coordinates with a 400", () => {
    expect(checkAlongLine(line([[-114, 51]]))).toMatchObject({ ok: false, status: 400 });
    expect(checkAlongLine(line([[-114, 51], ["a", 51]]))).toMatchObject({ ok: false, status: 400 });
    expect(checkAlongLine(line([[-114, 51], [-114, Number.NaN]]))).toMatchObject({ ok: false, status: 400 });
    expect(checkAlongLine(line([[-114, 51], [-114, 91]]))).toMatchObject({ ok: false, status: 400 });
  });

  it("caps vertices and length", () => {
    const many = Array.from({ length: PLACES_ALONG.maxVertices + 1 }, (_, i) => [-114.07, 51.04 + i * 1e-6]);
    expect(checkAlongLine(line(many))).toMatchObject({ ok: false, status: 400 });
    // Calgary to Red Deer is ~140 km.
    const long = checkAlongLine(line([[-114.07, 51.04], [-113.81, 52.27]]));
    expect(long).toMatchObject({ ok: false, status: 400 });
    if (!long.ok) expect(long.error).toMatch(/at most 100 km/);
  });

  it("is a 422 when any vertex, not just an end, leaves Canada", () => {
    // Windsor -> through Detroit -> back into Ontario: both ends Canadian.
    const r = checkAlongLine(line([[-83.03, 42.31], [-83.05, 42.33], [-83.0, 42.3]]));
    expect(r).toMatchObject({ ok: false, status: 422, code: "outside_coverage" });
  });
});

describe("alongRadius / alongLimit", () => {
  it("defaults, clamps radius and rejects a bad limit", () => {
    expect(alongRadius(undefined)).toBe(50);
    expect(alongRadius(1)).toBe(10);
    expect(alongRadius(9999)).toBe(500);
    expect(alongRadius("35")).toBeNull();
    expect(alongLimit(undefined)).toBe(50);
    expect(alongLimit(200)).toBe(200);
    expect(alongLimit(201)).toBeNull();
    expect(alongLimit(0)).toBeNull();
    expect(alongLimit(2.5)).toBeNull();
  });
});

describe("lineLengthMeters", () => {
  it("is zero for a repeated point", () => {
    expect(lineLengthMeters([[-114, 51], [-114, 51]])).toBe(0);
  });
});
