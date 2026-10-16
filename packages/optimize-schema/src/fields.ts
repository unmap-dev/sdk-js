/**
 * THE field-status table for Unmap Optimize: one row per GMPRO field reachable from
 * `OptimizeToursRequest`, plus the Unmap extension `vehicles[].unmapProfile`.
 *
 * This table is the single source. The validator (`validate.ts`) walks requests with it, the JSON
 * Schema emitter (`json-schema.ts`) builds the schema from it, `docs/optimize/spec.md` is generated
 * from it (`spec.ts`), and the website's field-support page reads it. A field that is not in the
 * table is an unknown field and is refused.
 *
 * Path syntax: dot-separated camelCase names; an array field's children sit under `name[]` and a
 * map field's values under `name{}`, so `model.shipments[].pickups[].timeWindows[].startTime` and
 * `model.vehicles[].loadLimits{}.maxLoad`. A row's own path never ends in `[]` or `{}`; `repeated`
 * and `map` say what it holds.
 *
 * Rows only nest under a supported object row. A field Unmap refuses or ignores is one opaque row,
 * however deep the GMPRO message under it goes, because nothing below it is ever read.
 *
 * Statuses:
 * - `supported`: honoured in V1.
 * - `ignored`: accepted, has no effect, and produces the row's warning when set to a non-default value.
 * - `rejected`: refused with the row's error; Unmap does not plan to support it.
 * - `planned-v2` / `planned-v3`: refused with a "not supported yet" error unless left at its
 *   default value, because silently dropping a constraint would return a plan the caller did not ask for.
 *
 * Descriptions are Unmap's own wording, written from the public GMPRO reference, not copied from it.
 */

export const FIELD_STATUSES = ["supported", "ignored", "rejected", "planned-v2", "planned-v3"] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

/** The value type of a field (of each element for a repeated field, of each value for a map). */
export type FieldType = "object" | "any" | "string" | "boolean" | "number" | "int32" | "int64" | "duration" | "timestamp" | "enum";

export interface EnumValue {
  value: string;
  status: FieldStatus;
  /** The proto enum number; absent for Unmap's own string enums (unmapProfile). */
  number?: number;
  /** The exact error text when this value is sent and its status is not `supported`. */
  message?: string;
}

/** A limit on how many elements a repeated field may hold in this version. */
export interface ItemLimit {
  max: number;
  status: FieldStatus;
  code: string;
  message: string;
}

export interface FieldRow {
  /** Field path in table syntax, such as `model.shipments[].pickups[].timeWindows[].startTime`. */
  path: string;
  type: FieldType;
  /** The field is a JSON array of `type`. */
  repeated?: boolean;
  /** The field is a JSON object whose values are `type` and whose keys are user data. */
  map?: boolean;
  status: FieldStatus;
  /** One sentence, Unmap's own wording. */
  description: string;
  /** Error code for `rejected` and planned rows; `FIELD_IGNORED` for ignored rows. */
  code?: string;
  /** The exact error (rejected, planned) or warning (ignored) text. */
  message?: string;
  /** What to do instead. */
  hint?: string;
  /** Why the row has the status it has, when the choice was not obvious. */
  rationale?: string;
  /** GMPRO's value when the field is absent. Sending exactly this value counts as not using the field. */
  default?: string | number | boolean;
  /** Any value counts as using the field, including zero and false (proto3 `optional` scalars). */
  presenceCounts?: boolean;
  required?: boolean;
  /** Required when a sibling field has this value, such as geodesicMetersPerSecond when useGeodesicDistances is true. */
  requiredWhen?: { field: string; equals: string | number | boolean };
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  enumValues?: readonly EnumValue[];
  maxItems?: ItemLimit;
}

/**
 * The most distinct load type names (the union of every `loadDemands` and `loadLimits` key) one
 * request may use. Each one becomes a load dimension on every solver node and vehicle and one or
 * two solver dimensions, so the count drives both the body the solver receives and the time it
 * spends building the model before its time limit starts. GMPRO models rarely use more than a
 * handful (weight, volume, pallets, a temperature class or two); 16 leaves room for that and keeps
 * a request from turning a 2 MB body into thousands of solver dimensions.
 */
export const MAX_LOAD_TYPES = 16;

export const PLANNED_HINT = "Remove the field or leave it at its default value.";
export const IGNORED_CODE = "FIELD_IGNORED";
export const PLANNED_CODE = "FIELD_NOT_SUPPORTED_YET";
export const PLANNED_VALUE_CODE = "VALUE_NOT_SUPPORTED_YET";

const versionOf = (status: FieldStatus): string => (status === "planned-v3" ? "V3" : "V2");

type Extra = Partial<Omit<FieldRow, "path" | "type" | "status" | "description">>;

const supported = (path: string, type: FieldType, description: string, extra: Extra = {}): FieldRow => ({
  path,
  type,
  status: "supported",
  description,
  ...extra,
});

const ignored = (path: string, type: FieldType, description: string, message: string, extra: Extra = {}): FieldRow => ({
  path,
  type,
  status: "ignored",
  description,
  code: IGNORED_CODE,
  message,
  ...extra,
});

const planned = (path: string, type: FieldType, version: "planned-v2" | "planned-v3", description: string, extra: Extra = {}): FieldRow => ({
  path,
  type,
  status: version,
  description,
  code: PLANNED_CODE,
  message: `${path} is not supported yet (planned for ${versionOf(version)}).`,
  hint: PLANNED_HINT,
  ...extra,
});

/**
 * Enum values with statuses, in proto order. `numbered` gives each value its proto number
 * (GMPRO's enums count from 0 in declaration order); Unmap's own string enums pass false.
 */
const values = (path: string, entries: Record<string, FieldStatus>, numbered = true): EnumValue[] =>
  Object.entries(entries).map(([value, status], number) => ({
    value,
    status,
    ...(numbered ? { number } : {}),
    ...(status === "supported" ? {} : { message: `${path} ${value} is not supported yet (planned for ${versionOf(status)}).` }),
  }));

const nonNegative: Extra = { minimum: 0 };

// ---------------------------------------------------------------------------------------------
// Reusable message subtrees

function latLngRows(path: string, description: string): FieldRow[] {
  return [
    supported(path, "object", description),
    supported(`${path}.latitude`, "number", "Latitude in degrees, from -90 to 90.", { minimum: -90, maximum: 90, default: 0 }),
    supported(`${path}.longitude`, "number", "Longitude in degrees, from -180 to 180.", { minimum: -180, maximum: 180, default: 0 }),
  ];
}

const DIRECTION_RATIONALE =
  "Ignored rather than rejected: it only refines how a vehicle approaches a stop, so plans stay feasible and clients that set it on every waypoint keep working; travel times can differ slightly from Google's.";

function waypointRows(path: string, what: string, sibling: string): FieldRow[] {
  return [
    supported(path, "object", `${what} as a waypoint; send either this or ${sibling}, not both.`),
    supported(`${path}.location`, "object", "The waypoint's position; required, because place IDs are not supported."),
    ...latLngRows(`${path}.location.latLng`, "Coordinates of the waypoint, in WGS84 degrees."),
    ignored(
      `${path}.location.heading`,
      "int32",
      "Compass direction of travel at the waypoint, in degrees.",
      "location.heading is ignored: Unmap snaps a location to the nearest road whatever the direction of travel.",
      { rationale: DIRECTION_RATIONALE, presenceCounts: true },
    ),
    {
      path: `${path}.placeId`,
      type: "string",
      status: "rejected",
      description: "A Google Places identifier for the waypoint.",
      code: "PLACE_ID_NOT_SUPPORTED",
      message: "Google place IDs are not supported: Unmap cannot resolve them.",
      hint: `Geocode the address with Unmap's /geocode/search and send its coordinates as ${path.split(".").pop()}.location.latLng or ${sibling}.`,
      rationale: "Rejected: a place ID is a reference into Google's database, and guessing a location for it would route to the wrong place.",
    },
    ignored(
      `${path}.sideOfRoad`,
      "boolean",
      "Asks for the vehicle to stop on the waypoint's side of the road.",
      "sideOfRoad is ignored: Unmap travel times do not model which side of the road a stop is on.",
      { rationale: DIRECTION_RATIONALE },
    ),
    ignored(
      `${path}.vehicleStopover`,
      "boolean",
      "Marks the waypoint as a place where the vehicle stops to pick up or drop off.",
      "vehicleStopover is ignored: Unmap snaps every stop to the nearest road a vehicle can use.",
      { rationale: "Ignored rather than rejected: every Unmap stop is already treated as a stopover on a drivable road." },
    ),
  ];
}

function timeWindowRows(path: string, what: string, vehicle?: { name: string }): FieldRow[] {
  const item = `${path}[]`;
  const head = vehicle
    ? supported(path, "object", `Hard time window for ${what}; V1 takes at most one (GMPRO allows several, sorted, not overlapping and not touching).${vehicle.name === "endTimeWindows" ? " It must not close before startTimeWindows opens." : ""}`, {
        repeated: true,
        maxItems: {
          max: 1,
          status: "planned-v2",
          code: PLANNED_VALUE_CODE,
          message: `A vehicle with more than one ${vehicle.name} entry is not supported yet (planned for V2).`,
        },
      })
    : supported(path, "object", `Hard time windows for ${what}; sorted, non-overlapping and not touching.`, { repeated: true });
  return [
    head,
    supported(`${item}.startTime`, "timestamp", "Earliest allowed time; defaults to model.globalStartTime."),
    supported(`${item}.endTime`, "timestamp", "Latest allowed time; defaults to model.globalEndTime."),
    supported(`${item}.softStartTime`, "timestamp", "Soft start: an event before it is allowed and costs costPerHourBeforeSoftStartTime per hour early. Only on a list with a single window, at or after startTime, inside the global window."),
    supported(`${item}.softEndTime`, "timestamp", "Soft end: an event after it is allowed and costs costPerHourAfterSoftEndTime per hour late. Only on a list with a single window, at or before endTime, inside the global window."),
    supported(`${item}.costPerHourBeforeSoftStartTime`, "number", "Cost per hour of an event before softStartTime; needs softStartTime.", nonNegative),
    supported(`${item}.costPerHourAfterSoftEndTime`, "number", "Cost per hour of an event after softEndTime; needs softEndTime.", nonNegative),
  ];
}

function visitRequestRows(path: string, kind: "pickup" | "delivery"): FieldRow[] {
  const item = `${path}[]`;
  return [
    supported(path, "object", `The shipment's ${kind}; V1 takes at most one.`, {
      repeated: true,
      maxItems: {
        max: 1,
        status: "planned-v2",
        code: PLANNED_VALUE_CODE,
        message: `A shipment with more than one ${kind} alternative is not supported yet (planned for V2).`,
      },
    }),
    ...latLngRows(`${item}.arrivalLocation`, `Coordinates of the ${kind} stop, in WGS84 degrees; send either this or arrivalWaypoint, and neither when the model has durationDistanceMatrices.`),
    ...waypointRows(`${item}.arrivalWaypoint`, `The ${kind} stop`, "arrivalLocation"),
    planned(`${item}.departureLocation`, "object", "planned-v2", `Where the vehicle leaves from after the ${kind}, when that differs from where it arrived.`),
    planned(`${item}.departureWaypoint`, "object", "planned-v2", `Waypoint the vehicle leaves from after the ${kind}, when that differs from where it arrived.`),
    supported(`${item}.tags`, "string", `Tags that place the ${kind} in the rows and columns of durationDistanceMatrices; unique and not empty, and required when the model has matrices.`, { repeated: true }),
    ...timeWindowRows(`${item}.timeWindows`, `the start of the ${kind}`),
    supported(`${item}.duration`, "duration", `Time spent at the stop to perform the ${kind}.`, { ...nonNegative, default: "0s" }),
    planned(`${item}.cost`, "number", "planned-v2", `Extra cost for choosing this ${kind} alternative over another.`),
    planned(`${item}.loadDemands`, "object", "planned-v2", `Load changes that apply only when this ${kind} alternative is chosen.`, { map: true }),
    planned(`${item}.visitTypes`, "string", "planned-v2", `Types that add vehicle-specific extra duration to the ${kind}.`, { repeated: true }),
    supported(`${item}.label`, "string", `Caller's label for the ${kind}, echoed as visitLabel in the response.`),
    planned(`${item}.avoidUTurns`, "boolean", "planned-v3", `Asks for routes that avoid U-turns at the ${kind} stop (experimental in GMPRO).`),
  ];
}

function durationLimitRows(path: string, what: string): FieldRow[] {
  return [
    supported(path, "object", `Limits on ${what}.`),
    supported(`${path}.maxDuration`, "duration", `Hard maximum ${what}.`, nonNegative),
    supported(`${path}.softMaxDuration`, "duration", `Soft maximum ${what}: going over it costs costPerHourAfterSoftMax per hour; below maxDuration when both are set.`, nonNegative),
    planned(`${path}.quadraticSoftMaxDuration`, "duration", "planned-v3", `Soft maximum ${what} with a cost that grows with the square of the excess.`),
    supported(`${path}.costPerHourAfterSoftMax`, "number", "Cost per hour over softMaxDuration; needs softMaxDuration.", nonNegative),
    planned(`${path}.costPerSquareHourAfterQuadraticSoftMax`, "number", "planned-v3", "Cost per square hour over the quadratic soft maximum."),
  ];
}

function vehicleEndpointRows(end: "start" | "end"): FieldRow[] {
  const v = "model.vehicles[]";
  const Location = end === "start" ? "startLocation" : "endLocation";
  const Waypoint = end === "start" ? "startWaypoint" : "endWaypoint";
  const where =
    end === "start"
      ? "Where the vehicle starts, in WGS84 degrees; with no start location or waypoint the route starts at its first stop. Not allowed when the model has durationDistanceMatrices."
      : "Where the vehicle ends, in WGS84 degrees; with no end location or waypoint the route ends at its last stop. Not allowed when the model has durationDistanceMatrices.";
  return [
    ...latLngRows(`${v}.${Location}`, where),
    ...waypointRows(`${v}.${Waypoint}`, end === "start" ? "The vehicle's start" : "The vehicle's end", Location),
    supported(
      `${v}.${end}Tags`,
      "string",
      end === "start"
        ? "Tags that place the vehicle's start in durationDistanceMatrices and select its matrix by vehicleStartTag; unique and not empty; with no startTags the route starts at its first stop."
        : "Tags that place the vehicle's end in durationDistanceMatrices; unique and not empty; with no endTags the route ends at its last stop.",
      { repeated: true },
    ),
    ...timeWindowRows(`${v}.${end}TimeWindows`, `the vehicle's ${end} time`, { name: `${end}TimeWindows` }),
  ];
}

// ---------------------------------------------------------------------------------------------
// The table

const S = "model.shipments[]";
const V = "model.vehicles[]";
const M = "model.durationDistanceMatrices[]";

export const FIELDS: readonly FieldRow[] = [
  // OptimizeToursRequest
  ignored("parent", "string", "The Google Cloud project the request belongs to.", "parent is ignored: Unmap has no projects, so the request runs under the API key's account."),
  supported("timeout", "duration", "Time the solver may spend; capped by the plan, and a default applies when absent.", nonNegative),
  supported("model", "object", "The shipments, vehicles and global constraints to plan."),
  supported("solvingMode", "enum", "Whether to solve the model or only validate it.", {
    default: "DEFAULT_SOLVE",
    enumValues: values("solvingMode", {
      DEFAULT_SOLVE: "supported",
      VALIDATE_ONLY: "supported",
      DETECT_SOME_INFEASIBLE_SHIPMENTS: "planned-v2",
      TRANSFORM_AND_RETURN_REQUEST: "planned-v3",
    }),
  }),
  supported("searchMode", "enum", "Trades solution quality for latency: RETURN_FAST stops improving soon after the first solution, CONSUME_ALL_AVAILABLE_TIME (the default behaviour) searches until the timeout.", {
    enumValues: values("searchMode", { SEARCH_MODE_UNSPECIFIED: "supported", RETURN_FAST: "supported", CONSUME_ALL_AVAILABLE_TIME: "supported" }),
  }),
  planned("injectedFirstSolutionRoutes", "any", "planned-v2", "Routes the solver starts from instead of building its own first solution.", { repeated: true }),
  planned("injectedSolutionConstraint", "any", "planned-v2", "A previous solution whose visits are frozen or constrained, for re-optimization."),
  planned("refreshDetailsRoutes", "any", "planned-v2", "Existing routes whose timings and metrics are recomputed without re-solving.", { repeated: true }),
  planned("interpretInjectedSolutionsUsingLabels", "boolean", "planned-v2", "Matches injected routes to the model by label instead of by index."),
  ignored(
    "considerRoadTraffic",
    "boolean",
    "Asks for traffic-aware travel times.",
    "considerRoadTraffic is ignored: Unmap travel times do not use live or historical traffic yet.",
    { rationale: "Ignored rather than rejected: the plan is still valid on free-flow times, and V3 adds historical speeds." },
  ),
  supported("populatePolylines", "boolean", "Adds an encoded polyline for each used route as routes[].routePolyline.", { default: false }),
  ignored(
    "populateTransitionPolylines",
    "boolean",
    "Asks for an encoded polyline per transition between stops.",
    "populateTransitionPolylines is ignored: Unmap returns one polyline per route, as routes[].routePolyline when populatePolylines is true.",
    { rationale: "Ignored rather than rejected: the route polyline carries the same geometry, so a client loses detail, not correctness." },
  ),
  ignored(
    "allowLargeDeadlineDespiteInterruptionRisk",
    "boolean",
    "Allows a long timeout on Google's infrastructure at the risk of interruption.",
    "allowLargeDeadlineDespiteInterruptionRisk is ignored: Unmap caps the timeout per plan and clamps anything longer.",
  ),
  supported("useGeodesicDistances", "boolean", "Uses straight-line distances and a fixed speed instead of road travel times.", { default: false }),
  supported("label", "string", "Caller's label for the request, echoed as requestLabel in the response."),
  supported("geodesicMetersPerSecond", "number", "Speed used with useGeodesicDistances, in metres per second; at least 1.", {
    minimum: 1,
    requiredWhen: { field: "useGeodesicDistances", equals: true },
  }),
  supported("maxValidationErrors", "int32", "Most validation errors to return; defaults to 100 and is capped at 10,000.", { minimum: 0, default: 100 }),

  // ShipmentModel
  supported("model.shipments", "object", "Everything to pick up or deliver.", { repeated: true }),
  supported("model.vehicles", "object", "The fleet that performs the shipments.", { repeated: true }),
  planned("model.objectives", "any", "planned-v3", "Alternative optimization goals that replace the cost model (experimental in GMPRO).", { repeated: true }),
  supported("model.globalStartTime", "timestamp", "Start of the planning horizon; nothing happens before it.", { default: "1970-01-01T00:00:00Z" }),
  supported("model.globalEndTime", "timestamp", "End of the planning horizon; nothing happens after it. At most 999,999,999 seconds (about 31 years) after globalStartTime.", { default: "1971-01-01T00:00:00Z" }),
  planned("model.globalDurationCostPerHour", "number", "planned-v2", "Cost per hour of the whole plan's span, from the earliest start to the latest end."),
  supported("model.durationDistanceMatrices", "object", "Caller-supplied travel durations and distances, used instead of road or straight-line travel. With them, every stop is placed by tags: visits and vehicles must not carry coordinates, and useGeodesicDistances must not be true.", { repeated: true }),
  supported(`${M}.rows`, "object", "One row per source tag, in durationDistanceMatrixSrcTags order.", { repeated: true }),
  supported(`${M}.rows[].durations`, "duration", "Travel durations from this row's source to each destination tag.", { repeated: true, minimum: 0 }),
  supported(`${M}.rows[].meters`, "number", "Travel distances in metres from this row's source to each destination tag.", { repeated: true, minimum: 0 }),
  supported(`${M}.vehicleStartTag`, "string", "The vehicle start tag that selects this matrix; each vehicle's startTags must match exactly one. Empty applies the matrix to every vehicle and is allowed only when there is one matrix."),
  supported("model.durationDistanceMatrixSrcTags", "string", "Tags naming the matrix rows; unique, not empty, and required exactly when durationDistanceMatrices is set.", { repeated: true }),
  supported("model.durationDistanceMatrixDstTags", "string", "Tags naming the matrix columns; unique, not empty, and required exactly when durationDistanceMatrices is set.", { repeated: true }),
  planned("model.transitionAttributes", "any", "planned-v3", "Extra costs, delays and limits on travel between tagged stops.", { repeated: true }),
  planned("model.shipmentTypeIncompatibilities", "any", "planned-v2", "Shipment types that must not share a vehicle.", { repeated: true }),
  planned("model.shipmentTypeRequirements", "any", "planned-v2", "Shipment types that need another type on the same vehicle.", { repeated: true }),
  planned("model.precedenceRules", "any", "planned-v3", "Ordering rules between visits of different shipments.", { repeated: true }),
  planned("model.maxActiveVehicles", "int32", "planned-v2", "Most vehicles the plan may use.", { presenceCounts: true }),

  // Shipment
  supported(`${S}.displayName`, "string", "Name for people; it does not affect the solve."),
  ...visitRequestRows(`${S}.pickups`, "pickup"),
  ...visitRequestRows(`${S}.deliveries`, "delivery"),
  supported(`${S}.loadDemands`, "object", `Load the shipment adds at its pickup and removes at its delivery, keyed by load type name. A request may use at most ${MAX_LOAD_TYPES} distinct load type names across every loadDemands and loadLimits map: error \`OUT_OF_RANGE\` past that.`, { map: true }),
  supported(`${S}.loadDemands{}.amount`, "int64", "Units of this load type. One type's amounts over every pickup and delivery in the request must add up to at most 2^53 - 1.", { minimum: 0, default: 0 }),
  supported(`${S}.penaltyCost`, "number", "Cost of leaving the shipment unserved; absent means the shipment is mandatory.", nonNegative),
  supported(`${S}.allowedVehicleIndices`, "int32", "Indices of the only vehicles that may serve the shipment; empty means any.", { repeated: true, minimum: 0 }),
  planned(`${S}.costsPerVehicle`, "number", "planned-v2", "Extra cost when a given vehicle serves the shipment.", { repeated: true }),
  planned(`${S}.costsPerVehicleIndices`, "int32", "planned-v2", "The vehicles that costsPerVehicle refers to.", { repeated: true }),
  planned(`${S}.pickupToDeliveryRelativeDetourLimit`, "number", "planned-v2", "Longest allowed pickup-to-delivery time, relative to the direct trip.", { presenceCounts: true }),
  planned(`${S}.pickupToDeliveryAbsoluteDetourLimit`, "duration", "planned-v2", "Longest allowed extra time between pickup and delivery over the direct trip.", { presenceCounts: true }),
  planned(`${S}.pickupToDeliveryTimeLimit`, "duration", "planned-v2", "Longest allowed time from the start of the pickup to the start of the delivery.", { presenceCounts: true }),
  planned(`${S}.shipmentType`, "string", "planned-v2", "Type name used by incompatibility and requirement rules."),
  supported(`${S}.label`, "string", "Caller's label for the shipment, echoed as shipmentLabel and used to recognise re-solves for billing."),
  supported(`${S}.ignore`, "boolean", "When true the shipment is left out of the solve, listed in skippedShipments with reason SHIPMENT_IGNORED, and not billed.", { default: false }),

  // Vehicle
  supported(`${V}.displayName`, "string", "Name for people; it does not affect the solve."),
  supported(`${V}.travelMode`, "enum", "How the vehicle travels; V1 drives.", {
    default: "DRIVING",
    enumValues: values(`${V}.travelMode`, { TRAVEL_MODE_UNSPECIFIED: "supported", DRIVING: "supported", WALKING: "planned-v2" }),
  }),
  planned(`${V}.routeModifiers`, "object", "planned-v3", "Road preferences such as avoiding tolls, highways or ferries."),
  ...vehicleEndpointRows("start"),
  ...vehicleEndpointRows("end"),
  planned(`${V}.unloadingPolicy`, "enum", "planned-v3", "Last-in-first-out or first-in-first-out order for deliveries.", {
    enumValues: values(`${V}.unloadingPolicy`, { UNLOADING_POLICY_UNSPECIFIED: "supported", LAST_IN_FIRST_OUT: "planned-v3", FIRST_IN_FIRST_OUT: "planned-v3" }),
  }),
  supported(`${V}.loadLimits`, "object", `Capacity per load type name. Its keys count toward the ${MAX_LOAD_TYPES} distinct load types a request may use.`, { map: true }),
  supported(`${V}.loadLimits{}.maxLoad`, "int64", "Most units of this load type the vehicle may carry at once; absent means unlimited.", nonNegative),
  supported(`${V}.loadLimits{}.softMaxLoad`, "int64", "Load above which each extra unit costs costPerUnitAboveSoftMax; absent means 0. Charges nothing without a cost above 0.", nonNegative),
  supported(`${V}.loadLimits{}.costPerUnitAboveSoftMax`, "number", "Cost per unit of peak load above softMaxLoad (0 when absent). A cost above 0 needs a load type that pickups alone or deliveries alone use.", nonNegative),
  planned(`${V}.loadLimits{}.startLoadInterval`, "object", "planned-v2", "Allowed load when the route starts."),
  planned(`${V}.loadLimits{}.endLoadInterval`, "object", "planned-v2", "Allowed load when the route ends."),
  planned(`${V}.loadLimits{}.costPerKilometer`, "object", "planned-v3", "Load-dependent cost per kilometre (experimental in GMPRO)."),
  planned(`${V}.loadLimits{}.costPerTraveledHour`, "object", "planned-v3", "Load-dependent cost per hour of travel (experimental in GMPRO)."),
  supported(`${V}.costPerHour`, "number", "Cost per hour of the route, from vehicle start to vehicle end.", { ...nonNegative, default: 0 }),
  supported(`${V}.costPerTraveledHour`, "number", "Cost per hour spent driving.", { ...nonNegative, default: 0 }),
  supported(`${V}.costPerKilometer`, "number", "Cost per kilometre driven.", { ...nonNegative, default: 0 }),
  supported(`${V}.fixedCost`, "number", "Cost charged once if the vehicle serves at least one shipment.", { ...nonNegative, default: 0 }),
  planned(`${V}.usedIfRouteIsEmpty`, "boolean", "planned-v2", "Charges and times an empty route as if the vehicle drove from start to end."),
  ...durationLimitRows(`${V}.routeDurationLimit`, "route duration, from vehicle start to vehicle end"),
  ...durationLimitRows(`${V}.travelDurationLimit`, "driving time over the route"),
  supported(`${V}.routeDistanceLimit`, "object", "Limits on the distance driven over the route."),
  supported(`${V}.routeDistanceLimit.maxMeters`, "int64", "Hard maximum distance in metres, at most 1,000,000,000 (the solver's unreachable value).", { ...nonNegative, maximum: 1_000_000_000 }),
  supported(`${V}.routeDistanceLimit.softMaxMeters`, "int64", "Soft maximum distance in metres: going over it costs costPerKilometerAboveSoftMax per kilometre; below maxMeters when both are set.", { ...nonNegative, presenceCounts: true }),
  {
    path: `${V}.routeDistanceLimit.costPerKilometerBelowSoftMax`,
    type: "number",
    status: "rejected",
    description: "Cost per kilometre up to the soft maximum.",
    // No rejected-specific code exists beyond PLACE_ID_NOT_SUPPORTED; GMPRO itself refuses the
    // field as an invalid argument, and INVALID_VALUE is Unmap's code for a value a field cannot take.
    code: "INVALID_VALUE",
    message: "routeDistanceLimit.costPerKilometerBelowSoftMax is not supported: GMPRO does not support it in route_distance_limit either.",
    hint: "Remove the field; costPerKilometer charges every kilometre driven.",
    rationale: "Rejected: GMPRO's own proto says this cost is not supported in route_distance_limit, so no GMPRO request can depend on it.",
    presenceCounts: true,
  },
  supported(`${V}.routeDistanceLimit.costPerKilometerAboveSoftMax`, "number", "Cost per kilometre over softMaxMeters; needs softMaxMeters.", nonNegative),
  planned(`${V}.extraVisitDurationForVisitType`, "duration", "planned-v2", "Extra time this vehicle spends at visits of a given type.", { map: true }),
  supported(`${V}.breakRule`, "object", "Breaks the driver must take."),
  supported(`${V}.breakRule.breakRequests`, "object", "Breaks, in the order they must happen.", { repeated: true }),
  supported(`${V}.breakRule.breakRequests[].earliestStartTime`, "timestamp", "Earliest time the break may start.", { required: true }),
  supported(`${V}.breakRule.breakRequests[].latestStartTime`, "timestamp", "Latest time the break may start.", { required: true }),
  supported(`${V}.breakRule.breakRequests[].minDuration`, "duration", "Shortest allowed length of the break; must be positive.", { required: true, exclusiveMinimum: 0 }),
  planned(`${V}.breakRule.frequencyConstraints`, "object", "planned-v3", "Hours-of-service style rules on how often breaks happen.", { repeated: true }),
  supported(`${V}.label`, "string", "Caller's label for the vehicle, echoed as vehicleLabel in the response."),
  planned(`${V}.ignore`, "boolean", "planned-v2", "Leaves the vehicle out of the plan."),
  planned(`${V}.travelDurationMultiple`, "number", "planned-v2", "Multiplies every travel duration for this vehicle, for slower or faster vehicles.", { default: 1, presenceCounts: true }),
  supported(`${V}.unmapProfile`, "enum", "Unmap extension: the road network profile the vehicle's travel times come from.", {
    default: "auto",
    enumValues: values(`${V}.unmapProfile`, { auto: "supported", truck: "planned-v2", pedestrian: "planned-v2" }, false),
  }),
];

const byPath = new Map(FIELDS.map((row) => [row.path, row]));

/** The row for a table path, such as `model.shipments[].label`. */
export function fieldByPath(path: string): FieldRow | undefined {
  return byPath.get(path);
}

/** The table path of a row's parent object: `model.shipments[].label` becomes `model.shipments`. */
export function parentPathOf(path: string): string {
  const cut = path.lastIndexOf(".");
  return cut < 0 ? "" : path.slice(0, cut).replace(/(\[\]|\{\})$/, "");
}

/** The last name in a table path. */
export function fieldNameOf(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1);
}

const childrenByParent = new Map<string, Map<string, FieldRow>>();
for (const row of FIELDS) {
  const parent = parentPathOf(row.path);
  let children = childrenByParent.get(parent);
  if (!children) childrenByParent.set(parent, (children = new Map()));
  children.set(fieldNameOf(row.path), row);
}

/** The rows directly under an object row (`""` for the request root), keyed by field name, in table order. */
export function childrenOf(path: string): ReadonlyMap<string, FieldRow> {
  return childrenByParent.get(path) ?? new Map();
}

/** The enum name for `value` (a name, or a proto integer) at table `path`; undefined when it is neither. */
export function enumNameOf(path: string, value: unknown): string | undefined {
  const known = fieldByPath(path)?.enumValues ?? [];
  if (typeof value === "string") return known.find((v) => v.value === value)?.value;
  if (typeof value === "number" && Number.isInteger(value)) return known.find((v) => v.number === value)?.value;
  return undefined;
}
