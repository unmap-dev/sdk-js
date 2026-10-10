import { describe, it, expect } from "vitest";
import { classify, outputValues, resolveOutputHeader, OUTPUT_COLUMNS } from "./output";
import type { GeocodeResult } from "../index";

const result = (over: Partial<GeocodeResult> = {}): GeocodeResult => ({
  id: "1",
  name: "101 17 Avenue SW, Calgary",
  layer: "address",
  lng: -114.073,
  lat: 51.036,
  score: 100,
  source: "openaddresses",
  match_type: "exact",
  precision: "point",
  ...over,
});

describe("resolveOutputHeader", () => {
  it("appends its columns after the customer's", () => {
    const { header, renamed } = resolveOutputHeader(["address", "city"]);
    expect(header.slice(0, 2)).toEqual(["address", "city"]);
    expect(header.slice(2)).toEqual([...OUTPUT_COLUMNS]);
    expect(renamed).toEqual([]);
  });

  it("suffixes rather than overwrites when the file already has one", () => {
    // Running the tool on its own output is a thing people do; refusing would strand them and
    // overwriting would destroy the earlier run.
    const { header, renamed } = resolveOutputHeader(["address", "unmap_status"]);
    expect(header).toContain("unmap_status_2");
    expect(header.filter((h) => h === "unmap_status")).toHaveLength(1);
    expect(renamed).toEqual([{ column: "unmap_status", to: "unmap_status_2" }]);
  });

  it("keeps counting when the suffixed name is taken too", () => {
    const { header } = resolveOutputHeader(["unmap_id", "unmap_id_2"]);
    expect(header).toContain("unmap_id_3");
  });

  it("compares case-insensitively, because spreadsheets do", () => {
    const { renamed } = resolveOutputHeader(["UNMAP_STATUS"]);
    expect(renamed.map((r) => r.column)).toEqual(["unmap_status"]);
  });
});

describe("classify", () => {
  it("passes a clean exact match", () => {
    expect(classify([result()])).toEqual({ status: "matched", reasons: [] });
  });

  it("sends an empty answer to review as a no-match, not as an error", () => {
    expect(classify([])).toEqual({ status: "no_match", reasons: ["no_match"] });
  });

  it("flags a fallback and carries the result's own reasons through", () => {
    const { status, reasons } = classify([
      result({ layer: "street", match_type: "fallback", match_reasons: ["housenumber_not_matched"] }),
    ]);
    expect(status).toBe("review");
    expect(reasons).toEqual(["fallback_match", "housenumber_not_matched"]);
  });

  it("flags a near-tie between the top two", () => {
    const { reasons } = classify([result({ score: 100 }), result({ id: "2", score: 98 })]);
    expect(reasons).toContain("ambiguous");
  });

  it("does not flag a clear winner", () => {
    const { status } = classify([result({ score: 100 }), result({ id: "2", score: 40 })]);
    expect(status).toBe("matched");
  });

  it("does not call a row ambiguous when there are no scores to compare", () => {
    const { status } = classify([result({ score: undefined }), result({ id: "2", score: undefined })]);
    expect(status).toBe("matched");
  });
});

describe("outputValues", () => {
  it("writes one value per column, in order", () => {
    const values = outputValues("matched", [], result());
    expect(values).toHaveLength(OUTPUT_COLUMNS.length);
    expect(values[0]).toBe("matched");
    expect(values[1]).toBe("1");
    expect(values[5]).toBe("address");
  });

  it("writes coordinates a spreadsheet can read, not a float repr", () => {
    const values = outputValues("matched", [], result({ lng: 51.04000000000001, lat: -114.0 }));
    expect(values[3]).toBe("51.04");
    expect(values[4]).toBe("-114");
  });

  it("leaves every result column empty when there is no result", () => {
    const values = outputValues("no_match", ["no_match"], undefined);
    expect(values[0]).toBe("no_match");
    expect(values.slice(1, 9)).toEqual(["", "", "", "", "", "", "", ""]);
    expect(values[9]).toBe("no_match");
  });

  it("joins several reasons into one readable cell", () => {
    const values = outputValues("review", ["fallback_match", "housenumber_not_matched"], result());
    expect(values[9]).toBe("fallback_match housenumber_not_matched");
  });
});
