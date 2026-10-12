/**
 * Wire types for the GMPRO (Google Maps Platform Route Optimization) `optimizeTours` surface that
 * Unmap Optimize accepts and returns. Field names are the camelCase JSON names; the validator turns
 * snake_case input into these before anything reads it.
 *
 * Every field the field-status table classifies is typed here, including the ones Unmap refuses,
 * so a GMPRO request type-checks against these types. Whether a field is honoured is the table's
 * business (`fields.ts`), not the type's.
 *
 * Scalars follow proto3 JSON: a {@link Duration} is a string such as "300s" or "1.5s", a
 * {@link Timestamp} is an RFC 3339 string or `{ seconds, nanos }`, and an {@link Int64} is a
 * decimal string or a safe JSON integer.
 */

/** Seconds with an "s" suffix: "300s", "1.5s". */
export type Duration = string;
/** RFC 3339 ("2026-10-12T08:00:00Z") or the object form with int64 seconds. */
export type Timestamp = string | { seconds?: Int64; nanos?: number };
/** A 64-bit integer as a decimal string or a safe JSON integer. */
export type Int64 = string | number;

export type SolvingMode = "DEFAULT_SOLVE" | "VALIDATE_ONLY" | "DETECT_SOME_INFEASIBLE_SHIPMENTS" | "TRANSFORM_AND_RETURN_REQUEST";
export type SearchMode = "SEARCH_MODE_UNSPECIFIED" | "RETURN_FAST" | "CONSUME_ALL_AVAILABLE_TIME";
export type TravelMode = "TRAVEL_MODE_UNSPECIFIED" | "DRIVING" | "WALKING";
export type UnloadingPolicy = "UNLOADING_POLICY_UNSPECIFIED" | "LAST_IN_FIRST_OUT" | "FIRST_IN_FIRST_OUT";
/** Unmap extension: the road network profile a vehicle travels on. Only "auto" in V1. */
export type UnmapProfile = "auto" | "truck" | "pedestrian";

export interface LatLng {
  latitude?: number;
  longitude?: number;
}

export interface Location {
  latLng?: LatLng;
  heading?: number;
}

export interface Waypoint {
  location?: Location;
  placeId?: string;
  sideOfRoad?: boolean;
  vehicleStopover?: boolean;
}

export interface TimeWindow {
  startTime?: Timestamp;
  endTime?: Timestamp;
  softStartTime?: Timestamp;
  softEndTime?: Timestamp;
  costPerHourBeforeSoftStartTime?: number;
  costPerHourAfterSoftEndTime?: number;
}

export interface Load {
  amount?: Int64;
}

export interface VisitRequest {
  arrivalLocation?: LatLng;
  arrivalWaypoint?: Waypoint;
  departureLocation?: LatLng;
  departureWaypoint?: Waypoint;
  tags?: string[];
  timeWindows?: TimeWindow[];
  duration?: Duration;
  cost?: number;
  loadDemands?: Record<string, Load>;
  visitTypes?: string[];
  label?: string;
  avoidUTurns?: boolean;
}

export interface Shipment {
  displayName?: string;
  pickups?: VisitRequest[];
  deliveries?: VisitRequest[];
  loadDemands?: Record<string, Load>;
  penaltyCost?: number;
  allowedVehicleIndices?: number[];
  costsPerVehicle?: number[];
  costsPerVehicleIndices?: number[];
  pickupToDeliveryRelativeDetourLimit?: number;
  pickupToDeliveryAbsoluteDetourLimit?: Duration;
  pickupToDeliveryTimeLimit?: Duration;
  shipmentType?: string;
  label?: string;
  ignore?: boolean;
}

export interface Interval {
  min?: Int64;
  max?: Int64;
}

export interface LoadCost {
  loadThreshold?: Int64;
  costPerUnitBelowThreshold?: number;
  costPerUnitAboveThreshold?: number;
}

export interface LoadLimit {
  maxLoad?: Int64;
  softMaxLoad?: Int64;
  costPerUnitAboveSoftMax?: number;
  startLoadInterval?: Interval;
  endLoadInterval?: Interval;
  costPerKilometer?: LoadCost;
  costPerTraveledHour?: LoadCost;
}

export interface DurationLimit {
  maxDuration?: Duration;
  softMaxDuration?: Duration;
  quadraticSoftMaxDuration?: Duration;
  costPerHourAfterSoftMax?: number;
  costPerSquareHourAfterQuadraticSoftMax?: number;
}

export interface DistanceLimit {
  maxMeters?: Int64;
  softMaxMeters?: Int64;
  costPerKilometerBelowSoftMax?: number;
  costPerKilometerAboveSoftMax?: number;
}

export interface BreakRequest {
  earliestStartTime?: Timestamp;
  latestStartTime?: Timestamp;
  minDuration?: Duration;
}

export interface FrequencyConstraint {
  minBreakDuration?: Duration;
  maxInterBreakDuration?: Duration;
}

export interface BreakRule {
  breakRequests?: BreakRequest[];
  frequencyConstraints?: FrequencyConstraint[];
}

export interface RouteModifiers {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidFerries?: boolean;
  avoidIndoor?: boolean;
}

export interface Vehicle {
  displayName?: string;
  travelMode?: TravelMode;
  routeModifiers?: RouteModifiers;
  startLocation?: LatLng;
  startWaypoint?: Waypoint;
  endLocation?: LatLng;
  endWaypoint?: Waypoint;
  startTags?: string[];
  endTags?: string[];
  startTimeWindows?: TimeWindow[];
  endTimeWindows?: TimeWindow[];
  unloadingPolicy?: UnloadingPolicy;
  loadLimits?: Record<string, LoadLimit>;
  costPerHour?: number;
  costPerTraveledHour?: number;
  costPerKilometer?: number;
  fixedCost?: number;
  usedIfRouteIsEmpty?: boolean;
  routeDurationLimit?: DurationLimit;
  travelDurationLimit?: DurationLimit;
  routeDistanceLimit?: DistanceLimit;
  extraVisitDurationForVisitType?: Record<string, Duration>;
  breakRule?: BreakRule;
  label?: string;
  ignore?: boolean;
  travelDurationMultiple?: number;
  /** Unmap extension. Never a GMPRO field name, so it cannot collide with a future one. */
  unmapProfile?: UnmapProfile;
}

export interface DurationDistanceMatrixRow {
  durations?: Duration[];
  meters?: number[];
}

export interface DurationDistanceMatrix {
  rows?: DurationDistanceMatrixRow[];
  vehicleStartTag?: string;
}

export interface ShipmentModel {
  shipments?: Shipment[];
  vehicles?: Vehicle[];
  objectives?: unknown[];
  globalStartTime?: Timestamp;
  globalEndTime?: Timestamp;
  globalDurationCostPerHour?: number;
  durationDistanceMatrices?: DurationDistanceMatrix[];
  durationDistanceMatrixSrcTags?: string[];
  durationDistanceMatrixDstTags?: string[];
  transitionAttributes?: unknown[];
  shipmentTypeIncompatibilities?: unknown[];
  shipmentTypeRequirements?: unknown[];
  precedenceRules?: unknown[];
  maxActiveVehicles?: number;
}

export interface OptimizeToursRequest {
  parent?: string;
  timeout?: Duration;
  model?: ShipmentModel;
  solvingMode?: SolvingMode;
  searchMode?: SearchMode;
  injectedFirstSolutionRoutes?: ShipmentRoute[];
  injectedSolutionConstraint?: unknown;
  refreshDetailsRoutes?: ShipmentRoute[];
  interpretInjectedSolutionsUsingLabels?: boolean;
  considerRoadTraffic?: boolean;
  populatePolylines?: boolean;
  populateTransitionPolylines?: boolean;
  allowLargeDeadlineDespiteInterruptionRisk?: boolean;
  useGeodesicDistances?: boolean;
  label?: string;
  geodesicMetersPerSecond?: number;
  maxValidationErrors?: number;
}

// ---------------------------------------------------------------------------------------------
// Response

export interface EncodedPolyline {
  points?: string;
}

export interface VehicleLoad {
  amount?: Int64;
}

export interface Visit {
  shipmentIndex?: number;
  isPickup?: boolean;
  visitRequestIndex?: number;
  startTime?: Timestamp;
  loadDemands?: Record<string, Load>;
  detour?: Duration;
  shipmentLabel?: string;
  visitLabel?: string;
}

export interface Transition {
  travelDuration?: Duration;
  travelDistanceMeters?: number;
  trafficInfoUnavailable?: boolean;
  delayDuration?: Duration;
  breakDuration?: Duration;
  waitDuration?: Duration;
  totalDuration?: Duration;
  startTime?: Timestamp;
  routePolyline?: EncodedPolyline;
  routeToken?: string;
  vehicleLoads?: Record<string, VehicleLoad>;
}

export interface Break {
  startTime?: Timestamp;
  duration?: Duration;
}

export interface AggregatedMetrics {
  performedShipmentCount?: number;
  travelDuration?: Duration;
  waitDuration?: Duration;
  delayDuration?: Duration;
  breakDuration?: Duration;
  visitDuration?: Duration;
  totalDuration?: Duration;
  travelDistanceMeters?: number;
  maxLoads?: Record<string, VehicleLoad>;
  performedMandatoryShipmentCount?: number;
  performedShipmentPenaltyCostSum?: number;
}

export interface ShipmentRoute {
  vehicleIndex?: number;
  vehicleLabel?: string;
  vehicleStartTime?: Timestamp;
  vehicleEndTime?: Timestamp;
  visits?: Visit[];
  transitions?: Transition[];
  hasTrafficInfeasibilities?: boolean;
  routePolyline?: EncodedPolyline;
  breaks?: Break[];
  metrics?: AggregatedMetrics;
  routeCosts?: Record<string, number>;
  routeTotalCost?: number;
}

export type SkippedShipmentReasonCode =
  | "CODE_UNSPECIFIED"
  | "NO_VEHICLE"
  | "DEMAND_EXCEEDS_VEHICLE_CAPACITY"
  | "CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DISTANCE_LIMIT"
  | "CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DURATION_LIMIT"
  | "CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TRAVEL_DURATION_LIMIT"
  | "CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS"
  | "VEHICLE_NOT_ALLOWED"
  | "VEHICLE_IGNORED"
  | "SHIPMENT_IGNORED"
  | "SKIPPED_IN_INJECTED_SOLUTION_CONSTRAINT"
  | "VEHICLE_ROUTE_IS_FULLY_SEQUENCE_CONSTRAINED"
  | "ZERO_PENALTY_COST";

export interface SkippedShipmentReason {
  code?: SkippedShipmentReasonCode;
  exampleVehicleIndices?: number[];
  exampleExceededCapacityType?: string;
  exampleVehicleIndex?: number;
}

export interface SkippedShipment {
  index?: number;
  label?: string;
  reasons?: SkippedShipmentReason[];
  penaltyCost?: number;
  estimatedIncompatibleVehicleRatio?: number;
}

export interface Metrics {
  aggregatedRouteMetrics?: AggregatedMetrics;
  skippedMandatoryShipmentCount?: number;
  usedVehicleCount?: number;
  earliestVehicleStartTime?: Timestamp;
  latestVehicleEndTime?: Timestamp;
  costs?: Record<string, number>;
  totalCost?: number;
}

/** GMPRO FieldReference: a path into the request as a chain of names, indices and map keys. */
export interface FieldReference {
  name: string;
  index?: number;
  key?: string;
  subField?: FieldReference;
}

/** GMPRO OptimizeToursValidationError as it appears in a response body: `code` is an integer. */
export interface OptimizeToursValidationError {
  code: number;
  displayName: string;
  fields: FieldReference[];
  errorMessage: string;
  offendingValues?: string;
}

export interface OptimizeToursResponse {
  routes?: ShipmentRoute[];
  requestLabel?: string;
  skippedShipments?: SkippedShipment[];
  validationErrors?: OptimizeToursValidationError[];
  metrics?: Metrics;
}
