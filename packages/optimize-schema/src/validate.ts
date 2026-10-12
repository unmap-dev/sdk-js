/**
 * `validateRequest`: the one reading of a GMPRO OptimizeToursRequest.
 *
 * It normalizes snake_case to camelCase, walks the body against the field-status table (unknown,
 * rejected, planned and ignored fields, and the type of every supported one), runs the checks that
 * span fields (locations, time windows, references, matrix shapes), and applies GMPRO's defaults.
 * Errors stop at `maxValidationErrors`. Nothing here logs or keeps the body.
 */

import { fieldReferenceOf, type ValidationErrorCode, type ValidationIssue, type ValidationWarning } from "./errors";
import { childrenOf, IGNORED_CODE, MAX_LOAD_TYPES, type FieldRow } from "./fields";
import { joinPath, normalizeKeys, parseDuration, parseInt64, parseTimestamp, ProtoJsonError } from "./protojson";
import type { OptimizeToursRequest } from "./types";

export const DEFAULT_GLOBAL_START_TIME = "1970-01-01T00:00:00Z";
export const DEFAULT_GLOBAL_END_TIME = "1971-01-01T00:00:00Z";
export const DEFAULT_MAX_VALIDATION_ERRORS = 100;
export const MAX_VALIDATION_ERRORS_CAP = 10_000;
/**
 * The longest global window, in seconds (about 31.7 years): one below the solver's `UNREACHABLE`
 * (1,000,000,000), which every solver time must stay under. GMPRO sets no such bound; a longer
 * window used to reach the solver and come back as a 500.
 */
export const MAX_HORIZON_SECONDS = 999_999_999;

export interface ValidateOptions {
  /** Overrides the request's own `maxValidationErrors` (still capped at 10,000). */
  maxValidationErrors?: number;
}

export interface ValidationResult {
  /**
   * The camelCase request with GMPRO defaults applied and every int32/int64 field as a JSON number
   * (durations and timestamps stay as sent); `null` when the body is not an object. Read it only
   * when `errors` is empty.
   */
  request: OptimizeToursRequest | null;
  errors: ValidationIssue[];
  warnings: ValidationWarning[];
  /** True when more errors existed than `maxValidationErrors` allowed. */
  truncated: boolean;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const present = (value: unknown): boolean => value !== undefined && value !== null;
const INT32 = /^-?\d+$/;

/**
 * Map keys that name a property every object already has (`__proto__`, `constructor`, `toString`,
 * ...) or `prototype`. A lookup such as `loadDemands[type]` with one of them finds the inherited
 * value when the entry is absent, and `__proto__` cannot be stored as an entry by plain assignment,
 * so they are refused rather than special-cased everywhere a map is read.
 */
const isReservedMapKey = (key: string): boolean => key === "prototype" || key in Object.prototype;

/** True when a value is what GMPRO would read as "not set". */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0 || value === "" || value === "0" || value === "0s") return true;
  if (typeof value === "string") return value.endsWith("_UNSPECIFIED");
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.values(value).every(isEmptyValue);
  return false;
}

/** True when sending this value is the same as not sending the field. */
export function isDefaultValue(row: FieldRow, value: unknown): boolean {
  if (value === undefined || value === null) return true;
  // GMPRO's own default value is never "using" a field; past that, an optional scalar counts as set.
  if (row.default !== undefined && value === row.default) return true;
  if (row.presenceCounts) return false;
  if (typeof value === "string" && !row.repeated && !row.map) {
    // A string's zero depends on what the string encodes.
    if (value === "") return true;
    if (row.type === "enum") return value.endsWith("_UNSPECIFIED");
    if (row.type === "int64") return /^-?0+$/.test(value);
    if (row.type === "duration") return /^-?0+(\.0+)?s$/.test(value);
    return false;
  }
  return isEmptyValue(value);
}

const describeType: Record<FieldRow["type"], string> = {
  object: "an object",
  any: "a value",
  string: "a string",
  boolean: "true or false",
  number: "a number",
  int32: "an integer",
  int64: "an integer",
  duration: 'a duration string such as "300s"',
  timestamp: "an RFC 3339 timestamp",
  enum: "an enum name",
};

const scalarText = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

export function validateRequest(raw: unknown, opts: ValidateOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings = new Map<string, ValidationWarning>();
  let truncated = false;

  if (!isObject(raw)) {
    return {
      request: null,
      errors: [issue("INVALID_REQUEST", "", "The request body must be a JSON object.")],
      warnings: [],
      truncated: false,
    };
  }

  const normalized = normalizeKeys(raw);
  const request = normalized.value as Json;
  const limit = errorLimit(opts.maxValidationErrors ?? request.maxValidationErrors);
  const full = () => errors.length >= limit;

  function issue(code: ValidationErrorCode, path: string, errorMessage: string, extra: { hint?: string; value?: unknown } = {}): ValidationIssue {
    const out: ValidationIssue = { code, displayName: code, path, fields: [fieldReferenceOf(path)], errorMessage };
    if (extra.hint) out.hint = extra.hint;
    const text = scalarText(extra.value);
    if (text !== undefined) out.offendingValues = text;
    return out;
  }

  function add(code: ValidationErrorCode, path: string, message: string, extra: { hint?: string; value?: unknown } = {}): void {
    if (full()) {
      truncated = true;
      return;
    }
    errors.push(issue(code, path, message, extra));
  }

  function warn(row: FieldRow, path: string): void {
    const existing = warnings.get(row.path);
    if (existing) existing.count += 1;
    else warnings.set(row.path, { code: IGNORED_CODE, field: row.path, path, count: 1, message: row.message ?? "" });
  }

  for (const conflict of normalized.conflicts) {
    add("CONFLICTING_FIELD_NAMES", conflict.path, `Both ${conflict.names[0]} and ${conflict.names[1]} are set; send one spelling.`);
  }

  // ------------------------------------------------------------------------------------------
  // Table walk

  function walkObject(node: Json, tablePath: string, path: string): void {
    const children = childrenOf(tablePath);
    for (const [name, value] of Object.entries(node)) {
      const childPath = joinPath(path, name);
      const row = children.get(name);
      if (!row) {
        add("UNKNOWN_FIELD", childPath, `Unknown field "${name}".`);
        continue;
      }
      if (!present(value)) continue;
      switch (row.status) {
        case "supported":
          checkField(row, value, childPath, (v) => (node[name] = v));
          break;
        case "ignored":
          if (!isDefaultValue(row, value)) warn(row, childPath);
          break;
        default:
          if (!isDefaultValue(row, value)) {
            add(row.code as ValidationErrorCode, childPath, row.message ?? "", { hint: row.hint, value });
          }
      }
    }
    for (const [name, row] of children) {
      if (row.required && row.status === "supported" && !present(node[name])) {
        add("MISSING_REQUIRED_FIELD", joinPath(path, name), `${name} is required.`);
      }
      const when = row.requiredWhen;
      if (when && row.status === "supported" && node[when.field] === when.equals && !present(node[name])) {
        add("MISSING_REQUIRED_FIELD", joinPath(path, name), `${name} is required when ${when.field} is ${String(when.equals)}.`);
      }
    }
  }

  /** `set` replaces the value in the request; integers sent as decimal strings come back as numbers. */
  function checkField(row: FieldRow, value: unknown, path: string, set: (value: unknown) => void): void {
    if (row.repeated) {
      if (!Array.isArray(value)) return add("INVALID_TYPE", path, `Expected an array of ${describeType[row.type]}.`);
      if (row.maxItems && value.length > row.maxItems.max) {
        add(row.maxItems.code as ValidationErrorCode, path, row.maxItems.message);
      }
      value.forEach((element, i) => checkSingle(row, element, joinPath(path, i), (v) => (value[i] = v)));
    } else if (row.map) {
      if (!isObject(value)) return add("INVALID_TYPE", path, `Expected an object keyed by name.`);
      for (const [key, element] of Object.entries(value)) {
        const keyPath = joinPath(path, key, "key");
        if (isReservedMapKey(key)) {
          add("INVALID_VALUE", keyPath, `"${key}" cannot be a key of ${row.path.split(".").at(-1)}; use another name.`);
          continue;
        }
        checkSingle(row, element, keyPath, (v) => (value[key] = v));
      }
    } else {
      checkSingle(row, value, path, set);
    }
  }

  function checkRange(row: FieldRow, n: number, path: string, value: unknown): void {
    if (row.minimum !== undefined && n < row.minimum) {
      add("OUT_OF_RANGE", path, row.type === "duration" && row.minimum === 0 ? "Must not be negative." : `Must be at least ${row.minimum}.`, { value });
    } else if (row.exclusiveMinimum !== undefined && n <= row.exclusiveMinimum) {
      add("OUT_OF_RANGE", path, `Must be greater than ${row.exclusiveMinimum}.`, { value });
    } else if (row.maximum !== undefined && n > row.maximum) {
      add("OUT_OF_RANGE", path, `Must be at most ${row.maximum}.`, { value });
    }
  }

  function checkSingle(row: FieldRow, value: unknown, path: string, set: (value: unknown) => void): void {
    const wrongType = () => add("INVALID_TYPE", path, `Expected ${describeType[row.type]}.`, { value });
    switch (row.type) {
      case "object":
        if (!isObject(value)) return wrongType();
        return walkObject(value, row.path, path);
      case "any":
        return;
      case "string":
        if (typeof value !== "string") return wrongType();
        return;
      case "boolean":
        if (typeof value !== "boolean") return wrongType();
        return;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) return wrongType();
        return checkRange(row, value, path, value);
      case "int32": {
        const n = typeof value === "string" && INT32.test(value) ? Number(value) : value;
        if (typeof n !== "number" || !Number.isInteger(n) || n < -2_147_483_648 || n > 2_147_483_647) return wrongType();
        set(n);
        return checkRange(row, n, path, value);
      }
      case "int64":
      case "duration":
      case "timestamp": {
        let n: number;
        try {
          n = row.type === "int64" ? parseInt64(value) : row.type === "duration" ? parseDuration(value) : parseTimestamp(value);
        } catch (error) {
          const code: ValidationErrorCode = row.type === "int64" ? "INVALID_INT64" : row.type === "duration" ? "INVALID_DURATION" : "INVALID_TIMESTAMP";
          return add(code, path, error instanceof ProtoJsonError ? error.message : `Expected ${describeType[row.type]}.`, { value });
        }
        if (row.type !== "timestamp") checkRange(row, n, path, value);
        // Downstream code reads integers as numbers; durations and timestamps stay in wire form.
        if (row.type === "int64") set(n);
        return;
      }
      case "enum": {
        const known = row.enumValues ?? [];
        const match = typeof value === "string" ? known.find((v) => v.value === value) : undefined;
        if (!match) {
          return add("INVALID_ENUM_VALUE", path, `Expected one of ${known.map((v) => v.value).join(", ")}.`, { value });
        }
        if (match.status !== "supported") add("VALUE_NOT_SUPPORTED_YET", path, match.message ?? "", { value });
        return;
      }
    }
  }

  walkObject(request, "", "");
  crossFieldChecks(request, add);

  applyDefaults(request);
  return { request: request as OptimizeToursRequest, errors, warnings: [...warnings.values()], truncated };
}

function errorLimit(value: unknown): number {
  const n = typeof value === "string" && INT32.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return DEFAULT_MAX_VALIDATION_ERRORS;
  return Math.min(n, MAX_VALIDATION_ERRORS_CAP);
}

function applyDefaults(request: Json): void {
  if (!present(request.solvingMode)) request.solvingMode = "DEFAULT_SOLVE";
  request.maxValidationErrors = errorLimit(request.maxValidationErrors);
  if (!present(request.model)) request.model = {};
  if (isObject(request.model)) {
    if (!present(request.model.globalStartTime)) request.model.globalStartTime = DEFAULT_GLOBAL_START_TIME;
    if (!present(request.model.globalEndTime)) request.model.globalEndTime = DEFAULT_GLOBAL_END_TIME;
  }
}

// ---------------------------------------------------------------------------------------------
// Checks that span fields. Each one reads only values the walk already accepted: anything it
// cannot parse was reported there, so here it is skipped rather than reported twice.

type Add = (code: ValidationErrorCode, path: string, message: string, extra?: { hint?: string; value?: unknown }) => void;

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const objects = (value: unknown): [Json, number][] =>
  list(value).flatMap((item, i): [Json, number][] => (isObject(item) ? [[item, i]] : []));
const strings = (value: unknown): string[] => list(value).filter((v): v is string => typeof v === "string");

function tryTimestamp(value: unknown): number | undefined {
  if (!present(value)) return undefined;
  try {
    return parseTimestamp(value);
  } catch {
    return undefined;
  }
}

/** Refuses the first load type name past {@link MAX_LOAD_TYPES}, once. Reserved keys were refused by the walk. */
function loadTypeCap(model: Json, add: Add): void {
  const seen = new Set<string>();
  const maps: [unknown, string][] = [
    ...objects(model.shipments).map(([shipment, i]): [unknown, string] => [shipment.loadDemands, `model.shipments[${i}].loadDemands`]),
    ...objects(model.vehicles).map(([vehicle, i]): [unknown, string] => [vehicle.loadLimits, `model.vehicles[${i}].loadLimits`]),
  ];
  for (const [map, at] of maps) {
    if (!isObject(map)) continue;
    for (const key of Object.keys(map)) {
      if (isReservedMapKey(key) || seen.has(key)) continue;
      seen.add(key);
      if (seen.size > MAX_LOAD_TYPES) {
        add(
          "OUT_OF_RANGE",
          joinPath(at, key, "key"),
          `A request may use at most ${MAX_LOAD_TYPES} distinct load types (loadDemands and loadLimits keys across the whole model); this is load type ${seen.size}.`,
        );
        return;
      }
    }
  }
}

/**
 * Refuses, once per load type, the shipment whose amounts push that type's total over every pickup
 * and delivery past 2^53 - 1. The solver bounds an unlimited capacity by that total, so it must stay
 * an exact integer; past it the solver would overflow and answer 500.
 */
function loadTotals(model: Json, add: Add): void {
  const totals = new Map<string, number>();
  const refused = new Set<string>();
  for (const [shipment, s] of objects(model.shipments)) {
    if (!isObject(shipment.loadDemands)) continue;
    const visits = list(shipment.pickups).length + list(shipment.deliveries).length;
    for (const [key, demand] of Object.entries(shipment.loadDemands)) {
      if (isReservedMapKey(key) || refused.has(key) || !isObject(demand) || typeof demand.amount !== "number") continue;
      const total = (totals.get(key) ?? 0) + demand.amount * visits;
      totals.set(key, total);
      if (total > Number.MAX_SAFE_INTEGER) {
        refused.add(key);
        add(
          "OUT_OF_RANGE",
          joinPath(joinPath(`model.shipments[${s}].loadDemands`, key, "key"), "amount"),
          `The amounts of this load type over every pickup and delivery add up to more than ${Number.MAX_SAFE_INTEGER}; scale them down.`,
        );
      }
    }
  }
}

function crossFieldChecks(request: Json, add: Add): void {
  const model = isObject(request.model) ? request.model : {};
  const globalStart = tryTimestamp(model.globalStartTime) ?? 0;
  const globalEnd = tryTimestamp(model.globalEndTime) ?? 31_536_000;
  if (globalStart >= globalEnd) {
    add("INVALID_TIME_WINDOW", "model.globalEndTime", "globalEndTime must be after globalStartTime.");
  } else if (globalEnd - globalStart > MAX_HORIZON_SECONDS) {
    add("OUT_OF_RANGE", "model.globalEndTime", `globalEndTime must be at most ${MAX_HORIZON_SECONDS} seconds (about 31 years) after globalStartTime.`);
  }

  /**
   * Windows in one list must be disjoint and not adjacent (GMPRO, for visits and vehicles alike). A
   * window that cannot be read was reported by the walk and is skipped. Returns the earliest open
   * and the latest close of the windows it could read.
   */
  const timeWindows = (value: unknown, path: string): { opens: number; closes: number } => {
    let opens = Infinity;
    let closes = -Infinity;
    let previousEnd = -Infinity;
    for (const [window, i] of objects(value)) {
      const at = joinPath(path, i);
      const start = present(window.startTime) ? tryTimestamp(window.startTime) : globalStart;
      const end = present(window.endTime) ? tryTimestamp(window.endTime) : globalEnd;
      if (start === undefined || end === undefined) continue;
      opens = Math.min(opens, start);
      closes = Math.max(closes, end);
      if (start < globalStart || end > globalEnd) {
        add("INVALID_TIME_WINDOW", at, "A time window must lie inside model.globalStartTime to model.globalEndTime.");
      } else if (start > end) {
        add("INVALID_TIME_WINDOW", at, "A time window's startTime must not be after its endTime.");
      } else if (start <= previousEnd) {
        add("INVALID_TIME_WINDOW", at, "Time windows must be in increasing order and must not overlap or touch.");
      }
      previousEnd = Math.max(previousEnd, end);
    }
    return { opens, closes };
  };

  const waypoint = (value: unknown, path: string): void => {
    if (!isObject(value) || present(value.placeId)) return;
    if (!isObject(value.location)) add("MISSING_REQUIRED_FIELD", joinPath(path, "location"), "A waypoint needs location.latLng.");
    else if (!present(value.location.latLng)) add("MISSING_REQUIRED_FIELD", joinPath(path, "location.latLng"), "A waypoint location needs latLng.");
  };

  const uniqueAndNotEmpty = (tags: string[]): boolean => new Set(tags).size === tags.length && !tags.includes("");

  // Matrices and their tags (GMPRO ShipmentModel.durationDistanceMatrices and its tag lists).
  const matrices = objects(model.durationDistanceMatrices);
  const usesMatrices = list(model.durationDistanceMatrices).length > 0;
  const srcTags = strings(model.durationDistanceMatrixSrcTags);
  const dstTags = strings(model.durationDistanceMatrixDstTags);
  for (const [tags, name] of [[srcTags, "durationDistanceMatrixSrcTags"], [dstTags, "durationDistanceMatrixDstTags"]] as const) {
    if (!uniqueAndNotEmpty(tags)) add("INVALID_VALUE", `model.${name}`, `Every tag in ${name} must be unique and not empty.`);
    if (usesMatrices && tags.length === 0) {
      add("MISSING_REQUIRED_FIELD", `model.${name}`, `With model.durationDistanceMatrices, ${name} must name the matrix ${name.endsWith("SrcTags") ? "rows" : "columns"}.`);
    }
  }
  if (!usesMatrices && srcTags.length + dstTags.length > 0) {
    add("MISSING_REQUIRED_FIELD", "model.durationDistanceMatrices", "durationDistanceMatrixSrcTags and durationDistanceMatrixDstTags need model.durationDistanceMatrices.");
  }
  if (usesMatrices && request.useGeodesicDistances === true) {
    add("MUTUALLY_EXCLUSIVE_FIELDS", "useGeodesicDistances", "useGeodesicDistances must not be true when the model has durationDistanceMatrices.");
  }
  const matrixTags: string[] = [];
  if (usesMatrices) {
    for (const [matrix, i] of matrices) {
      const at = `model.durationDistanceMatrices[${i}]`;
      const rows = list(matrix.rows);
      if (rows.length !== srcTags.length) {
        add("MATRIX_SHAPE_MISMATCH", `${at}.rows`, `Expected ${srcTags.length} rows, one per durationDistanceMatrixSrcTags entry; got ${rows.length}.`);
      }
      for (const [row, j] of objects(matrix.rows)) {
        for (const name of ["durations", "meters"] as const) {
          const cells = list(row[name]);
          if (cells.length !== dstTags.length) {
            add("MATRIX_SHAPE_MISMATCH", `${at}.rows[${j}].${name}`, `Expected ${dstTags.length} ${name}, one per durationDistanceMatrixDstTags entry; got ${cells.length}.`);
          }
        }
      }
      const tag = typeof matrix.vehicleStartTag === "string" ? matrix.vehicleStartTag : "";
      if (matrices.length > 1 && (tag === "" || matrixTags.includes(tag))) {
        add("INVALID_VALUE", `${at}.vehicleStartTag`, "With more than one matrix, each needs its own non-empty vehicleStartTag.");
      }
      if (tag !== "") matrixTags.push(tag);
    }
  }
  const matchesOne = (tags: string[], pool: string[]): boolean => tags.filter((tag) => pool.includes(tag)).length === 1;
  /** Called only with matrices: coordinates are refused there, every stop is placed by its tags. */
  const noCoordinates = (owner: Json, name: string, at: string, what: string): void => {
    if (present(owner[name])) {
      add("MUTUALLY_EXCLUSIVE_FIELDS", `${at}.${name}`, `With model.durationDistanceMatrices, ${what}; ${name} must not be set.`);
    }
  };

  loadTypeCap(model, add);
  loadTotals(model, add);

  // Shipments.
  const vehicleCount = list(model.vehicles).length;
  for (const [shipment, s] of objects(model.shipments)) {
    const at = `model.shipments[${s}]`;
    if (list(shipment.pickups).length + list(shipment.deliveries).length === 0) {
      add("MISSING_REQUIRED_FIELD", at, "A shipment needs at least one pickup or delivery.");
    }
    for (const kind of ["pickups", "deliveries"] as const) {
      for (const [visit, v] of objects(shipment[kind])) {
        const visitAt = `${at}.${kind}[${v}]`;
        const hasLocation = present(visit.arrivalLocation);
        const hasWaypoint = present(visit.arrivalWaypoint);
        if (usesMatrices) {
          noCoordinates(visit, "arrivalLocation", visitAt, "a visit is placed by its tags");
          noCoordinates(visit, "arrivalWaypoint", visitAt, "a visit is placed by its tags");
        } else if (hasLocation && hasWaypoint) {
          add("MUTUALLY_EXCLUSIVE_FIELDS", visitAt, "Send arrivalLocation or arrivalWaypoint, not both.");
        } else if (!hasLocation && !hasWaypoint) {
          add("MISSING_REQUIRED_FIELD", visitAt, "A visit needs arrivalLocation or arrivalWaypoint, or tags into durationDistanceMatrices.");
        }
        waypoint(visit.arrivalWaypoint, `${visitAt}.arrivalWaypoint`);
        timeWindows(visit.timeWindows, `${visitAt}.timeWindows`);
        const tags = strings(visit.tags);
        if (!uniqueAndNotEmpty(tags)) {
          add("INVALID_VALUE", `${visitAt}.tags`, "A visit's tags must be unique and not empty.");
        } else if (usesMatrices && tags.length === 0) {
          add(
            "MISSING_REQUIRED_FIELD",
            `${visitAt}.tags`,
            "With model.durationDistanceMatrices, every visit needs tags that match exactly one durationDistanceMatrixSrcTags entry and exactly one durationDistanceMatrixDstTags entry.",
          );
        } else if (usesMatrices && (!matchesOne(tags, srcTags) || !matchesOne(tags, dstTags))) {
          add("INVALID_REFERENCE", `${visitAt}.tags`, "A visit's tags must match exactly one durationDistanceMatrixSrcTags entry and exactly one durationDistanceMatrixDstTags entry.");
        }
      }
    }
    list(shipment.allowedVehicleIndices).forEach((index, i) => {
      if (typeof index === "number" && index >= vehicleCount) {
        add("INVALID_REFERENCE", `${at}.allowedVehicleIndices[${i}]`, `Vehicle index ${index} does not exist; the model has ${vehicleCount} vehicles.`, { value: index });
      }
    });
  }

  // Vehicles.
  for (const [vehicle, i] of objects(model.vehicles)) {
    const at = `model.vehicles[${i}]`;
    const spans: Partial<Record<"start" | "end", { opens: number; closes: number }>> = {};
    for (const end of ["start", "end"] as const) {
      const placed = end === "start" ? "a vehicle's start is placed by startTags" : "a vehicle's end is placed by endTags";
      if (usesMatrices) {
        noCoordinates(vehicle, `${end}Location`, at, placed);
        noCoordinates(vehicle, `${end}Waypoint`, at, placed);
      } else if (present(vehicle[`${end}Location`]) && present(vehicle[`${end}Waypoint`])) {
        add("MUTUALLY_EXCLUSIVE_FIELDS", at, `Send ${end}Location or ${end}Waypoint, not both.`);
      }
      waypoint(vehicle[`${end}Waypoint`], `${at}.${end}Waypoint`);
      if (list(vehicle[`${end}TimeWindows`]).length > 0) spans[end] = timeWindows(vehicle[`${end}TimeWindows`], `${at}.${end}TimeWindows`);
      const tags = strings(vehicle[`${end}Tags`]);
      if (!uniqueAndNotEmpty(tags)) {
        add("INVALID_VALUE", `${at}.${end}Tags`, `A vehicle's ${end}Tags must be unique and not empty.`);
      } else if (usesMatrices && tags.length > 0 && !matchesOne(tags, end === "start" ? srcTags : dstTags)) {
        add(
          "INVALID_REFERENCE",
          `${at}.${end}Tags`,
          `A vehicle's ${end}Tags must match exactly one ${end === "start" ? "durationDistanceMatrixSrcTags" : "durationDistanceMatrixDstTags"} entry.`,
        );
      }
    }
    // No route fits a vehicle whose last end time comes before its first start time.
    const opens = spans.start?.opens ?? globalStart;
    const closes = spans.end?.closes ?? globalEnd;
    if (Number.isFinite(opens) && Number.isFinite(closes) && closes < opens) {
      add("INVALID_TIME_WINDOW", `${at}.endTimeWindows`, "A vehicle's endTimeWindows must not close before its startTimeWindows opens.");
    }
    // A matrix with a vehicleStartTag applies only to the vehicles whose startTags carry it, so once
    // any matrix has one, every vehicle must select exactly one matrix (GMPRO: "each vehicle start
    // must match exactly one matrix").
    if (matrixTags.length > 0) {
      const startTags = strings(vehicle.startTags);
      const matched = matrixTags.filter((tag) => startTags.includes(tag)).length;
      if (matched !== 1) {
        add(
          "INVALID_REFERENCE",
          `${at}.startTags`,
          `A vehicle's startTags must match exactly one durationDistanceMatrices[].vehicleStartTag; this one matches ${matched}.`,
        );
      }
    }
    const breakRule = isObject(vehicle.breakRule) ? vehicle.breakRule : {};
    for (const [request, b] of objects(breakRule.breakRequests)) {
      const earliest = tryTimestamp(request.earliestStartTime);
      const latest = tryTimestamp(request.latestStartTime);
      if (earliest !== undefined && latest !== undefined && earliest > latest) {
        add("INVALID_TIME_WINDOW", `${at}.breakRule.breakRequests[${b}]`, "A break's earliestStartTime must not be after its latestStartTime.");
      }
    }
  }
}
