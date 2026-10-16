import { describe, expect, it } from "vitest";
import { FIELDS, FIELD_STATUSES, fieldByPath, fieldNameOf, MAP_FIELD_NAMES, parentPathOf, VALIDATION_ERROR_CODES, type FieldStatus } from "../src/index";

const EM_DASH = "\u2014";

describe("the field-status table", () => {
  it("has one row per path", () => {
    const paths = FIELDS.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("only nests rows under a supported object row", () => {
    for (const row of FIELDS) {
      const parent = parentPathOf(row.path);
      if (parent === "") continue;
      const parentRow = fieldByPath(parent);
      expect(parentRow, `${row.path} has no parent row`).toBeDefined();
      expect(parentRow?.type, `${row.path}'s parent is not an object`).toBe("object");
      expect(parentRow?.status, `${row.path}'s parent is not supported`).toBe("supported");
    }
  });

  it("gives every supported object row at least one child", () => {
    for (const row of FIELDS.filter((r) => r.type === "object" && r.status === "supported")) {
      expect(FIELDS.some((r) => parentPathOf(r.path) === row.path), row.path).toBe(true);
    }
  });

  it("describes every row and gives every non-supported row a message", () => {
    for (const row of FIELDS) {
      expect(FIELD_STATUSES).toContain(row.status);
      expect(row.description.length, row.path).toBeGreaterThan(10);
      expect(row.description.endsWith("."), row.path).toBe(true);
      if (row.status !== "supported") {
        expect(row.message, row.path).toBeTruthy();
        expect(row.code, row.path).toBeTruthy();
      }
      for (const text of [row.description, row.message, row.hint, row.rationale]) {
        expect(text ?? "", row.path).not.toContain(EM_DASH);
      }
    }
  });

  it("gives every enum row a status for each of its values", () => {
    for (const row of FIELDS.filter((r) => r.type === "enum")) {
      expect(row.enumValues?.length, row.path).toBeGreaterThan(0);
      for (const v of row.enumValues ?? []) {
        if (v.status !== "supported") expect(v.message, `${row.path}=${v.value}`).toBeTruthy();
      }
    }
  });

  it("uses only catalogued error codes", () => {
    for (const row of FIELDS) {
      if (row.status === "rejected" || row.status.startsWith("planned")) expect(Object.keys(VALIDATION_ERROR_CODES), row.path).toContain(row.code);
      if (row.status === "ignored") expect(row.code, row.path).toBe("FIELD_IGNORED");
      if (row.maxItems) expect(Object.keys(VALIDATION_ERROR_CODES), row.path).toContain(row.maxItems.code);
    }
  });

  it("lists every map field in MAP_FIELD_NAMES, so normalizeKeys never rewrites its keys", () => {
    for (const row of FIELDS.filter((r) => r.map)) expect(MAP_FIELD_NAMES.has(fieldNameOf(row.path)), row.path).toBe(true);
  });

  const expected: Record<string, FieldStatus> = {
    "model.shipments[].pickups[].arrivalLocation": "supported",
    "model.shipments[].pickups[].arrivalWaypoint.location.latLng": "supported",
    "model.shipments[].deliveries[].duration": "supported",
    "model.shipments[].deliveries[].timeWindows[].startTime": "supported",
    "model.shipments[].deliveries[].timeWindows[].softStartTime": "supported",
    "model.shipments[].deliveries[].timeWindows[].costPerHourBeforeSoftStartTime": "supported",
    "model.shipments[].loadDemands": "supported",
    "model.shipments[].penaltyCost": "supported",
    "model.shipments[].allowedVehicleIndices": "supported",
    "model.shipments[].label": "supported",
    "model.shipments[].ignore": "supported",
    "model.shipments[].costsPerVehicle": "planned-v2",
    "model.shipments[].pickupToDeliveryRelativeDetourLimit": "planned-v2",
    "model.shipments[].pickupToDeliveryAbsoluteDetourLimit": "planned-v2",
    "model.shipments[].pickupToDeliveryTimeLimit": "planned-v2",
    "model.shipments[].shipmentType": "planned-v2",
    "model.shipments[].deliveries[].visitTypes": "planned-v2",
    "model.shipments[].pickups[].arrivalWaypoint.placeId": "rejected",
    "model.shipments[].pickups[].arrivalWaypoint.sideOfRoad": "ignored",
    "model.shipments[].pickups[].arrivalWaypoint.location.heading": "ignored",
    "model.vehicles[].startLocation": "supported",
    "model.vehicles[].startTimeWindows[].endTime": "supported",
    "model.vehicles[].loadLimits{}.maxLoad": "supported",
    "model.vehicles[].loadLimits{}.softMaxLoad": "supported",
    "model.vehicles[].loadLimits{}.startLoadInterval": "planned-v2",
    "model.vehicles[].fixedCost": "supported",
    "model.vehicles[].costPerHour": "supported",
    "model.vehicles[].costPerTraveledHour": "supported",
    "model.vehicles[].costPerKilometer": "supported",
    "model.vehicles[].routeDurationLimit.maxDuration": "supported",
    "model.vehicles[].routeDurationLimit.softMaxDuration": "supported",
    "model.vehicles[].routeDurationLimit.quadraticSoftMaxDuration": "planned-v3",
    "model.vehicles[].travelDurationLimit.maxDuration": "supported",
    "model.vehicles[].routeDistanceLimit.maxMeters": "supported",
    "model.vehicles[].routeDistanceLimit.softMaxMeters": "supported",
    "model.vehicles[].routeDistanceLimit.costPerKilometerBelowSoftMax": "rejected",
    "model.vehicles[].breakRule.breakRequests": "supported",
    "model.vehicles[].breakRule.frequencyConstraints": "planned-v3",
    "model.vehicles[].travelMode": "supported",
    "model.vehicles[].usedIfRouteIsEmpty": "planned-v2",
    "model.vehicles[].extraVisitDurationForVisitType": "planned-v2",
    "model.vehicles[].travelDurationMultiple": "planned-v2",
    "model.vehicles[].unloadingPolicy": "planned-v3",
    "model.vehicles[].routeModifiers": "planned-v3",
    "model.vehicles[].unmapProfile": "supported",
    "model.globalStartTime": "supported",
    "model.globalEndTime": "supported",
    "model.durationDistanceMatrices": "supported",
    "model.durationDistanceMatrixSrcTags": "supported",
    "model.maxActiveVehicles": "planned-v2",
    "model.precedenceRules": "planned-v3",
    "model.transitionAttributes": "planned-v3",
    "model.objectives": "planned-v3",
    "model.shipmentTypeIncompatibilities": "planned-v2",
    "model.shipmentTypeRequirements": "planned-v2",
    timeout: "supported",
    solvingMode: "supported",
    searchMode: "supported",
    populatePolylines: "supported",
    populateTransitionPolylines: "ignored",
    label: "supported",
    useGeodesicDistances: "supported",
    geodesicMetersPerSecond: "supported",
    maxValidationErrors: "supported",
    considerRoadTraffic: "ignored",
    parent: "ignored",
    injectedFirstSolutionRoutes: "planned-v2",
    injectedSolutionConstraint: "planned-v2",
    refreshDetailsRoutes: "planned-v2",
    interpretInjectedSolutionsUsingLabels: "planned-v2",
  };

  it.each(Object.entries(expected))("classifies %s as %s", (path, status) => {
    expect(fieldByPath(path)?.status).toBe(status);
  });

  it("classifies enum values per the V1 scope", () => {
    const modes = fieldByPath("solvingMode")?.enumValues ?? [];
    expect(Object.fromEntries(modes.map((v) => [v.value, v.status]))).toEqual({
      DEFAULT_SOLVE: "supported",
      VALIDATE_ONLY: "supported",
      DETECT_SOME_INFEASIBLE_SHIPMENTS: "planned-v2",
      TRANSFORM_AND_RETURN_REQUEST: "planned-v3",
    });
    const travel = fieldByPath("model.vehicles[].travelMode")?.enumValues ?? [];
    expect(Object.fromEntries(travel.map((v) => [v.value, v.status]))).toEqual({
      TRAVEL_MODE_UNSPECIFIED: "supported",
      DRIVING: "supported",
      WALKING: "planned-v2",
    });
  });
});
