import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";
import { optimizeTours, type OptimizeToursRequest, type OptimizeToursResult } from "./optimize-tours";

export * from "./optimize-tours";

export interface RouterOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  /**
   * Retry policy for `429`, `502`, `503` and transport failures. `false` disables it.
   *
   * On by default. `Retry-After` is on a `429` other than `billing_required`, and on a container
   * `503`. A `502` has none: routing and `/elevation` both use
   * `upstream_error`. With no header the client backs off itself. A wait longer than
   * `maxDelayMs` (10 s) is not slept through; the error carries `retryAfterSeconds` instead.
   * See `RetryPolicy` in `@unmap/core`.
   */
  retry?: RetryPolicy | false;
}

/** `car` is the same costing as `auto`, spelled for people who do not think in Valhalla terms. */
export type TravelMode = "auto" | "car" | "bicycle" | "pedestrian" | "truck" | "transit";
export type RoadTravelMode = Exclude<TravelMode, "transit">;
/** [longitude, latitude]. */
export type LngLat = [number, number];

/**
 * Vehicle profile for `mode: "truck"`. Metric throughout: metres and tonnes. Every field is
 * optional; the gateway falls back to Valhalla's defaults (4.11 m high, 2.6 m wide, 21.64 m
 * long, 21.77 t, 9.07 t axle load, 5 axles, no hazmat) for anything omitted.
 */
export interface TruckProfile {
  /** Vehicle height in metres. */
  height?: number;
  /** Vehicle width in metres. */
  width?: number;
  /** Vehicle length in metres. */
  length?: number;
  /** Gross vehicle weight in tonnes. */
  weight?: number;
  /** Load per axle in tonnes (0–40). */
  axleLoad?: number;
  /** Number of axles (2–20). */
  axleCount?: number;
  /** Carrying hazardous materials: avoids roads tagged `hazmat=no`. */
  hazmat?: boolean;
  /** Preference for designated truck routes, 0 (none) to 1 (strong). */
  useTruckRoute?: number;
}

/**
 * A road feature to weight against. `tolls` and `highways` are driving modes only; `ferries`
 * applies to every road mode. `unpaved` is deliberately absent: Valhalla has no surface term in its
 * driving costing, so it could only ever have meant two different things by mode.
 */
export type AvoidToken = "tolls" | "highways" | "ferries";

/** A GeoJSON position. The gateway requires exactly `[longitude, latitude]` at runtime. */
export type AvoidAreaPosition = number[];
/** A closed GeoJSON linear ring. */
export type AvoidAreaRing = AvoidAreaPosition[];

/** Polygon with one exterior ring. Interior rings are rejected by the gateway. */
export interface AvoidAreaPolygon {
  type: "Polygon";
  coordinates: AvoidAreaRing[];
}

/** Multiple polygons, each with one exterior ring. */
export interface AvoidAreaMultiPolygon {
  type: "MultiPolygon";
  coordinates: AvoidAreaRing[][];
}

export interface AvoidAreaFeature {
  type: "Feature";
  geometry: AvoidAreaPolygon | AvoidAreaMultiPolygon;
  properties?: Record<string, unknown> | null;
}

export interface AvoidAreaFeatureCollection {
  type: "FeatureCollection";
  features: AvoidAreaFeature[];
}

export type AvoidAreas =
  | AvoidAreaPolygon
  | AvoidAreaMultiPolygon
  | AvoidAreaFeature
  | AvoidAreaFeatureCollection;

interface SharedRouteOptions {
  signal?: AbortSignal;
}

export interface TransitRouteOptions extends SharedRouteOptions {
  mode: "transit";
  /**
   * Scheduled departure. A Date is serialized as an ISO instant; a
   * string is sent unchanged so callers can provide an ISO value with an explicit local offset.
   * Transit supports departure time only. There is no `arriveBy` option.
   */
  departAt: Date | string;
  avoid?: never;
  avoidAreas?: never;
  truck?: never;
  useHighways?: never;
  useHills?: never;
}

export interface RoadRouteOptions extends SharedRouteOptions {
  mode?: RoadTravelMode;
  /** A scheduled departure applies only to `mode: "transit"`. */
  departAt?: never;
  /**
   * Road features to weight against.
   *
   * **A preference, not an exclusion.** These set Valhalla costing weights to 0, which
   * penalises the feature heavily but does not forbid it: a route whose only path crosses a
   * toll bridge still crosses it, and nothing in the result says that it did. If the
   * distinction matters to you, check the returned geometry. Avoid areas have a separate,
   * feature-gated API because they use Valhalla's exclusion mechanism rather than a weight.
   *
   * `tolls` and `highways` are driving modes only (`auto`, `car`, `truck`); `ferries` applies
   * to every road mode. `avoid: ["highways"]` and `useHighways` are the same knob at different
   * resolutions and the gateway rejects both together.
   */
  avoid?: AvoidToken[];
  /**
   * Areas to keep the route out of, as a GeoJSON `Polygon`, `MultiPolygon`, or
   * `FeatureCollection` of either.
   *
   * Valhalla defines these as exclusions rather than preferences. Server support remains behind
   * a feature flag while a defect in the pinned engine can snap a location across the polygon;
   * do not rely on this option until the service documentation says the flag is enabled.
   * Interior rings are rejected because the engine cannot preserve holes.
   *
   * At most 8 areas, 100 vertices and 10 km of perimeter in total.
   *
   * Sending this makes `route()` and `isochrone()` use POST instead of GET, because a polygon
   * cannot ride a query string. The response is identical either way.
   */
  avoidAreas?: AvoidAreas;
  /** Only meaningful with `mode: "truck"`; the gateway rejects it on any other mode. */
  truck?: TruckProfile;
  /**
   * Willingness to take motorways and trunks, 0 (avoid) to 1 (prefer). Driving
   * modes only (`auto`, `car`, `truck`). This is Valhalla's existing costing
   * option on the Canada graph, not a second router and not resource/winter/field routing.
   */
  useHighways?: number;
  /**
   * Willingness to climb, 0 (avoid hills even for a longer route) to 1 (indifferent).
   * `bicycle` and `pedestrian` only; the gateway rejects it on the driving modes, whose
   * costing has no grade term at all. Grades come from the national 30 m elevation model,
   * baked into the Canada graph at build time.
   */
  useHills?: number;
}

/** Transit options are a separate branch so `departAt` cannot be omitted by accident. */
export type RouteOptions = RoadRouteOptions | TransitRouteOptions;

/** Turn-by-turn options, taken by `route()`, `match()` and `optimize()`. */
export interface StepOptions {
  /**
   * Return `steps`: written turn-by-turn directions for display. Off by default, so a route you
   * only draw stays small.
   */
  steps?: boolean;
  /**
   * Language of each step's `instruction`: `en` or `fr`. A regional tag resolves by its language
   * (`fr-CA` is French) and any other language is English. Only with `steps: true`; the gateway
   * rejects it otherwise. Without it the gateway reads the request's `Accept-Language` header,
   * which a browser sends for you.
   */
  lang?: string;
}

/** `TruckProfile` field → the gateway's snake_case query parameter. */
const TRUCK_PARAMS: Record<keyof TruckProfile, string> = {
  height: "height",
  width: "width",
  length: "length",
  weight: "weight",
  axleLoad: "axle_load",
  axleCount: "axle_count",
  hazmat: "hazmat",
  useTruckRoute: "use_truck_route",
};

function truckParams(truck?: TruckProfile): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (!truck) return out;
  for (const [field, param] of Object.entries(TRUCK_PARAMS) as [keyof TruckProfile, string][]) {
    const v = truck[field];
    if (v != null) out[param] = String(v);
  }
  return out;
}

/** `TruckProfile` field to the gateway's snake_case body field, values left as numbers. */
function truckBody(truck?: TruckProfile): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  if (!truck) return out;
  for (const [field, param] of Object.entries(TRUCK_PARAMS) as [keyof TruckProfile, string][]) {
    const v = truck[field];
    if (v != null) out[param] = v;
  }
  return out;
}

/**
 * The option fields both POST endpoints accept, shaped for a JSON body.
 *
 * Every option `RouteOptions` declares has to appear here. One left out still typechecks at the
 * call site and is then dropped on the floor, so the caller asks for something and silently does
 * not get it.
 */
function bodyOptions(opts: RouteOptions & StepOptions): Record<string, unknown> {
  return {
    ...(opts.steps != null ? { steps: opts.steps } : {}),
    ...(opts.lang != null ? { lang: opts.lang } : {}),
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.departAt != null ? { depart_at: departureValue(opts.departAt) } : {}),
    ...(opts.avoid?.length ? { avoid: opts.avoid } : {}),
    ...(opts.avoidAreas != null ? { avoid_areas: opts.avoidAreas } : {}),
    ...(opts.useHighways != null ? { use_highways: opts.useHighways } : {}),
    ...(opts.useHills != null ? { use_hills: opts.useHills } : {}),
    ...truckBody(opts.truck),
  };
}

function departureValue(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * How well a class of truck restriction is covered for a route. `osm_only` is provenance, not a
 * grade: Canada publishes no national bridge inventory, so OSM-derived is the honest description
 * of most of it. `not_modelled` means the routing engine cannot express the rule at all (a
 * conditional restriction); `not_checked` means nothing looked.
 */
export type TruckCoverage =
  | "authoritative"
  | "osm_plus_authoritative"
  | "osm_only"
  | "not_modelled"
  | "not_checked";

/** How much of a truck route's restriction picture is trustworthy, overall. */
export type TruckVerification = "authoritative" | "partial" | "osm_only" | "unknown" | "candidate_permit_route";

export interface TruckWarning {
  /** Stable machine-readable code, e.g. `INCOMPLETE_VEHICLE_PROFILE`. Switch on this, not the text. */
  code: string;
  message: string;
}

/** Outcome of the endpoint check. `clear` means clear against what was checked, nothing more. */
export type TruckValidationStatus = "clear" | "conflict" | "unknown";

export interface TruckValidationFinding {
  /**
   * Where the finding applies. The two endpoints are the segments the routing engine does not
   * evaluate; `route` is anywhere along the path, which is where a time-limited restriction lands.
   */
  where: "origin" | "destination" | "route";
  code: string;
  message: string;
  /** The OSM way the finding concerns, when the engine named one. */
  wayId?: number;
  /** For a time-limited finding: in force now, later, or unreadable from the published schedule. */
  when?: "now" | "later" | "unknown";
  /** Epoch seconds, as the upstream authority published them. */
  effectiveFrom?: number;
  effectiveTo?: number;
}

/**
 * What was independently checked after the route was produced.
 *
 * The routing engine does not apply restrictions to a route's first or last segment, because a
 * vehicle has to be able to leave where it is parked. This is the check that looks at those two
 * segments anyway.
 *
 * `conflicts` carries findings that are decided: a posted limit your declared vehicle exceeds, and
 * a full closure in force -- the road is shut whatever the vehicle. `unknowns` carries what could
 * not be decided, which includes a restriction whose kind cannot be compared against dimensions
 * at all (a time window, destination-only access), one whose parameter you did not declare, and
 * an endpoint the engine moved or one that sits on a road closed to trucks.
 *
 * An earlier release of this type said a dimension restriction could only ever be an unknown
 * because the engine did not expose the limit. That was wrong, and comparison against your
 * declared vehicle now happens; send a complete profile and you get real answers rather than
 * "something is posted here".
 *
 * `clear` means clear against `checkedRestrictionClasses`; it never means the route is legally
 * compliant.
 *
 * Codes worth branching on, beyond the endpoint ones:
 *
 * - `TEMPORARY_LIMIT_EXCEEDED` (conflict) a time-limited posted limit, in force now, that your
 *   declared vehicle exceeds.
 * - `TEMPORARY_LIMIT_SCHEDULED` (unknown) the same for a window that has not started.
 * - `TEMPORARY_LIMIT_DEPENDS_ON_CONFIGURATION` (unknown) a structure posting different weights by
 *   vehicle configuration, where your declared mass is over the strictest and within the most
 *   permissive. Alberta posts 25 t for a single truck and 63.5 t for a B-train at one bridge, so a
 *   declared 40 t is legal as one and illegal as the other. This service does not collect your
 *   configuration, so it reports the ambiguity rather than picking one.
 * - `TEMPORARY_LIMIT_UNDECLARED` (unknown) a limit is posted and the parameter it constrains was
 *   not declared.
 * - `ENDPOINT_ON_TRUCK_PROHIBITED_ROAD` (unknown) the road at an endpoint is closed to trucks, so
 *   the route begins or ends on a different one.
 *
 * Read the message as well as the code on a temporary limit. Some are published by the authority
 * in a structured field and some are read out of its own written description; the message says
 * which, because they do not deserve equal confidence.
 *
 * Check `checkedRestrictionClasses` before trusting a `clear`. When the time-limited layer is
 * unavailable you get `TEMPORAL_RESTRICTIONS_NOT_CHECKED` in `unknowns`, which is a different
 * answer from "no closures found".
 */
export interface TruckValidation {
  status: TruckValidationStatus;
  /** Exactly what was examined, so you can tell what "clear" covered. */
  checkedRestrictionClasses: string[];
  conflicts: TruckValidationFinding[];
  unknowns: TruckValidationFinding[];
}

/**
 * What a truck route considered, and what it did not. Present on `mode: "truck"` results only.
 *
 * Read `warnings` before relying on a route. In particular `ENDPOINT_RESTRICTIONS_UNCHECKED`
 * appears whenever the endpoint check did not clear the route's first and last road segment,
 * which includes every route where the check could not run: restrictions are not applied to
 * those two segments, so clearance and load at the origin and destination must be verified
 * separately. Nothing here ever reports a road as unrestricted; the absence of a restriction
 * means none is known.
 */
export interface TruckMeta {
  /** The profile as sent, in the units sent. Never back-filled with the engine's defaults. */
  profile: TruckProfile;
  /** True only when height, width, length, weight and axle load were all supplied. */
  profileComplete: boolean;
  /**
   * Every comparable restriction posted on a road this route actually traversed, whether or not
   * your declared vehicle exceeds it.
   *
   * A statement about the route rather than a list of problems: a 20 t bridge on the path is
   * listed even for a 10 t vehicle, because knowing the route crosses it is worth having. The
   * ones your vehicle does exceed also appear in `validation.conflicts`.
   *
   * `value` is in the engine's unit for that type: metres for `max_height`, `max_width` and
   * `max_length`, tonnes for `max_weight` and `max_axle_load`.
   *
   * Absent rather than `[]` whenever the along-route check did not complete — a route with more
   * distinct roads than one pass can sample, a multi-leg trip, or an engine call that failed.
   * An empty array would say "nothing is posted on this route", which is a claim; absent says
   * nothing was established. Check `validation.checkedRestrictionClasses` for
   * `route_static_restrictions` to tell the two apart.
   */
  restrictions_applied?: { type: string; value: number; wayId: number }[];
  coverage: Record<string, TruckCoverage>;
  verification: TruckVerification;
  warnings: TruckWarning[];
  /** The endpoint check. Absent when it did not run. */
  validation?: TruckValidation;
  /**
   * Subdivision codes whose authoritative restrictions are in the deployed graph. A statement
   * about the graph, not about this route: no jurisdiction lookup is performed.
   */
  enrichedJurisdictions?: string[];
  /**
   * What the truck picture is worth in each country the route's endpoints fall in. Present only
   * when an endpoint is outside Canada; a Canadian route never carries it.
   *
   * `enriched_corridors`: authoritative sources are in the graph for the subdivisions in
   * `enrichedJurisdictions`. `basic_osm`: truck costing over OSM truck tags unmap has audited.
   * `unverified`: truck costing over OSM tags nobody has audited, with no restriction source, so
   * `verification` is `unknown`. `country` is null for a point outside every country mask the
   * gateway holds. There is no status meaning "no restrictions".
   */
  jurisdictions?: { country: "CA" | "US" | "MX" | null; status: "enriched_corridors" | "basic_osm" | "unverified" }[];
}

/**
 * Something about the route itself that you should know before using it. Every mode.
 *
 * Two things today, both worth reading.
 *
 * The engine moves a requested point to the nearest road it can use, and if there is no road near
 * your point it moves it a long way and still reports success. Asked for a route between two
 * places with no road between them, it answered `Ok` with a confident 10.1 km route having
 * relocated the destination 292.3 km. A route is still returned, because it is usually a good
 * route that merely ends short, but `ENDPOINT_RELOCATED` tells you it does not reach the place you
 * named. This matters most where it is least visible: a well pad, a remote lease, a mine, a new
 * subdivision.
 *
 * And a provincial authority may have a road on your path shut. The graph is rebuilt weekly and
 * cannot carry a closure, so `CLOSURE_IN_FORCE_NEAR_ROUTE` is how you learn that the route may go
 * through one; `CLOSURE_SCHEDULED_NEAR_ROUTE` is one that starts later, with `effectiveFrom`
 * saying when. Reported on every mode, because a shut road is shut to a car too.
 *
 * Branch on `code`, which is stable; the text may be reworded.
 */
export interface RouteWarning {
  /** Stable machine-readable code, e.g. `ENDPOINT_RELOCATED`. Switch on this, not the text. */
  code: string;
  message: string;
  /**
   * What it concerns: one of the two endpoints, or `"route"` for anything along the path, which
   * is where a closure lands.
   */
  where?: "origin" | "destination" | "route";
  /** For a time-limited warning: in force now, later, or unreadable from the published schedule. */
  when?: "now" | "later" | "unknown";
  /** Epoch seconds, as the authority published them. Either end may be absent. */
  effectiveFrom?: number;
  effectiveTo?: number;
}

/**
 * The state of the routing graph behind every other call here.
 *
 * `graph` is absent when the engine did not report a build time. That is a real state, not an
 * error: the deployed Canada graph was built before the service was configured to report one.
 * Treat its absence as "unknown", never as "fresh". `graph.osmTimestamp` is absent until a
 * graph built by the current pipeline is deployed; treat that the same way.
 */
export interface RoutingStatus {
  /** The only graph there is. Canada-only is an architectural constraint, not a rollout stage. */
  region: "canada";
  /** `unavailable` means the routing container did not answer, not that this call failed. */
  status: "ready" | "unavailable";
  engine: { name: "valhalla"; version?: string };
  graph?: {
    /** When the tileset was last written, ISO 8601. */
    builtAt: string;
    /** Whole hours since `builtAt`. */
    ageHours: number;
    /**
     * When the source OSM extract was current, ISO 8601. Taken from the PBF header
     * (`osmosis_replication_timestamp`) at graph build time. Absent means unknown.
     */
    osmTimestamp?: string;
  };
  /**
   * How fresh each live restriction feed is. The other half of "is routing current".
   *
   * The graph is rebuilt weekly and cannot carry a closure, so closures and temporary limits come
   * from feeds refreshed every few minutes instead. A stale feed is why a truck route reports the
   * temporal layer unchecked, and this is where you can see it without inspecting a route.
   *
   * `fresh` means a route would trust it right now. `stale` means it exists but is too old to be
   * trusted, so routes report the layer unchecked. `absent` means no snapshot has ever been
   * written — for a keyed feed that usually means the key is not configured, which is a different
   * thing from decay. `ageSeconds` is omitted for `absent`, because there is nothing to age.
   *
   * Absent from the response entirely when the deployment has no feed store bound.
   */
  restrictionFeeds?: {
    /** Subdivision code, e.g. `CA-ON`. */
    jurisdiction: string;
    state: "fresh" | "stale" | "absent";
    ageSeconds?: number;
  }[];
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry: { type: "LineString"; coordinates: LngLat[] };
  /**
   * Route-level warnings, on every mode. Absent when there are none, so a plain route body is
   * unchanged. See `RouteWarning`. Two kinds exist today:
   *
   * - the route does not actually begin or end where you asked (`ENDPOINT_RELOCATED`);
   * - a road closure published by a provincial authority lies within 250 m of the path
   *   (`CLOSURE_IN_FORCE_NEAR_ROUTE`, `CLOSURE_SCHEDULED_NEAR_ROUTE`).
   *
   * Closures are reported on every mode, not only on trucks: a washed-out highway is shut to a
   * car as well, and the graph is rebuilt weekly so it cannot carry one. Coverage is Ontario,
   * Alberta and British Columbia, which is where authoritative feeds exist; elsewhere no closure
   * warning means nothing was checked rather than nothing is closed.
   *
   * On `mode: "truck"` the same findings also appear inside `truck.validation`, which is a
   * self-contained compliance report and is meant to be readable on its own. The duplication is
   * deliberate: `warnings` is the answer to "is anything wrong with this route" for every caller
   * regardless of mode, and putting it somewhere different for trucks would be worse.
   */
  warnings?: RouteWarning[];
  /**
   * Truck restriction coverage and warnings. Present on `mode: "truck"` only, and a sibling of
   * the fields above rather than a wrapper around them, so nothing that reads a route today
   * changes. The gateway sends it already; this type ships with the next release.
   *
   * `mode: "truck"` itself is included with normal routing on every plan, and applies Valhalla
   * truck costing, the truck restrictions carried in the road network, and the vehicle profile
   * you send. The **Truck Intelligence** add-on gates the layer on top: authoritative Canadian
   * government restriction data, validation against your declared vehicle, and the coverage and
   * provenance reporting.
   *
   * Without the add-on this object is still here and says so. Every `coverage` class reads
   * `not_checked`, `verification` is `unknown`, `validation` is absent rather than an empty
   * report, and `warnings` carries `TRUCK_INTELLIGENCE_NOT_ENABLED`. `not_checked` rather than
   * `osm_only` is deliberate: `osm_only` is a claim about provenance, and without the add-on
   * nothing looked at all.
   *
   * `/route` never refuses over this. Closure warnings in `warnings` above are not gated either,
   * on any mode.
   */
  truck?: TruckMeta;
  /** Present on a multimodal result. Static GTFS is `scheduled`; realtime is a later phase. */
  scheduleType?: "scheduled" | "realtime";
  /** Walking access/egress and transit rides, in travel order. Present only for transit routes. */
  legs?: RouteLeg[];
  /**
   * Turn-by-turn directions, in travel order. Present only when you pass `steps: true`. On a
   * transit route they include the walk to and from each stop as well as the rides.
   */
  steps?: RouteStep[];
}

export interface TransitAgencySummary {
  id: string;
  name: string;
  url?: string;
}

export interface TransitRouteSummary {
  id: string;
  shortName?: string;
  longName?: string;
  /** CSS hex colour, including `#`. */
  color?: string;
  /** CSS hex text colour, including `#`. */
  textColor?: string;
}

export interface TransitStopTime {
  id: string;
  name: string;
  coordinates?: LngLat;
  arrival?: string;
  departure?: string;
}

export interface PedestrianRouteLeg {
  mode: "pedestrian";
  durationSeconds: number;
  distanceMeters: number;
}

export interface TransitRouteLeg {
  mode: "transit";
  durationSeconds: number;
  distanceMeters: number;
  agency?: TransitAgencySummary;
  route?: TransitRouteSummary;
  headsign?: string;
  departure?: string;
  arrival?: string;
  stops: TransitStopTime[];
}

export type RouteLeg = PedestrianRouteLeg | TransitRouteLeg;

/**
 * What a step asks the traveller to do. unmap's own names, so your code does not depend on the
 * routing engine's internal numbering. Switch on this to choose an icon; show `instruction` as text.
 *
 * - `depart` / `arrive`: the first step of a route, and every stop it reaches (`/optimized-route`
 *   arrives at each stop and departs again).
 * - `turn`, `uturn`, `continue`, `keep` (stay on a side at a split), `merge`, `name_change` (the
 *   road you are on changes name).
 * - `ramp` (take a ramp) and `exit` (leave by an exit), both on limited-access roads.
 * - `roundabout` (enter; `roundaboutExit` says which exit) and `roundabout_exit`.
 * - `ferry` (board) and `ferry_exit`.
 * - Transit: `transit` (board), `transit_transfer`, `transit_stay_on`, `station_enter`,
 *   `station_transfer`, `station_exit`.
 * - Inside buildings on a walk: `elevator`, `stairs`, `escalator`, `building_enter`, `building_exit`.
 * - `other`: a step the engine produced that unmap does not name yet. Show its instruction.
 */
export type RouteStepType =
  | "depart"
  | "arrive"
  | "turn"
  | "uturn"
  | "continue"
  | "keep"
  | "merge"
  | "name_change"
  | "ramp"
  | "exit"
  | "roundabout"
  | "roundabout_exit"
  | "ferry"
  | "ferry_exit"
  | "transit"
  | "transit_transfer"
  | "transit_stay_on"
  | "station_enter"
  | "station_transfer"
  | "station_exit"
  | "elevator"
  | "stairs"
  | "escalator"
  | "building_enter"
  | "building_exit"
  | "other";

/**
 * Which way a step goes. Absent when the step has no direction (a roundabout, a transfer). On
 * `depart` and `arrive` it is the side of the road (`left`/`right`); on `uturn` the direction of
 * the turn.
 */
export type RouteStepModifier =
  | "sharp_left"
  | "left"
  | "slight_left"
  | "straight"
  | "slight_right"
  | "right"
  | "sharp_right";

/** The guide sign at a highway junction, as posted. Every list is absent when the sign has none. */
export interface RouteStepSign {
  /** Exit numbers, e.g. `["91B"]`. */
  exitNumbers?: string[];
  /** The road or route the exit leads onto, e.g. `["Highway 2 North"]`. */
  branches?: string[];
  /** Where the exit goes, e.g. `["Red Deer"]`. */
  toward?: string[];
  /** The interchange's own name. Rare in Canada. */
  names?: string[];
}

/**
 * One turn-by-turn step: written directions, for display. There is no voice narration.
 *
 * Present on a route only when you ask for `steps`. Steps cover the whole route in travel order, so
 * their distances and durations add up to the route's, give or take rounding.
 */
export interface RouteStep {
  type: RouteStepType;
  modifier?: RouteStepModifier;
  /**
   * The step as a sentence, e.g. "Turn left onto 17 Avenue Southwest.", in the language you asked
   * for (`en` or `fr`). French is written by the engine's France French locale, not a Canadian
   * one, so a few phrasings read as European French.
   */
  instruction: string;
  /** Names of the road the step travels along. Absent on an unnamed road. */
  streetNames?: string[];
  distanceMeters: number;
  durationSeconds: number;
  /** Where the step begins, `[lng, lat]`. The same point as `geometry.coordinates[geometryRange[0]]`. */
  location: LngLat;
  /**
   * First and last index of this step's stretch in the route's `geometry.coordinates`, inclusive.
   * `coordinates.slice(start, end + 1)` is the line to highlight for the step.
   */
  geometryRange: [number, number];
  /** On `type: "roundabout"`, which exit to take, counting from where you enter. */
  roundaboutExit?: number;
  sign?: RouteStepSign;
}

/**
 * Travel times and distances between every origin and every destination.
 *
 * **`null` is a real value here, so handle it on every cell.** A pair the engine could not
 * connect is nulled in place and the rest of the grid still answers; the null is never dropped
 * and never shortens a row, so `durations[i][j]` is always `origins[i]` to `destinations[j]`.
 * A `0` is a real answer, which is what the diagonal returns.
 *
 * Treat a `null` as "no answer for this pair", never as proof that no road connects the two
 * points. Across 40 pairs probed on the deployed graph, every null was a pair `/route` answers.
 * An earlier version of this comment claimed `null` never appears; that was retracted
 * on 2026-09-20.
 *
 * `matrix()` rejects with a `RouterError` (status 400, code `invalid_location`) when a coordinate
 * is outside WGS84, and with status 422, code `outside_coverage`, when a location is outside
 * Canada, before the engine runs. It rejects with code `no_route` only for failures the
 * engine raises before computing anything: a location with no road near it, a set of locations
 * the road network does not connect (a property of the set, so no one coordinate is at fault),
 * or two locations further apart in a straight line than its matrix limit.
 */
export interface MatrixResult {
  /** Seconds. Rows are origins, columns are destinations. */
  durations: (number | null)[][];
  /** Metres, same indexing. */
  distances: (number | null)[][];
}

/**
 * A route through a set of stops, plus the order to visit them in.
 *
 * A route with one extra field rather than a shape of its own, the same reasoning that makes
 * `match()` return `RouteResult` outright: an optimized route is a route.
 */
export interface OptimizedRouteResult extends RouteResult {
  /** Indices into the request's `stops`, in visiting order. Always a permutation of them. */
  order: number[];
}

/** Minimal GeoJSON FeatureCollection (isochrone bands). */
export interface FeatureCollection {
  type: "FeatureCollection";
  features: unknown[];
}

/**
 * Travel-time bands around a point. Transit bands ride scheduled transit from `departAt`, and a
 * band can be a `MultiPolygon`: the area around the stop a ride drops you at is often its own
 * island. A centre with no scheduled transit nearby is a `RouterError` with code
 * `outside_coverage`, not a walking-only polygon.
 */
export type IsochroneOptions = (RoadRouteOptions | TransitRouteOptions) & {
  /** Travel-time bands in minutes. At most four, each 120 or less. */
  minutes: number[];
};

/**
 * A routing failure.
 *
 * Extends `UnmapError`, so `catch (e) { if (e instanceof UnmapError) }` catches this alongside
 * every other unmap client's errors. `status` and `code` carry the HTTP status and the
 * gateway's error code, and `retryAfterSeconds` comes from the `Retry-After` header.
 */
export class RouterError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "RouterError";
  }
}

/**
 * The gateway answers every error with a JSON body whose `error` says what went wrong
 * ("mode must be one of auto, car, bicycle, pedestrian, truck, transit", "q required"). Put that in the
 * message so a caller who logs the thrown error reads the reason, not just the status.
 */
async function errorFrom(res: { status: number; headers?: Headers; json(): Promise<unknown> }, path: string): Promise<RouterError> {
  const fallback = `route ${res.status} on ${path}`;
  let body: { error?: unknown; code?: unknown } | undefined;
  try {
    body = (await res.json()) as { error?: unknown; code?: unknown };
  } catch {
    body = undefined;
  }
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;
  return new RouterError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter);
}

/** Typed client for the unmap routing API (gateway `/route`, `/isochrone`, `/matrix`, `/match`, `/optimized-route`). */
export class Router {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: RouterOptions) {
    this.retry = opts.retry;
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    // Bound to globalThis: stored on an instance and called as `this.fetchImpl(...)`, a bare
    // `fetch` reference is invoked with the Router as its receiver, and browsers reject that
    // with "Illegal invocation". Node is lenient, so this only ever surfaces in the browser.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  route(from: LngLat, to: LngLat, opts: RouteOptions & StepOptions = {}): Promise<RouteResult> {
    // A polygon cannot ride a query string, so an `avoidAreas` call switches verb. Not a
    // behaviour change the caller has to think about: same parameters, same response, and the
    // GET stays the default so a plain route keeps its cacheable URL.
    if (opts.avoidAreas != null) {
      return this.post<RouteResult>("/route", { from, to, ...bodyOptions(opts) }, opts.signal);
    }
    return this.get<RouteResult>(
      "/route",
      {
        from: from.join(","),
        to: to.join(","),
        mode: opts.mode,
        depart_at: opts.departAt != null ? departureValue(opts.departAt) : undefined,
        avoid: opts.avoid?.length ? opts.avoid.join(",") : undefined,
        use_highways: opts.useHighways != null ? String(opts.useHighways) : undefined,
        use_hills: opts.useHills != null ? String(opts.useHills) : undefined,
        steps: opts.steps != null ? String(opts.steps) : undefined,
        lang: opts.lang,
        ...truckParams(opts.truck),
      },
      opts.signal,
    );
  }

  isochrone(near: LngLat, opts: IsochroneOptions): Promise<FeatureCollection> {
    if (opts.avoidAreas != null) {
      return this.post<FeatureCollection>(
        "/isochrone",
        { near, minutes: opts.minutes, ...bodyOptions(opts) },
        opts.signal,
      );
    }
    return this.get<FeatureCollection>(
      "/isochrone",
      {
        near: near.join(","),
        minutes: opts.minutes.join(","),
        mode: opts.mode,
        depart_at: opts.departAt != null ? departureValue(opts.departAt) : undefined,
        avoid: opts.avoid?.length ? opts.avoid.join(",") : undefined,
        use_highways: opts.useHighways != null ? String(opts.useHighways) : undefined,
        use_hills: opts.useHills != null ? String(opts.useHills) : undefined,
        ...truckParams(opts.truck),
      },
      opts.signal,
    );
  }

  /**
   * The routing graph's state: whether the engine is answering, which version it is, and how
   * old the Canada graph is.
   *
   * Resolves rather than rejects when routing is down: it answers `status: "unavailable"`,
   * because a status call that throws when the subject is unhealthy tells you nothing a failed
   * `route()` had not already told you.
   */
  status(opts: { signal?: AbortSignal } = {}): Promise<RoutingStatus> {
    return this.get<RoutingStatus>("/routing/status", {}, opts.signal);
  }

  /**
   * Travel times and distances between every origin and every destination.
   *
   * At most 10 origins and 10 destinations. A `0` is a real answer, which is what you get
   * where an origin is also a destination, and a `null` is a real answer too: a pair the engine
   * could not connect is nulled in place while the rest of the grid answers. A coordinate outside
   * WGS84 rejects first with a `RouterError` (400, `invalid_location`). A location outside
   * Canada rejects first with a `RouterError` (422, `outside_coverage`). The whole call otherwise
   * rejects with a `RouterError` (422, `no_route`) only for a location with no road near it, a
   * set of locations the road network does not connect, or two locations past its straight-line
   * matrix limit.
   */
  matrix(origins: LngLat[], destinations: LngLat[], opts: RoadRouteOptions = {}): Promise<MatrixResult> {
    return this.post<MatrixResult>("/matrix", { origins, destinations, ...bodyOptions(opts) }, opts.signal);
  }

  /**
   * Snap a GPS trace to the road network. At least 2 and at most 100 coordinates.
   *
   * Returns the same `RouteResult` `route()` returns: a matched trace is a route. A coordinate
   * outside WGS84 rejects with a `RouterError` (400, `invalid_location`). A point outside Canada
   * rejects with a `RouterError` (422, `outside_coverage`) before the graph is searched.
   */
  match(coordinates: LngLat[], opts: RoadRouteOptions & StepOptions = {}): Promise<RouteResult> {
    return this.post<RouteResult>("/match", { coordinates, ...bodyOptions(opts) }, opts.signal);
  }

  /**
   * Order a set of stops and return the route through them. At least 3 and at most 10 stops.
   *
   * The first stop is the fixed start and the last is the fixed end; only the stops between
   * them are reordered. There is no round-trip or open-route toggle: that is a real constraint
   * of the underlying engine, not an omission here.
   *
   * Optimizing solves a cost matrix over every stop, but it does not inherit `matrix()`'s per-cell
   * nulls: a stop set whose own matrix returns nulls still optimizes. A coordinate outside WGS84
   * rejects first with a `RouterError` (400, `invalid_location`). A stop outside Canada rejects
   * first with a `RouterError` (422, `outside_coverage`). The whole call otherwise rejects with
   * a `RouterError` (422, `no_route`) when the stops are not all in one region the road network
   * connects, or two are further apart than the engine's straight-line matrix limit. There is no
   * partial tour either way, because a tour needs every leg.
   */
  optimize(stops: LngLat[], opts: RoadRouteOptions & StepOptions = {}): Promise<OptimizedRouteResult> {
    return this.post<OptimizedRouteResult>("/optimized-route", { stops, ...bodyOptions(opts) }, opts.signal);
  }

  /**
   * Assign shipments to vehicles and order their visits: Google Route Optimization's
   * `optimizeTours`, served by Unmap Optimize. See the standalone `optimizeTours()` for what it
   * resolves with and throws. This is `/optimized-route`'s bigger sibling: that one orders stops
   * for a single vehicle, this one plans a fleet.
   */
  optimizeTours(request: OptimizeToursRequest, opts: { signal?: AbortSignal } = {}): Promise<OptimizeToursResult> {
    return optimizeTours(request, { key: this.key, gateway: this.base, fetch: this.fetchImpl, retry: this.retry, signal: opts.signal });
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const q = new URLSearchParams({ key: this.key });
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${q}`,
      {
        method: "POST",
        signal,
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res, path);
    return res.json() as Promise<T>;
  }

  private async get<T>(
    path: string,
    params: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    const q = new URLSearchParams({ key: this.key });
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, v);
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${q}`,
      { signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res, path);
    return res.json() as Promise<T>;
  }
}

// The shared error type and retry policy, re-exported so a caller who installed only this
// package can `catch (e) { if (e instanceof UnmapError) }` without adding @unmap/core.
export { UnmapError, parseRetryAfter, type RetryPolicy } from "@unmap/core";
