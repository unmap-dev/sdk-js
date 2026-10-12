import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatTimestamp,
  normalizeKeys,
  parseDuration,
  parseInt64,
  parseTimestamp,
  ProtoJsonError,
} from "../src/index";

describe("parseDuration", () => {
  it("reads whole and fractional seconds", () => {
    expect(parseDuration("123s")).toBe(123);
    expect(parseDuration("1.5s")).toBe(1.5);
    expect(parseDuration("0s")).toBe(0);
    expect(parseDuration("0.000000001s")).toBeCloseTo(1e-9, 15);
    expect(parseDuration("-2s")).toBe(-2);
  });

  it("rejects anything that is not a protobuf duration string", () => {
    for (const bad of ["123", "1.5", "s", "1.s", ".5s", "1m", "1.0000000001s", " 1s", 5, null, {}]) {
      expect(() => parseDuration(bad), String(bad)).toThrow(ProtoJsonError);
    }
  });
});

describe("formatDuration", () => {
  it("writes the canonical protobuf form: 0, 3, 6 or 9 fractional digits", () => {
    expect(formatDuration(123)).toBe("123s");
    expect(formatDuration(1.5)).toBe("1.500s");
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(-0.25)).toBe("-0.250s");
    expect(formatDuration(0.000001)).toBe("0.000001s");
    expect(formatDuration(1e-9)).toBe("0.000000001s");
  });

  it("round trips", () => {
    for (const text of ["0s", "1s", "86400s", "1.500s", "0.001s", "3600.250s"]) {
      expect(formatDuration(parseDuration(text))).toBe(text);
    }
  });

  it("refuses a non-finite number", () => {
    expect(() => formatDuration(Number.NaN)).toThrow(ProtoJsonError);
  });
});

describe("parseTimestamp", () => {
  it("reads RFC 3339 with Z, offsets and fractions", () => {
    expect(parseTimestamp("1970-01-01T00:00:00Z")).toBe(0);
    expect(parseTimestamp("1971-01-01T00:00:00Z")).toBe(31_536_000);
    expect(parseTimestamp("2026-10-12T08:00:00Z")).toBe(1_791_792_000);
    expect(parseTimestamp("2026-10-12T04:00:00-04:00")).toBe(1_791_792_000);
    expect(parseTimestamp("2026-10-12T08:00:00.5Z")).toBe(1_791_792_000.5);
    expect(parseTimestamp("2026-10-12t08:00:00z")).toBe(1_791_792_000);
  });

  it("reads the {seconds, nanos} object form with int64 seconds as string or number", () => {
    expect(parseTimestamp({ seconds: "1791792000" })).toBe(1_791_792_000);
    expect(parseTimestamp({ seconds: 1_791_792_000, nanos: 250_000_000 })).toBe(1_791_792_000.25);
    expect(parseTimestamp({})).toBe(0);
  });

  it("rejects malformed timestamps", () => {
    for (const bad of [
      "2026-10-12",
      "2026-10-12T08:00:00",
      "2026-02-30T00:00:00Z",
      "2026-10-12T24:00:00Z",
      "2026-10-12T08:00:00.1234567891Z",
      { seconds: "x" },
      { seconds: 1, nanos: 1_000_000_000 },
      { seconds: 1, extra: 1 },
      1_791_792_000,
    ]) {
      expect(() => parseTimestamp(bad), JSON.stringify(bad)).toThrow(ProtoJsonError);
    }
  });
});

describe("formatTimestamp", () => {
  it("writes RFC 3339 in UTC with Z", () => {
    expect(formatTimestamp(0)).toBe("1970-01-01T00:00:00Z");
    expect(formatTimestamp(1_791_792_000)).toBe("2026-10-12T08:00:00Z");
    expect(formatTimestamp(1_791_792_000.5)).toBe("2026-10-12T08:00:00.500Z");
  });

  it("round trips", () => {
    for (const text of ["1970-01-01T00:00:00Z", "2026-10-12T08:00:00Z", "2026-10-12T08:00:00.250Z"]) {
      expect(formatTimestamp(parseTimestamp(text))).toBe(text);
    }
  });
});

describe("parseInt64", () => {
  it("accepts decimal strings and safe integers", () => {
    expect(parseInt64("120")).toBe(120);
    expect(parseInt64("-5")).toBe(-5);
    expect(parseInt64(7)).toBe(7);
    expect(parseInt64("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects unsafe, fractional and non-numeric values", () => {
    for (const bad of ["9007199254740992", 9_007_199_254_740_992, "1.5", 1.5, "", "1e3", " 1", "0x10", true, null]) {
      expect(() => parseInt64(bad), String(bad)).toThrow(ProtoJsonError);
    }
  });
});

describe("normalizeKeys", () => {
  it("turns snake_case field names into camelCase, recursively", () => {
    const { value, conflicts } = normalizeKeys({
      solving_mode: "VALIDATE_ONLY",
      model: { global_start_time: "x", shipments: [{ penalty_cost: 1, time_windows: [{ start_time: "y" }] }] },
    });
    expect(conflicts).toEqual([]);
    expect(value).toEqual({
      solvingMode: "VALIDATE_ONLY",
      model: { globalStartTime: "x", shipments: [{ penaltyCost: 1, timeWindows: [{ startTime: "y" }] }] },
    });
  });

  it("leaves map keys and string values alone but normalizes the values under map keys", () => {
    const { value } = normalizeKeys({
      load_demands: { weight_kg: { amount: "3" } },
      load_limits: { cold_chain: { max_load: "10", soft_max_load: "5" } },
      label: "snake_case_label",
    });
    expect(value).toEqual({
      loadDemands: { weight_kg: { amount: "3" } },
      loadLimits: { cold_chain: { maxLoad: "10", softMaxLoad: "5" } },
      label: "snake_case_label",
    });
  });

  it("reports both spellings of one field in the same object as a conflict", () => {
    const { conflicts } = normalizeKeys({ model: { shipments: [{ penalty_cost: 1, penaltyCost: 1 }] } });
    expect(conflicts).toEqual([{ path: "model.shipments[0].penaltyCost", names: ["penalty_cost", "penaltyCost"] }]);
  });

  it("does not mutate its input", () => {
    const input = { solving_mode: "DEFAULT_SOLVE" };
    normalizeKeys(input);
    expect(input).toEqual({ solving_mode: "DEFAULT_SOLVE" });
  });
});

describe("normalizeKeys and prototype keys", () => {
  it("keeps a __proto__ key as an own property, in a message and in a map, never as the prototype", () => {
    const raw = JSON.parse('{"model":{"__proto__":{"shipments":[1]}},"loadDemands":{"__proto__":{"weight":{"amount":5}}}}') as unknown;
    const { value } = normalizeKeys(raw);
    const out = value as { model: Record<string, unknown>; loadDemands: Record<string, unknown> };
    expect(Object.getPrototypeOf(out.model)).toBe(Object.prototype);
    expect(out.model.shipments).toBeUndefined();
    // As a field name it is snake_case-normalized like any other (to `_Proto__`): an own, unknown field.
    expect(Object.keys(out.model)).toHaveLength(1);
    expect(Object.getPrototypeOf(out.loadDemands)).toBe(Object.prototype);
    expect(Object.keys(out.loadDemands)).toEqual(["__proto__"]);
    expect((out.loadDemands as { weight?: unknown }).weight).toBeUndefined();
  });
});
