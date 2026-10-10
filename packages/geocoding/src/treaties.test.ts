import { describe, expect, it } from "vitest";
import {
  isTreatiesVersion,
  orderTreatyMatches,
  parseInclude,
  parseTreatiesVersion,
  parseTreatyContext,
  pickTreatyLabel,
  unavailableTreatyContext,
  type TreatyContext,
  type TreatyMatch,
} from "./treaties";

function match(over: Partial<TreatyMatch> = {}): TreatyMatch {
  return {
    id: "synthetic.test:A",
    source_id: "synthetic.test",
    source_record_id: "A",
    category: "historic",
    name: "Synthetic A",
    name_lang: "en",
    names: { en: "Synthetic A" },
    geography_kind: "treaty_area",
    representation: "unspecified",
    source_url: "https://example.test/a",
    ...over,
  };
}

function context(over: Partial<TreatyContext> = {}): TreatyContext {
  return {
    schema_version: 1,
    dataset_version: "2026-09-22.0123456789ab",
    status: "ok",
    point: { lng: 0, lat: 0, basis: "input_point" },
    coverage: { scope: "Canada", completeness: "partial" },
    matches: [],
    notice_code: "source_limitations_apply",
    ...over,
  };
}

describe("parseInclude", () => {
  const none = { treaties: false, territories: false, acknowledgements: false };

  it("treats absence and emptiness as nothing extra", () => {
    expect(parseInclude(undefined)).toEqual(none);
    expect(parseInclude("")).toEqual(none);
    expect(parseInclude(" , ")).toEqual(none);
  });

  it("accepts treaties, trimmed and repeated", () => {
    expect(parseInclude("treaties")).toEqual({ ...none, treaties: true });
    expect(parseInclude(" treaties ,treaties")).toEqual({ ...none, treaties: true });
  });

  it("rejects anything else, including the spec's old name", () => {
    for (const raw of ["unknown", "indigenous", "Treaties"]) {
      const r = parseInclude(raw);
      expect("error" in r && r.error).toMatch(/unknown include ".+"\. known: treaties$/);
    }
  });

  it("refuses community values until community context is switched on", () => {
    for (const raw of ["territories", "treaties,acknowledgements"]) {
      const r = parseInclude(raw);
      expect("error" in r && r.error).toMatch(/is not available: no community source has been admitted/);
    }
  });

  it("accepts community values when switched on", () => {
    expect(parseInclude("treaties,territories,acknowledgements", { community: true })).toEqual({
      treaties: true,
      territories: true,
      acknowledgements: true,
    });
    const r = parseInclude("nope", { community: true });
    expect("error" in r && r.error).toMatch(/known: treaties, territories, acknowledgements$/);
  });
});

describe("isTreatiesVersion", () => {
  it("accepts a real date and twelve lowercase hex characters", () => {
    expect(isTreatiesVersion("2026-09-22.000000000001")).toBe(true);
    expect(isTreatiesVersion("2024-02-29.abcdef012345")).toBe(true);
  });

  it("rejects impossible dates, wrong shapes and path tricks", () => {
    for (const bad of [
      "2026-02-30.000000000001",
      "2025-02-29.000000000001",
      "2026-13-01.000000000001",
      "2026-09-22.00000000001",
      "2026-09-22.0000000000011",
      "2026-09-22.ABCDEF012345",
      "2026-9-22.000000000001",
      "../../private",
      "2026-09-22.000000000001/../x",
      "",
    ]) {
      expect(isTreatiesVersion(bad), bad).toBe(false);
    }
  });
});

describe("parseTreatiesVersion", () => {
  it("is optional", () => {
    expect(parseTreatiesVersion(undefined, true)).toEqual({ version: undefined });
    expect(parseTreatiesVersion(undefined, false)).toEqual({ version: undefined });
  });

  it("requires include=treaties", () => {
    const r = parseTreatiesVersion("2026-09-22.000000000001", false);
    expect("error" in r && r.error).toMatch(/requires include=treaties/);
  });

  it("rejects a malformed version before anything is built from it", () => {
    const r = parseTreatiesVersion("../../private", true);
    expect("error" in r && r.error).toMatch(/treaties_version must be/);
  });

  it("passes a well-formed version through", () => {
    expect(parseTreatiesVersion("2026-09-22.000000000001", true)).toEqual({
      version: "2026-09-22.000000000001",
    });
  });
});

describe("pickTreatyLabel", () => {
  it("uses the requested language when the source has it", () => {
    expect(pickTreatyLabel({ en: "Treaty 6 (1876)", fr: "Traité no 6 (1876)" }, "fr")).toEqual({
      text: "Traité no 6 (1876)",
      lang: "fr",
    });
    expect(pickTreatyLabel({ en: "Treaty 6 (1876)", fr: "Traité no 6 (1876)" }, "en")).toEqual({
      text: "Treaty 6 (1876)",
      lang: "en",
    });
  });

  it("falls back to the other language and says so", () => {
    expect(pickTreatyLabel({ en: "Only English" }, "fr")).toEqual({ text: "Only English", lang: "en" });
    expect(pickTreatyLabel({ fr: "Seulement français" }, "en")).toEqual({ text: "Seulement français", lang: "fr" });
  });

  it("treats a region subtag and any other language as its base or as English", () => {
    expect(pickTreatyLabel({ en: "E", fr: "F" }, "fr-CA")).toEqual({ text: "F", lang: "fr" });
    expect(pickTreatyLabel({ en: "E", fr: "F" }, "iu")).toEqual({ text: "E", lang: "en" });
  });

  it("keeps Unicode exactly", () => {
    const name = "Tłı̨chǫ Agreement (2005) - Mǫwhì Gogha Dè Nįįtłèè";
    expect(pickTreatyLabel({ en: name }, "en")?.text).toBe(name);
  });

  it("returns nothing when there is no label, rather than inventing one", () => {
    expect(pickTreatyLabel({}, "en")).toBeUndefined();
    expect(pickTreatyLabel({ en: "  " }, "en")).toBeUndefined();
  });
});

describe("orderTreatyMatches", () => {
  it("puts historic first, then orders by id", () => {
    const out = orderTreatyMatches([
      match({ id: "m:2", category: "modern" }),
      match({ id: "h:b" }),
      match({ id: "m:1", category: "modern" }),
      match({ id: "h:a" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["h:a", "h:b", "m:1", "m:2"]);
  });

  it("collapses a record delivered twice but keeps same-named distinct records", () => {
    const out = orderTreatyMatches([
      match({ id: "s:A", name: "Same" }),
      match({ id: "s:A", name: "Same" }),
      match({ id: "s:B", name: "Same" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["s:A", "s:B"]);
  });
});

describe("parseTreatyContext", () => {
  it("accepts an ok context with matches and an ok context with none", () => {
    expect(parseTreatyContext(context({ matches: [match()] })).matches).toHaveLength(1);
    expect(parseTreatyContext(context()).matches).toEqual([]);
  });

  it("accepts an unavailable context with no version", () => {
    expect(parseTreatyContext(context({ status: "unavailable", dataset_version: null })).status).toBe("unavailable");
  });

  it("refuses ok without a version", () => {
    expect(() => parseTreatyContext(context({ dataset_version: null }))).toThrow(/dataset_version/);
  });

  it("refuses unavailable with matches, so a failure can never carry data", () => {
    expect(() => parseTreatyContext(context({ status: "unavailable", matches: [match()] }))).toThrow(/unavailable/);
  });

  it("refuses non-http source links", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "not a url"]) {
      expect(() => parseTreatyContext(context({ matches: [match({ source_url: url })] })), url).toThrow(/source_url/);
    }
  });

  it("refuses wrong shapes", () => {
    for (const bad of [
      null,
      [],
      { ...context(), schema_version: 2 },
      { ...context(), point: { lng: Number.NaN, lat: 0, basis: "input_point" } },
      { ...context(), point: { lng: 0, lat: 0, basis: "somewhere" } },
      { ...context(), dataset_version: "latest" },
      { ...context(), matches: [{ ...match(), category: "ancient" }] },
    ]) {
      expect(() => parseTreatyContext(bad)).toThrow();
    }
  });
});

describe("unavailableTreatyContext", () => {
  it("is a valid unavailable context for the point it was given", () => {
    const ctx = unavailableTreatyContext({ lng: -114.07, lat: 51.05, basis: "result_point" });
    expect(parseTreatyContext(ctx)).toEqual({
      schema_version: 1,
      dataset_version: null,
      status: "unavailable",
      point: { lng: -114.07, lat: 51.05, basis: "result_point" },
      coverage: { scope: "Canada", completeness: "partial" },
      matches: [],
      notice_code: "source_limitations_apply",
    });
  });
});
