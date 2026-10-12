import { readdirSync, readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { buildJsonSchema, FIELDS } from "../src/index";

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
