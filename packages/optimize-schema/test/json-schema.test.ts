import { readdirSync, readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { buildJsonSchema, FIELDS, validateRequest } from "../src/index";

const samplesDir = new URL("./samples/", import.meta.url);
const samples = readdirSync(samplesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => [name, JSON.parse(readFileSync(new URL(name, samplesDir), "utf8")) as Record<string, unknown>] as const);

const schema = buildJsonSchema();
// strictRequired is off only because a required field may arrive in either spelling, so the schema
// requires one of two names inside anyOf, which Ajv's strict mode flags as an undeclared property.
const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
ajv.addKeyword("x-unmap-status");
const validate = ajv.compile(schema);

describe("the emitted JSON Schema", () => {
  it("is draft 2020-12", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it.each(samples)("accepts %s", (_name, body) => {
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects an unknown field at the top level and deep in the model", () => {
    expect(validate({ nope: 1 })).toBe(false);
    const body = structuredClone(samples[0]![1]) as { model: { shipments: Record<string, unknown>[] } };
    body.model.shipments[0]!.unknownThing = true;
    expect(validate(body)).toBe(false);
  });

  it("requires a geodesic speed of at least 1 when geodesic distances are on, in either spelling", () => {
    expect(validate({ useGeodesicDistances: true })).toBe(false);
    expect(validate({ use_geodesic_distances: true })).toBe(false);
    expect(validate({ useGeodesicDistances: true, geodesicMetersPerSecond: 0.5 })).toBe(false);
    expect(validate({ useGeodesicDistances: true, geodesic_meters_per_second: 1 })).toBe(true);
    expect(validate({ useGeodesicDistances: false })).toBe(true);
  });

  it("rejects a planned field and a wrong type", () => {
    expect(validate({ model: { maxActiveVehicles: 2 } })).toBe(false);
    expect(validate({ timeout: "10" })).toBe(false);
    expect(validate({ solvingMode: "DETECT_SOME_INFEASIBLE_SHIPMENTS" })).toBe(false);
  });

  it("describes every supported field it emits from the table", () => {
    const text = JSON.stringify(schema);
    for (const row of FIELDS.filter((r) => r.status === "supported")) {
      expect(text, row.path).toContain(JSON.stringify(row.description));
    }
  });
});

describe("planned and rejected fields", () => {
  // Values a probe sends, the zeros a GMPRO client serialises among them.
  const PROBES: unknown[] = [null, 0, 1, -1, 0.5, false, true, "", "0", "-0", "00", "1", "0s", "0.0s", "1s", "X_UNSPECIFIED", "FOO", [], [0], [1], {}, { a: 0 }, { a: 1 }, { a: { b: "" } }, { a: { b: "1s" } }];
  const root = buildJsonSchema() as any;

  /** The body skeleton down to `path`, with `value` at the end (nothing when omitted). */
  function bodyAt(path: string, value?: unknown): Record<string, unknown> {
    const segments = path.split(".");
    const body: Record<string, unknown> = {};
    let node: Record<string, unknown> = body;
    segments.forEach((segment, i) => {
      const name = segment.replace(/(\[\]|\{\})$/, "");
      if (i === segments.length - 1) {
        if (value !== undefined) node[name] = value;
        return;
      }
      const child: Record<string, unknown> = {};
      node[name] = segment.endsWith("[]") ? [child] : segment.endsWith("{}") ? { k: child } : child;
      node = child;
    });
    return body;
  }

  /** The emitted schema for `path`, compiled on its own with the shared $defs. */
  function schemaAt(path: string) {
    let node = root;
    for (const segment of path.split(".")) {
      node = node.properties[segment.replace(/(\[\]|\{\})$/, "")];
      if (segment.endsWith("[]")) node = node.items;
      if (segment.endsWith("{}")) node = node.additionalProperties;
    }
    return ajv.compile({ ...node, $defs: root.$defs });
  }

  const rows = FIELDS.filter((row) => row.status !== "supported" && row.status !== "ignored");

  it("covers the planned and rejected rows", () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  /** The concrete validator path of `path` in `bodyAt`'s skeleton: `a[0].b["k"].c`. */
  const concrete = (path: string): string => path.replace(/\[\]/g, "[0]").replace(/\{\}/g, '["k"]');

  it.each(rows.map((row) => [row.path, row] as const))("%s: the schema accepts exactly what the validator accepts", (path, row) => {
    const fragment = schemaAt(path);
    const at = concrete(path);
    const probes = row.default === undefined ? PROBES : [...PROBES, row.default];
    for (const value of probes) {
      const validatorAccepts = !validateRequest(bodyAt(path, value)).errors.some((e) => e.path === at || e.path.startsWith(`${at}.`) || e.path.startsWith(`${at}[`));
      expect(fragment(value), `${path} = ${JSON.stringify(value)}`).toBe(validatorAccepts);
    }
  });

  it("accepts a planned field sent at its default and refuses it set", () => {
    expect(validate({ model: { vehicles: [{ travelDurationMultiple: 1 }] } })).toBe(true);
    expect(validate({ model: { vehicles: [{ travelDurationMultiple: 2 }] } })).toBe(false);
    expect(validate({ model: { vehicles: [{ usedIfRouteIsEmpty: false }] } })).toBe(true);
    expect(validate({ model: { vehicles: [{ usedIfRouteIsEmpty: true }] } })).toBe(false);
    // Sending it at all counts (presenceCounts), so even 0 is refused.
    expect(validate({ model: { maxActiveVehicles: 0 } })).toBe(false);
  });
});

it("describes proto enums as their names or their integers", () => {
  const props = (buildJsonSchema() as any).properties;
  expect(props.solvingMode.oneOf).toEqual([{ type: "string", enum: ["DEFAULT_SOLVE", "VALIDATE_ONLY"] }, { type: "integer", enum: [0, 1] }]);
});
