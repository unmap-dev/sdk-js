import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkStorageUri,
  FIELDS,
  MAX_HORIZON_SECONDS,
  MAX_LOAD_TYPES,
  toFieldViolation,
  toOptimizeToursValidationError,
  validateRequest,
  VALIDATION_ERROR_CODES,
  type FieldRow,
  type ValidationIssue,
} from "../src/index";

const samplesDir = new URL("./samples/", import.meta.url);
const sampleNames = readdirSync(samplesDir).filter((name) => name.endsWith(".json"));
const sample = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(name, samplesDir), "utf8")) as Record<string, unknown>;

/** A small valid request that reaches every supported parent: a pickup, a delivery, windows, loads, breaks. */
function base(): Record<string, unknown> {
  return {
    model: {
      shipments: [
        {
          pickups: [
            {
              arrivalLocation: { latitude: 51, longitude: -114 },
              timeWindows: [{ startTime: "1970-01-01T01:00:00Z", endTime: "1970-01-01T02:00:00Z" }],
            },
          ],
          deliveries: [
            {
              arrivalLocation: { latitude: 51.1, longitude: -114.1 },
              timeWindows: [{ startTime: "1970-01-01T03:00:00Z", endTime: "1970-01-01T04:00:00Z" }],
            },
          ],
          loadDemands: { k: { amount: "1" } },
        },
      ],
      vehicles: [
        {
          startLocation: { latitude: 51, longitude: -114 },
          startTimeWindows: [{ startTime: "1970-01-01T00:00:00Z" }],
          endTimeWindows: [{ endTime: "1970-01-02T00:00:00Z" }],
          loadLimits: { k: { maxLoad: "10" } },
          routeDurationLimit: { maxDuration: "36000s" },
          travelDurationLimit: { maxDuration: "36000s" },
          routeDistanceLimit: { maxMeters: "100000" },
          breakRule: {
            breakRequests: [
              { earliestStartTime: "1970-01-01T05:00:00Z", latestStartTime: "1970-01-01T06:00:00Z", minDuration: "600s" },
            ],
          },
        },
      ],
    },
  };
}

/** A value of the row's type that is not its default, so a planned field counts as "used". */
function nonDefault(row: FieldRow): unknown {
  const one = (): unknown => {
    switch (row.type) {
      case "boolean":
        return true;
      case "string":
        return "x";
      case "number":
        return 2.5;
      case "int32":
        return 3;
      case "int64":
        return "3";
      case "duration":
        return "5s";
      case "timestamp":
        return "1970-01-01T01:00:00Z";
      case "enum":
        return row.enumValues?.find((v) => !v.value.endsWith("_UNSPECIFIED"))?.value;
      case "object":
      case "any":
        return { x: 1 };
    }
  };
  if (row.repeated) return [one()];
  if (row.map) return { k: one() };
  return one();
}

/** Set a row's field in a request, creating the containers along its path. Returns the concrete path. */
function setAt(request: Record<string, unknown>, rowPath: string, value: unknown): string {
  const segments = rowPath.split(".");
  let node: Record<string, unknown> = request;
  const concrete: string[] = [];
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    const name = segment.replace(/(\[\]|\{\})$/, "");
    if (last) {
      node[name] = value;
      concrete.push(name);
      return;
    }
    if (segment.endsWith("[]")) {
      const list = (node[name] ??= [{}]) as Record<string, unknown>[];
      list[0] ??= {};
      node = list[0];
      concrete.push(`${name}[0]`);
    } else if (segment.endsWith("{}")) {
      const map = (node[name] ??= { k: {} }) as Record<string, Record<string, unknown>>;
      map.k ??= {};
      node = map.k;
      concrete.push(`${name}["k"]`);
    } else {
      node = (node[name] ??= {}) as Record<string, unknown>;
      concrete.push(name);
    }
  });
  return concrete.join(".");
}

const codes = (issues: readonly ValidationIssue[]) => issues.map((issue) => `${issue.code} ${issue.path}`);

describe("samples", () => {
  it("has the sample set the brief asks for", () => {
    expect(sampleNames.length).toBeGreaterThanOrEqual(8);
  });

  it.each(sampleNames)("%s validates with no errors and no warnings", (name) => {
    const result = validateRequest(sample(name));
    expect(codes(result.errors)).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.request).not.toBeNull();
  });

  it("the base fixture used by the table tests is itself valid", () => {
    expect(codes(validateRequest(base()).errors)).toEqual([]);
  });
});

describe("rejected and planned rows", () => {
  const rows = FIELDS.filter((row) => row.status === "rejected" || row.status.startsWith("planned"));

  it.each(rows.map((row) => [row.path, row] as const))("%s is refused with its own code and message", (_path, row) => {
    const request = base();
    const path = setAt(request, row.path, nonDefault(row));
    const { errors } = validateRequest(request);
    expect(errors).toContainEqual(
      expect.objectContaining({ code: row.code, path, errorMessage: row.message, hint: row.hint }),
    );
  });

  it("a placeId waypoint is refused with the geocoder hint", () => {
    const request = base();
    setAt(request, "model.shipments[].deliveries[].arrivalWaypoint.placeId", "ChIJ-abc");
    const shipment = (request.model as { shipments: { deliveries: Record<string, unknown>[] }[] }).shipments[0]!;
    delete shipment.deliveries[0]!.arrivalLocation;
    const { errors } = validateRequest(request);
    expect(errors).toEqual([
      {
        code: "PLACE_ID_NOT_SUPPORTED",
        displayName: "PLACE_ID_NOT_SUPPORTED",
        path: "model.shipments[0].deliveries[0].arrivalWaypoint.placeId",
        fields: [
          {
            name: "model",
            subField: {
              name: "shipments",
              index: 0,
              subField: { name: "deliveries", index: 0, subField: { name: "arrivalWaypoint", subField: { name: "placeId" } } },
            },
          },
        ],
        errorMessage: "Google place IDs are not supported: Unmap cannot resolve them.",
        hint: "Geocode the address with Unmap's /geocode/search and send its coordinates as arrivalWaypoint.location.latLng or arrivalLocation.",
        offendingValues: "ChIJ-abc",
      },
    ]);
  });

  it("a planned field is refused with a not-supported-yet message", () => {
    const { errors } = validateRequest({ model: { maxActiveVehicles: 2 } });
    expect(errors).toEqual([
      expect.objectContaining({
        code: "FIELD_NOT_SUPPORTED_YET",
        path: "model.maxActiveVehicles",
        errorMessage: "model.maxActiveVehicles is not supported yet (planned for V2).",
      }),
    ]);
  });

  it("a planned field left at its default value is accepted", () => {
    const request = base();
    Object.assign(request, { searchMode: "SEARCH_MODE_UNSPECIFIED", interpretInjectedSolutionsUsingLabels: false, injectedFirstSolutionRoutes: [] });
    const vehicle = (request.model as { vehicles: Record<string, unknown>[] }).vehicles[0]!;
    Object.assign(vehicle, { usedIfRouteIsEmpty: false, travelDurationMultiple: 1, routeModifiers: { avoidTolls: false } });
    const { errors, warnings } = validateRequest(request);
    expect(codes(errors)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("refuses planned enum values", () => {
    const { errors } = validateRequest({ solvingMode: "DETECT_SOME_INFEASIBLE_SHIPMENTS", model: { vehicles: [{ travelMode: "WALKING", unmapProfile: "truck" }] } });
    expect(errors.map((e) => [e.code, e.path, e.errorMessage])).toEqual([
      ["VALUE_NOT_SUPPORTED_YET", "solvingMode", "solvingMode DETECT_SOME_INFEASIBLE_SHIPMENTS is not supported yet (planned for V2)."],
      ["VALUE_NOT_SUPPORTED_YET", "model.vehicles[0].travelMode", "model.vehicles[].travelMode WALKING is not supported yet (planned for V2)."],
      ["VALUE_NOT_SUPPORTED_YET", "model.vehicles[0].unmapProfile", "model.vehicles[].unmapProfile truck is not supported yet (planned for V2)."],
    ]);
  });

  it("refuses more than one pickup or delivery per shipment", () => {
    const request = base();
    const shipment = (request.model as { shipments: { pickups: unknown[] }[] }).shipments[0]!;
    shipment.pickups.push(shipment.pickups[0]);
    const { errors } = validateRequest(request);
    expect(errors).toEqual([
      expect.objectContaining({
        code: "VALUE_NOT_SUPPORTED_YET",
        path: "model.shipments[0].pickups",
        errorMessage: "A shipment with more than one pickup alternative is not supported yet (planned for V2).",
      }),
    ]);
  });
});

describe("ignored rows", () => {
  const rows = FIELDS.filter((row) => row.status === "ignored");

  it.each(rows.map((row) => [row.path, row] as const))("%s is accepted with its own warning", (_path, row) => {
    const request = base();
    const path = setAt(request, row.path, nonDefault(row));
    const { warnings } = validateRequest(request);
    expect(warnings).toContainEqual({ code: "FIELD_IGNORED", field: row.path, path, count: 1, message: row.message });
  });

  it("considerRoadTraffic warns with the exact text and does not error", () => {
    const { errors, warnings } = validateRequest({ considerRoadTraffic: true });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([
      {
        code: "FIELD_IGNORED",
        field: "considerRoadTraffic",
        path: "considerRoadTraffic",
        count: 1,
        message: "considerRoadTraffic is ignored: Unmap travel times do not use live or historical traffic yet.",
      },
    ]);
  });

  it("collapses repeated occurrences of one ignored field into one warning with a count", () => {
    const { warnings } = validateRequest({
      model: {
        shipments: [0, 1, 2].map(() => ({
          deliveries: [{ arrivalWaypoint: { sideOfRoad: true, location: { latLng: { latitude: 1, longitude: 1 } } } }],
        })),
      },
    });
    expect(warnings).toEqual([
      expect.objectContaining({ field: "model.shipments[].deliveries[].arrivalWaypoint.sideOfRoad", path: "model.shipments[0].deliveries[0].arrivalWaypoint.sideOfRoad", count: 3 }),
    ]);
  });

  it("does not warn for an ignored field left at its default", () => {
    expect(validateRequest({ considerRoadTraffic: false, populateTransitionPolylines: false }).warnings).toEqual([]);
  });
});

describe("unknown fields and casing", () => {
  it("lists every unknown field as an error", () => {
    const { errors } = validateRequest({ nope: 1, model: { shipments: [{ deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 }, foo: 2 }] }], bar: {} } });
    expect(errors.map((e) => [e.code, e.path, e.errorMessage])).toEqual([
      ["UNKNOWN_FIELD", "nope", 'Unknown field "nope".'],
      ["UNKNOWN_FIELD", "model.shipments[0].deliveries[0].foo", 'Unknown field "foo".'],
      ["UNKNOWN_FIELD", "model.bar", 'Unknown field "bar".'],
    ]);
  });

  it("refuses both spellings of one field in the same object", () => {
    const { errors } = validateRequest({ model: { global_start_time: "1970-01-01T00:00:00Z", globalStartTime: "1970-01-01T00:00:00Z" } });
    expect(errors).toEqual([
      expect.objectContaining({
        code: "CONFLICTING_FIELD_NAMES",
        path: "model.globalStartTime",
        errorMessage: "Both global_start_time and globalStartTime are set; send one spelling.",
      }),
    ]);
  });

  it("returns the snake_case sample in camelCase and keeps load type names as sent", () => {
    const { request } = validateRequest(sample("snake-case.json"));
    const model = request?.model;
    expect(model?.globalStartTime).toBe("2026-10-12T08:00:00Z");
    expect(model?.shipments?.[0]?.loadDemands).toEqual({ cold_chain_crates: { amount: 3 } });
    expect(model?.vehicles?.[0]?.loadLimits).toEqual({ cold_chain_crates: { maxLoad: 10 } });
    expect(model?.shipments?.[0]?.label).toBe("snake_case_label");
    expect(request?.populatePolylines).toBe(true);
  });
});

describe("defaults", () => {
  it("applies GMPRO defaults to an empty request", () => {
    const { request, errors } = validateRequest({});
    expect(errors).toEqual([]);
    expect(request).toEqual({
      solvingMode: "DEFAULT_SOLVE",
      maxValidationErrors: 100,
      model: { globalStartTime: "1970-01-01T00:00:00Z", globalEndTime: "1971-01-01T00:00:00Z" },
    });
  });

  it("caps maxValidationErrors at 10,000", () => {
    expect(validateRequest({ maxValidationErrors: 50_000 }).request?.maxValidationErrors).toBe(10_000);
  });

  it("has no SOLVING_MODE_UNSPECIFIED: GMPRO's zero value is DEFAULT_SOLVE", () => {
    const result = validateRequest({ solvingMode: "SOLVING_MODE_UNSPECIFIED" });
    expect(result.errors.map((e) => [e.code, e.path])).toEqual([["INVALID_ENUM_VALUE", "solvingMode"]]);
    expect(validateRequest({ solvingMode: "DEFAULT_SOLVE" }).errors).toEqual([]);
  });

  it("refuses a request body that is not an object", () => {
    for (const raw of [null, [], "x", 3]) {
      const result = validateRequest(raw);
      expect(result.request).toBeNull();
      expect(result.errors.map((e) => e.code)).toEqual(["INVALID_REQUEST"]);
    }
  });
});

describe("maxValidationErrors", () => {
  const unknowns = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`unknown${i}`, 1]));

  it("stops collecting at the request's own limit and says it truncated", () => {
    const result = validateRequest({ ...unknowns(30), maxValidationErrors: 5 });
    expect(result.errors).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });

  it("stops at 100 by default", () => {
    const result = validateRequest(unknowns(150));
    expect(result.errors).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it("is not truncated below the limit", () => {
    expect(validateRequest(unknowns(3)).truncated).toBe(false);
  });

  it("an options override wins over the request", () => {
    expect(validateRequest({ ...unknowns(30), maxValidationErrors: 5 }, { maxValidationErrors: 20 }).errors).toHaveLength(20);
  });
});

describe("type and value checks", () => {
  const errorFor = (raw: unknown) => validateRequest(raw).errors.map((e) => [e.code, e.path]);
  const delivery = (extra: Record<string, unknown>) => ({
    model: { shipments: [{ deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 }, ...extra }] }] },
  });

  it("int64 fields take decimal strings and safe integers only", () => {
    const limits = (maxLoad: unknown) => ({ model: { vehicles: [{ loadLimits: { w: { maxLoad } } }] } });
    expect(errorFor(limits("10"))).toEqual([]);
    expect(errorFor(limits(10))).toEqual([]);
    for (const bad of ["abc", "9007199254740993", 1.5, "1e3"]) {
      expect(errorFor(limits(bad))).toEqual([["INVALID_INT64", 'model.vehicles[0].loadLimits["w"].maxLoad']]);
    }
    expect(errorFor(limits("-1"))).toEqual([["OUT_OF_RANGE", 'model.vehicles[0].loadLimits["w"].maxLoad']]);
  });

  it("durations, timestamps and enums", () => {
    expect(errorFor(delivery({ duration: "300" }))).toEqual([["INVALID_DURATION", "model.shipments[0].deliveries[0].duration"]]);
    expect(errorFor(delivery({ duration: "-3s" }))).toEqual([["OUT_OF_RANGE", "model.shipments[0].deliveries[0].duration"]]);
    expect(errorFor({ model: { globalStartTime: "yesterday" } })).toEqual([["INVALID_TIMESTAMP", "model.globalStartTime"]]);
    expect(errorFor({ solvingMode: "FAST" })).toEqual([["INVALID_ENUM_VALUE", "solvingMode"]]);
    expect(errorFor({ populatePolylines: "yes" })).toEqual([["INVALID_TYPE", "populatePolylines"]]);
    expect(errorFor({ model: { shipments: {} } })).toEqual([["INVALID_TYPE", "model.shipments"]]);
  });

  it("coordinates stay on the globe", () => {
    expect(errorFor({ model: { shipments: [{ deliveries: [{ arrivalLocation: { latitude: 91, longitude: 0 } }] }] } })).toEqual([
      ["OUT_OF_RANGE", "model.shipments[0].deliveries[0].arrivalLocation.latitude"],
    ]);
  });

  it("costs and speeds are not negative", () => {
    expect(errorFor({ model: { vehicles: [{ costPerHour: -1 }] } })).toEqual([["OUT_OF_RANGE", "model.vehicles[0].costPerHour"]]);
    expect(errorFor({ geodesicMetersPerSecond: 0 })).toEqual([["OUT_OF_RANGE", "geodesicMetersPerSecond"]]);
  });

  it("geodesic distances need an explicit speed of at least 1 m/s, as GMPRO requires", () => {
    const missing = validateRequest({ useGeodesicDistances: true });
    expect(missing.errors.map((e) => [e.code, e.path, e.errorMessage])).toEqual([
      ["MISSING_REQUIRED_FIELD", "geodesicMetersPerSecond", "geodesicMetersPerSecond is required when useGeodesicDistances is true."],
    ]);
    expect(missing.request?.geodesicMetersPerSecond).toBeUndefined();
    const slow = validateRequest({ useGeodesicDistances: true, geodesicMetersPerSecond: 0.5 });
    expect(slow.errors.map((e) => [e.code, e.path, e.errorMessage])).toEqual([["OUT_OF_RANGE", "geodesicMetersPerSecond", "Must be at least 1."]]);
    expect(errorFor({ useGeodesicDistances: true, geodesicMetersPerSecond: 1 })).toEqual([]);
    expect(errorFor({ useGeodesicDistances: false })).toEqual([]);
  });

  it("a visit needs exactly one location when no matrices are given", () => {
    expect(errorFor({ model: { shipments: [{ deliveries: [{ duration: "1s" }] }] } })).toEqual([
      ["MISSING_REQUIRED_FIELD", "model.shipments[0].deliveries[0]"],
    ]);
    expect(
      errorFor(delivery({ arrivalWaypoint: { location: { latLng: { latitude: 1, longitude: 1 } } } })),
    ).toEqual([["MUTUALLY_EXCLUSIVE_FIELDS", "model.shipments[0].deliveries[0]"]]);
    expect(errorFor({ model: { vehicles: [{ startLocation: { latitude: 1, longitude: 1 }, startWaypoint: { location: { latLng: { latitude: 1, longitude: 1 } } } }] } })).toEqual([
      ["MUTUALLY_EXCLUSIVE_FIELDS", "model.vehicles[0]"],
    ]);
  });

  it("a shipment needs a pickup or a delivery", () => {
    expect(errorFor({ model: { shipments: [{ label: "empty" }] } })).toEqual([["MISSING_REQUIRED_FIELD", "model.shipments[0]"]]);
  });

  it("time windows are ordered, disjoint and inside the global window", () => {
    const w = (timeWindows: unknown) => errorFor(delivery({ timeWindows }));
    expect(w([{ startTime: "1970-01-01T02:00:00Z", endTime: "1970-01-01T01:00:00Z" }])).toEqual([
      ["INVALID_TIME_WINDOW", "model.shipments[0].deliveries[0].timeWindows[0]"],
    ]);
    expect(w([{ startTime: "1970-01-01T02:00:00Z" }, { endTime: "1970-01-01T01:00:00Z" }])).toEqual([
      ["INVALID_TIME_WINDOW", "model.shipments[0].deliveries[0].timeWindows[1]"],
    ]);
    expect(w([{ startTime: "1972-01-01T00:00:00Z" }])).toEqual([["INVALID_TIME_WINDOW", "model.shipments[0].deliveries[0].timeWindows[0]"]]);
    expect(errorFor({ model: { globalStartTime: "1970-01-02T00:00:00Z", globalEndTime: "1970-01-01T00:00:00Z" } })).toEqual([
      ["INVALID_TIME_WINDOW", "model.globalEndTime"],
    ]);
  });

  it("a break's earliest start is not after its latest start", () => {
    expect(
      errorFor({ model: { vehicles: [{ breakRule: { breakRequests: [{ earliestStartTime: "1970-01-01T02:00:00Z", latestStartTime: "1970-01-01T01:00:00Z", minDuration: "60s" }] } }] } }),
    ).toEqual([["INVALID_TIME_WINDOW", "model.vehicles[0].breakRule.breakRequests[0]"]]);
    expect(errorFor({ model: { vehicles: [{ breakRule: { breakRequests: [{ minDuration: "60s" }] } }] } })).toEqual([
      ["MISSING_REQUIRED_FIELD", "model.vehicles[0].breakRule.breakRequests[0].earliestStartTime"],
      ["MISSING_REQUIRED_FIELD", "model.vehicles[0].breakRule.breakRequests[0].latestStartTime"],
    ]);
  });

  it("int32 and int64 decimal strings come back as numbers, and references are checked on the number", () => {
    const shipment = (allowedVehicleIndices: unknown) => ({
      maxValidationErrors: "20",
      model: {
        vehicles: [{ loadLimits: { w: { maxLoad: "10" } }, routeDistanceLimit: { maxMeters: "5000" } }],
        shipments: [{ deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 } }], allowedVehicleIndices, loadDemands: { w: { amount: "3" } } }],
      },
    });
    expect(errorFor(shipment(["5"]))).toEqual([["INVALID_REFERENCE", "model.shipments[0].allowedVehicleIndices[0]"]]);
    const { request, errors } = validateRequest(shipment(["0"]));
    expect(errors).toEqual([]);
    expect(request?.maxValidationErrors).toBe(20);
    expect(request?.model?.shipments?.[0]?.allowedVehicleIndices).toEqual([0]);
    expect(request?.model?.shipments?.[0]?.loadDemands).toEqual({ w: { amount: 3 } });
    expect(request?.model?.vehicles?.[0]?.loadLimits).toEqual({ w: { maxLoad: 10 } });
    expect(request?.model?.vehicles?.[0]?.routeDistanceLimit?.maxMeters).toBe(5000);
  });

  it("allowedVehicleIndices name real vehicles", () => {
    expect(errorFor({ model: { vehicles: [{}], shipments: [{ deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 } }], allowedVehicleIndices: [0, 1] }] } })).toEqual([
      ["INVALID_REFERENCE", "model.shipments[0].allowedVehicleIndices[1]"],
    ]);
  });

  it("matrices match their tags", () => {
    const m = sample("matrices-with-tags.json");
    const model = m.model as { durationDistanceMatrices: { rows: unknown[] }[]; shipments: { deliveries: { tags: string[] }[] }[] };
    model.durationDistanceMatrices[0]!.rows.pop();
    model.shipments[0]!.deliveries[0]!.tags = ["nowhere"];
    expect(errorFor(m)).toEqual([
      ["MATRIX_SHAPE_MISMATCH", "model.durationDistanceMatrices[0].rows"],
      ["INVALID_REFERENCE", "model.shipments[0].deliveries[0].tags"],
    ]);
  });

  it("accepts an ignored shipment without complaint", () => {
    const request = base();
    (request.model as { shipments: Record<string, unknown>[] }).shipments[0]!.ignore = true;
    expect(validateRequest(request).errors).toEqual([]);
  });
});

describe("wire shapes", () => {
  const issue = validateRequest({ model: { shipments: [{ deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 } }], loadDemands: { "a.b": { amount: "x" } } }] } }).errors[0]!;

  it("builds a FieldReference chain with map keys", () => {
    expect(issue.path).toBe('model.shipments[0].loadDemands["a.b"].amount');
    expect(issue.fields).toEqual([
      { name: "model", subField: { name: "shipments", index: 0, subField: { name: "loadDemands", key: "a.b", subField: { name: "amount" } } } },
    ]);
  });

  it("serializes as a GMPRO OptimizeToursValidationError with an integer code", () => {
    const wire = toOptimizeToursValidationError(issue);
    expect(wire).toEqual({
      code: VALIDATION_ERROR_CODES.INVALID_INT64,
      displayName: "INVALID_INT64",
      fields: issue.fields,
      errorMessage: issue.errorMessage,
      offendingValues: "x",
    });
    expect(Number.isInteger(wire.code)).toBe(true);
  });

  it("serializes as a google.rpc.BadRequest field violation", () => {
    expect(toFieldViolation(issue)).toEqual({ field: issue.path, description: issue.errorMessage });
  });

  it("gives every error code a distinct integer", () => {
    const values = Object.values(VALIDATION_ERROR_CODES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("refuses gs:// URIs with guidance", () => {
    expect(checkStorageUri("gs://bucket/request.json")).toEqual({
      code: "GCS_URI_NOT_SUPPORTED",
      message: "gs:// URIs are not supported: Unmap cannot read Google Cloud Storage.",
      hint: "Send the request body inline, or use an https:// URL that Unmap can fetch.",
    });
    expect(checkStorageUri("https://example.com/request.json")).toBeNull();
  });
});

describe("GMPRO fidelity rules", () => {
  const errorFor = (raw: unknown) => validateRequest(raw).errors.map((e) => [e.code, e.path, e.errorMessage]);
  const at = (h: number) => `1970-01-01T${String(h).padStart(2, "0")}:00:00Z`;
  const delivery = (extra: Record<string, unknown>) => ({
    model: { shipments: [{ deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 }, ...extra }] }] },
  });

  it("refuses TRANSFORM_AND_RETURN_REQUEST and DETECT_SOME_INFEASIBLE_SHIPMENTS with a message", () => {
    expect(errorFor({ solvingMode: "TRANSFORM_AND_RETURN_REQUEST" })).toEqual([
      ["VALUE_NOT_SUPPORTED_YET", "solvingMode", "solvingMode TRANSFORM_AND_RETURN_REQUEST is not supported yet (planned for V3)."],
    ]);
    expect(errorFor({ solvingMode: "DETECT_SOME_INFEASIBLE_SHIPMENTS" })).toEqual([
      ["VALUE_NOT_SUPPORTED_YET", "solvingMode", "solvingMode DETECT_SOME_INFEASIBLE_SHIPMENTS is not supported yet (planned for V2)."],
    ]);
  });

  it("a break's minDuration must be positive", () => {
    const breakOf = (minDuration: string) => ({
      model: { vehicles: [{ breakRule: { breakRequests: [{ earliestStartTime: at(1), latestStartTime: at(2), minDuration }] } }] },
    });
    expect(errorFor(breakOf("0s"))).toEqual([["OUT_OF_RANGE", "model.vehicles[0].breakRule.breakRequests[0].minDuration", "Must be greater than 0."]]);
    expect(errorFor(breakOf("0.5s"))).toEqual([]);
  });

  it("counts presence for optional scalars where 0 is a real value", () => {
    const vehicle = (extra: Record<string, unknown>) => ({ model: { vehicles: [extra] } });
    expect(errorFor(vehicle({ travelDurationMultiple: 0 })).map((e) => e[0])).toEqual(["FIELD_NOT_SUPPORTED_YET"]);
    expect(errorFor(vehicle({ travelDurationMultiple: 1 }))).toEqual([]);
    expect(errorFor(vehicle({ routeDistanceLimit: { softMaxMeters: "0" } })).map((e) => e[1])).toEqual(["model.vehicles[0].routeDistanceLimit.softMaxMeters"]);
    expect(errorFor(vehicle({ routeDistanceLimit: { softMaxMeters: 0 } })).map((e) => e[1])).toEqual(["model.vehicles[0].routeDistanceLimit.softMaxMeters"]);
    expect(errorFor(vehicle({ routeDistanceLimit: { costPerKilometerBelowSoftMax: 0 } })).map((e) => e[1])).toEqual([
      "model.vehicles[0].routeDistanceLimit.costPerKilometerBelowSoftMax",
    ]);
  });

  it("refuses more than one vehicle start or end time window, which V1 cannot plan", () => {
    const vehicle = { startTimeWindows: [{ endTime: at(1) }, { startTime: at(2) }], endTimeWindows: [{ endTime: at(3) }, { startTime: at(4) }] };
    expect(errorFor({ model: { vehicles: [vehicle] } })).toEqual([
      ["VALUE_NOT_SUPPORTED_YET", "model.vehicles[0].startTimeWindows", "A vehicle with more than one startTimeWindows entry is not supported yet (planned for V2)."],
      ["VALUE_NOT_SUPPORTED_YET", "model.vehicles[0].endTimeWindows", "A vehicle with more than one endTimeWindows entry is not supported yet (planned for V2)."],
    ]);
  });

  it("vehicle and visit windows must not overlap or touch (GMPRO: disjoint and not adjacent)", () => {
    const touching = [{ endTime: at(2) }, { startTime: at(2) }];
    expect(errorFor({ model: { vehicles: [{ startTimeWindows: touching }] } })).toEqual([
      ["VALUE_NOT_SUPPORTED_YET", "model.vehicles[0].startTimeWindows", "A vehicle with more than one startTimeWindows entry is not supported yet (planned for V2)."],
      ["INVALID_TIME_WINDOW", "model.vehicles[0].startTimeWindows[1]", "Time windows must be in increasing order and must not overlap or touch."],
    ]);
    expect(errorFor(delivery({ timeWindows: touching }))).toEqual([
      ["INVALID_TIME_WINDOW", "model.shipments[0].deliveries[0].timeWindows[1]", "Time windows must be in increasing order and must not overlap or touch."],
    ]);
  });

  it("a vehicle's end window must not close before its start window opens", () => {
    const vehicle = (startTime: string, endTime: string) => ({ model: { vehicles: [{ startTimeWindows: [{ startTime }], endTimeWindows: [{ endTime }] }] } });
    expect(errorFor(vehicle(at(2), at(1)))).toEqual([
      ["INVALID_TIME_WINDOW", "model.vehicles[0].endTimeWindows", "A vehicle's endTimeWindows must not close before its startTimeWindows opens."],
    ]);
    expect(errorFor(vehicle(at(2), at(2)))).toEqual([]);
  });

  it("refuses empty or duplicate vehicle start and end tags", () => {
    expect(errorFor({ model: { vehicles: [{ startTags: ["a", "a"], endTags: [""] }] } })).toEqual([
      ["INVALID_VALUE", "model.vehicles[0].startTags", "A vehicle's startTags must be unique and not empty."],
      ["INVALID_VALUE", "model.vehicles[0].endTags", "A vehicle's endTags must be unique and not empty."],
    ]);
  });

  it("keeps checking the remaining windows after one it cannot read", () => {
    expect(errorFor(delivery({ timeWindows: [{ startTime: "bad" }, { startTime: at(2), endTime: at(1) }] })).map((e) => [e[0], e[1]])).toEqual([
      ["INVALID_TIMESTAMP", "model.shipments[0].deliveries[0].timeWindows[0].startTime"],
      ["INVALID_TIME_WINDOW", "model.shipments[0].deliveries[0].timeWindows[1]"],
    ]);
  });

  it("refuses empty or duplicate visit tags", () => {
    expect(errorFor(delivery({ tags: ["a", "a"] }))).toEqual([["INVALID_VALUE", "model.shipments[0].deliveries[0].tags", "A visit's tags must be unique and not empty."]]);
    expect(errorFor(delivery({ tags: [""] })).map((e) => e[0])).toEqual(["INVALID_VALUE"]);
  });
});

describe("bring-your-own matrices (GMPRO durationDistanceMatrices rules)", () => {
  const errorFor = (raw: unknown) => validateRequest(raw).errors.map((e) => [e.code, e.path]);
  const messagesFor = (raw: unknown) => validateRequest(raw).errors.map((e) => [e.code, e.path, e.errorMessage]);
  type Byo = {
    useGeodesicDistances?: boolean;
    model: {
      shipments: { deliveries: Record<string, unknown>[] }[];
      vehicles: Record<string, unknown>[];
      durationDistanceMatrixSrcTags?: string[];
      durationDistanceMatrixDstTags?: string[];
      durationDistanceMatrices?: Record<string, unknown>[];
    };
  };
  const byo = (): Byo => sample("matrices-with-tags.json") as unknown as Byo;
  const here = { latitude: 1, longitude: 1 };

  it("the sample is valid", () => {
    expect(errorFor(byo())).toEqual([]);
  });

  it("refuses coordinates on vehicles and visits: with matrices, tags place every stop", () => {
    const m = byo();
    m.model.vehicles[0]!.startLocation = here;
    m.model.vehicles[0]!.endWaypoint = { location: { latLng: here } };
    m.model.shipments[0]!.deliveries[0]!.arrivalLocation = here;
    m.model.shipments[1]!.deliveries[0]!.arrivalWaypoint = { location: { latLng: here } };
    expect(messagesFor(m)).toEqual([
      [
        "MUTUALLY_EXCLUSIVE_FIELDS",
        "model.shipments[0].deliveries[0].arrivalLocation",
        "With model.durationDistanceMatrices, a visit is placed by its tags; arrivalLocation must not be set.",
      ],
      [
        "MUTUALLY_EXCLUSIVE_FIELDS",
        "model.shipments[1].deliveries[0].arrivalWaypoint",
        "With model.durationDistanceMatrices, a visit is placed by its tags; arrivalWaypoint must not be set.",
      ],
      [
        "MUTUALLY_EXCLUSIVE_FIELDS",
        "model.vehicles[0].startLocation",
        "With model.durationDistanceMatrices, a vehicle's start is placed by startTags; startLocation must not be set.",
      ],
      [
        "MUTUALLY_EXCLUSIVE_FIELDS",
        "model.vehicles[0].endWaypoint",
        "With model.durationDistanceMatrices, a vehicle's end is placed by endTags; endWaypoint must not be set.",
      ],
    ]);
  });

  it("a vehicle with no tags and no coordinates has an open start and end", () => {
    const m = byo();
    m.model.vehicles[0] = {};
    expect(errorFor(m)).toEqual([]);
  });

  it("every visit needs tags", () => {
    const m = byo();
    delete m.model.shipments[0]!.deliveries[0]!.tags;
    expect(messagesFor(m)).toEqual([
      [
        "MISSING_REQUIRED_FIELD",
        "model.shipments[0].deliveries[0].tags",
        "With model.durationDistanceMatrices, every visit needs tags that match exactly one durationDistanceMatrixSrcTags entry and exactly one durationDistanceMatrixDstTags entry.",
      ],
    ]);
  });

  it("refuses useGeodesicDistances alongside matrices", () => {
    const m = byo();
    Object.assign(m, { useGeodesicDistances: true, geodesicMetersPerSecond: 10 });
    expect(errorFor(m)).toEqual([["MUTUALLY_EXCLUSIVE_FIELDS", "useGeodesicDistances"]]);
  });

  it("matrices and tag lists come together, and tags are not empty strings", () => {
    const noTags = byo();
    delete noTags.model.durationDistanceMatrixSrcTags;
    expect(errorFor(noTags)).toEqual(
      expect.arrayContaining([["MISSING_REQUIRED_FIELD", "model.durationDistanceMatrixSrcTags"]]),
    );
    const noMatrices = byo();
    delete noMatrices.model.durationDistanceMatrices;
    expect(errorFor(noMatrices)).toEqual(expect.arrayContaining([["MISSING_REQUIRED_FIELD", "model.durationDistanceMatrices"]]));
    const empty = byo();
    empty.model.durationDistanceMatrixDstTags![2] = "";
    expect(errorFor(empty)).toEqual(expect.arrayContaining([["INVALID_VALUE", "model.durationDistanceMatrixDstTags"]]));
  });

  it("a single matrix with a vehicleStartTag applies only to the vehicles that carry it", () => {
    const m = byo();
    m.model.durationDistanceMatrices![0]!.vehicleStartTag = "van";
    m.model.vehicles.push({ startTags: ["depot", "van"], endTags: ["depot"] });
    expect(messagesFor(m)).toEqual([
      [
        "INVALID_REFERENCE",
        "model.vehicles[0].startTags",
        "A vehicle's startTags must match exactly one durationDistanceMatrices[].vehicleStartTag; this one matches 0.",
      ],
    ]);
  });

  it("each vehicle matches exactly one matrix, never two", () => {
    const m = byo();
    const matrix = m.model.durationDistanceMatrices![0]!;
    m.model.durationDistanceMatrices = [
      { ...matrix, vehicleStartTag: "van" },
      { ...matrix, vehicleStartTag: "truck" },
    ];
    m.model.vehicles = [{ startTags: ["depot", "van", "truck"] }, { startTags: ["depot", "truck"] }, {}];
    expect(messagesFor(m)).toEqual([
      [
        "INVALID_REFERENCE",
        "model.vehicles[0].startTags",
        "A vehicle's startTags must match exactly one durationDistanceMatrices[].vehicleStartTag; this one matches 2.",
      ],
      [
        "INVALID_REFERENCE",
        "model.vehicles[2].startTags",
        "A vehicle's startTags must match exactly one durationDistanceMatrices[].vehicleStartTag; this one matches 0.",
      ],
    ]);
  });
});

describe("prototype names as keys", () => {
  const shipmentWith = (loadDemands: string) =>
    JSON.parse(`{"model":{"shipments":[{"deliveries":[{"arrivalLocation":{"latitude":1,"longitude":1}}],"loadDemands":${loadDemands}}],"vehicles":[{"loadLimits":{"weight":{"maxLoad":"10"}}}]}}`) as unknown;

  it.each(["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"])("rejects %s as a map key with INVALID_VALUE naming the field", (key) => {
    const { errors } = validateRequest(shipmentWith(`{${JSON.stringify(key)}:{"weight":{"amount":"5"}}}`));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "INVALID_VALUE", path: `model.shipments[0].loadDemands[${JSON.stringify(key)}]` });
  });

  it("rejects the same names as vehicle load limit keys", () => {
    const { errors } = validateRequest({
      model: { shipments: [{ deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 } }] }], vehicles: [{ loadLimits: { constructor: { maxLoad: "1" } } }] },
    });
    expect(errors.map((e) => [e.code, e.path])).toEqual([["INVALID_VALUE", 'model.vehicles[0].loadLimits["constructor"]']]);
  });

  it("reports a __proto__ field in a message as an unknown field, not as a hidden prototype", () => {
    const { errors } = validateRequest(JSON.parse('{"model":{"__proto__":{"shipments":[{}]}}}'));
    expect(errors).toEqual([expect.objectContaining({ code: "UNKNOWN_FIELD", path: "model._Proto__" })]);
  });
});

describe("load type cap", () => {
  const delivery = { deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 } }] };
  const demands = (names: string[]) => Object.fromEntries(names.map((name) => [name, { amount: "1" }]));
  const limits = (names: string[]) => Object.fromEntries(names.map((name) => [name, { maxLoad: "10" }]));
  const names = (from: number, count: number) => Array.from({ length: count }, (_, i) => `t${from + i}`);

  it(`accepts ${MAX_LOAD_TYPES} distinct load types across shipments and vehicles`, () => {
    const { errors } = validateRequest({
      model: {
        shipments: [{ ...delivery, loadDemands: demands(names(0, 10)) }],
        vehicles: [{ loadLimits: limits(names(5, MAX_LOAD_TYPES - 5)) }],
      },
    });
    expect(errors).toEqual([]);
  });

  it("refuses the first load type past the cap, once, naming the limit", () => {
    const { errors } = validateRequest({
      model: {
        shipments: [
          { ...delivery, loadDemands: demands(names(0, 10)) },
          { ...delivery, loadDemands: demands(names(10, 10)) },
        ],
        vehicles: [{ loadLimits: limits(names(15, 10)) }],
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "OUT_OF_RANGE", path: 'model.shipments[1].loadDemands["t16"]' });
    expect(errors[0]!.errorMessage).toContain(`at most ${MAX_LOAD_TYPES} distinct load types`);
  });

  it("counts a vehicle's load limit keys too", () => {
    const { errors } = validateRequest({
      model: { shipments: [{ ...delivery }], vehicles: [{ loadLimits: limits(names(0, MAX_LOAD_TYPES)) }, { loadLimits: limits(names(MAX_LOAD_TYPES, 1)) }] },
    });
    expect(errors.map((e) => [e.code, e.path])).toEqual([["OUT_OF_RANGE", `model.vehicles[1].loadLimits["t${MAX_LOAD_TYPES}"]`]]);
  });

  it("keeps a 100,000-key body to one error", () => {
    const { errors } = validateRequest({ model: { shipments: [{ ...delivery, loadDemands: demands(names(0, 100_000)) }] } });
    expect(errors).toHaveLength(1);
  });
});

describe("integer bounds the solver can hold", () => {
  const delivery = (amount: string | number, visits: "delivery" | "both" = "delivery") => ({
    ...(visits === "both" ? { pickups: [{ arrivalLocation: { latitude: 1, longitude: 1 } }] } : {}),
    deliveries: [{ arrivalLocation: { latitude: 1, longitude: 1 } }],
    loadDemands: { w: { amount } },
  });
  const MAX = Number.MAX_SAFE_INTEGER;

  it("accepts one load type's amounts up to 2^53 - 1 over every pickup and delivery", () => {
    expect(validateRequest({ model: { shipments: [delivery(String(MAX))] } }).errors).toEqual([]);
  });

  it("refuses amounts whose total over every pickup and delivery passes 2^53 - 1, at the shipment that passes it", () => {
    const half = String(Math.floor(MAX / 2) + 1);
    const { errors } = validateRequest({ model: { shipments: [delivery("1"), delivery(half, "both")] } });
    expect(errors.map((e) => [e.code, e.path])).toEqual([["OUT_OF_RANGE", 'model.shipments[1].loadDemands["w"].amount']]);
    expect(errors[0]!.errorMessage).toContain("9007199254740991");
  });

  it(`refuses a global window longer than ${MAX_HORIZON_SECONDS} seconds`, () => {
    const start = "2000-01-01T00:00:00Z";
    const end = (seconds: number) => new Date(Date.parse(start) + seconds * 1000).toISOString();
    expect(validateRequest({ model: { globalStartTime: start, globalEndTime: end(MAX_HORIZON_SECONDS) } }).errors).toEqual([]);
    const { errors } = validateRequest({ model: { globalStartTime: start, globalEndTime: end(MAX_HORIZON_SECONDS + 1) } });
    expect(errors.map((e) => [e.code, e.path])).toEqual([["OUT_OF_RANGE", "model.globalEndTime"]]);
  });

  it("refuses a route distance limit over 1,000,000,000 metres", () => {
    const limit = (maxMeters: string) => ({ model: { vehicles: [{ routeDistanceLimit: { maxMeters } }] } });
    expect(validateRequest(limit("1000000000")).errors).toEqual([]);
    expect(validateRequest(limit("1000000001")).errors.map((e) => [e.code, e.path])).toEqual([["OUT_OF_RANGE", "model.vehicles[0].routeDistanceLimit.maxMeters"]]);
  });
});
