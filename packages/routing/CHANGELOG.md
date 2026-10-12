# @unmap/routing

## 0.21.0

### Minor Changes

- 0870187: Add `optimizeTours()` to `@unmap/routing` and `@unmap/sdk`, a typed client for Unmap Optimize (`POST /optimize`), which takes Google Route Optimization's `OptimizeToursRequest` and returns its `OptimizeToursResponse` unchanged. It resolves with `{ response, warnings, billableShipments, timeoutClamped, clampedTimeoutSeconds }`, so the Unmap findings from the response headers sit beside the Google response and never inside it. The key travels in the `X-API-Key` header, not the URL. A failure throws `UnmapOptimizeError`, an `UnmapError` that also carries Google's `googleStatus` and `details` (the field violations of a `google.rpc.BadRequest`). `Router#optimizeTours()` is the same call on an existing client, so `new Unmap({ key }).router.optimizeTours(request)` works.
- fd1f387: Turn-by-turn steps. `route()`, `match()` and `optimize()` take `steps: true` and return `steps`: written directions for display (no voice), each with an unmap-named `type` and `modifier`, the `instruction` text, street names, distance, duration, its start `location`, and `geometryRange` into the route line. `lang: "fr"` writes them in French; without it the gateway follows `Accept-Language`.

### Patch Changes

- @unmap/core@0.21.0

## 0.20.0

### Patch Changes

- @unmap/core@0.20.0

## 0.19.0

### Patch Changes

- @unmap/core@0.19.0

## 0.18.0

### Minor Changes

- e8bd35b: `router.isochrone` takes `mode: "transit"` with a required `departAt`, typed like a transit route: road options (`avoid`, `avoidAreas`, `truck`, `useHighways`, `useHills`) are refused at compile time. A transit band can be a `MultiPolygon`, and a centre with no scheduled transit nearby rejects with a `RouterError` whose `code` is `outside_coverage`.

### Patch Changes

- @unmap/core@0.18.0

## 0.17.0

### Minor Changes

- 1dab6bc: Breaking. `style` is the one option that names a map style: `flavor` is removed from `createMap`, `new Unmap()`, `useUnmap()` and `<Map>`, and a string that is neither a style name nor a URL is passed through unchanged. `router.isochrone`, `geocoder.reverse` and `elevation.get` send `near=lng,lat` (`POST /isochrone` sends `near`), and the React and Vue `useDirections` isochrone call names its point `near`. `parseIdentifyAt(at)` takes one argument. In `@unmap/themes`, `validateTheme` refuses retired style names, the `u03` preset code no longer decodes, and `isThemeBase` replaces `normalizeThemeBase`. `@unmap/sdk`'s coverage types read freshness and provenance from `provenance` and `freshness_status`, `freshness_basis` is `{ en, fr }`, and document-level `jurisdictions` is `string[]`.

### Patch Changes

- @unmap/core@0.17.0

## 0.16.0

### Patch Changes

- @unmap/core@0.16.0

## 0.15.0

### Patch Changes

- @unmap/core@0.15.0

## 0.14.0

### Minor Changes

- fe6818e: Make a quiet restriction feed and a failed route walk visible.

  The compliance event recorded what a request could check. It could not record why, and two very
  different failures ended up looking identical: a dead `/trace_attributes` and a 511 feed that has
  been down for six hours both surface as `unknown` on a route that still answers 200.

  `unmap.route.v1` gains `routeChecked`, which separates the along-route walk from the temporal
  layer, plus `unknownCoverageClasses`, `authoritativeCoverageClasses` and `restrictionsApplied`.
  Those three are what make "did deploying the enriched graph move anything" answerable from the
  logs, and they are counts rather than names, which keeps the event's privacy line where it was:
  no jurisdiction, no road name, no coordinate, no vehicle dimension.

  `unmap.restrictions.v1` is new and holds the opposite line deliberately: it names the
  jurisdiction, because a province's feed being stale is our operational fact while a route's
  jurisdiction is a customer's shipment. One event per feed per cron tick, separating the three
  failures worth separating — `refreshed`, `failed` for a feed that is down or answered with nothing
  (the writers throw rather than store an empty parse), and `skipped` for a keyed feed nobody
  configured a key for. Alberta without `ALBERTA_511_KEY` is a deployment that was never asked to
  fetch, and paging someone for it would train them to ignore the alert that matters.

  `GET /routing/status` gains `restrictionFeeds`. The graph is rebuilt weekly and cannot carry a
  closure, so "is routing current" always had two halves and only one was askable. It reads the
  snapshots directly rather than the cron's last outcome, because the snapshot is what a route
  trusts, and it uses the same `MAX_SNAPSHOT_AGE_SECONDS` a request uses so the endpoint and the
  validator cannot disagree about what fresh means. A feed that never wrote a snapshot is `absent`
  rather than `stale`: nothing decayed, nothing was configured.

  `enrich.sh`'s run report gains per-source conflation counts and an accept rate, and says plainly
  that they measure matching only — a restriction can match its road perfectly and still never
  reach the graph because the engine has no field for it. Reading a 100% accept rate as 100%
  injected is the mistake that table would otherwise invite, and the test pins the warning as well
  as the numbers.

- c1d4973: Report authority road closures on every mode, not only on `mode: "truck"`.

  A closure carries no value to compare against a vehicle: the road is simply shut, to a truck and
  to a car alike. The routing graph is rebuilt weekly and cannot carry one, so a closure reaches a
  route only by being checked at request time, and until now that check ran only when a truck asked.
  A car routed through a closed highway came back clean while a truck on identical geometry was told.
  There was no reason behind the asymmetry; it was where the truck work happened to stop.

  `warnings` now carries `CLOSURE_IN_FORCE_NEAR_ROUTE` and `CLOSURE_SCHEDULED_NEAR_ROUTE` on any
  mode, with `when` (`"now"` or `"later"`) and the authority's own `effectiveFrom` / `effectiveTo`
  where the feed states them. `RouteWarning.where` gains `"route"` for a finding that applies along
  the path rather than at an endpoint. Coverage is Ontario, Alberta and British Columbia, which is
  where authoritative feeds exist.

  Two things this deliberately does not do. It does not claim your route passes THROUGH a closure:
  most are published as a single point, so proximity within 250 m is the honest claim and the wording
  says so. And outside the three provinces with feeds it adds no "not checked" warning, because a
  permanent unactionable warning on every route in the other ten jurisdictions would teach callers to
  ignore the field; the coverage claim is made here and on the API surface instead. A `mode: "truck"`
  body, which does state what it examined, still reports the layer unchecked in
  `truck.validation.unknowns`.

  Which feeds a request consults is now decided by the route's own extent, so this did not turn one
  KV read into three on the busiest endpoint, and "the temporal layer was checked" stopped being a
  claim with no jurisdiction in it: a route nowhere near a feed reads nothing and says so, where
  before it counted another province's fresh snapshot as its own.

- b4d69a9: Add `warnings` to a route result, on every mode, and a `RouteWarning` type.

  If there is no road near a point you send, the routing engine does not refuse: it moves the point
  to the nearest road it can use and returns a confident route to somewhere else. Asked for a route
  between two places with no road between them it answered `200` with a 10.1 km route having
  relocated the destination 292.3 km, and inside a dense province it has been measured relocating by
  19 km. Nothing in the response said so.

  `warnings` says so. `ENDPOINT_RELOCATED` names the end (`where`) and carries the distance, and you
  still get the route, because it is usually a good route that simply ends short of the place you
  named. `ENDPOINT_RELOCATION_NOT_CHECKED` means the route came back without a usable shape, so the
  check could not run; do not read that as the endpoints being fine.

  This is not a truck concern and the field is on every mode. It fires more often on `mode: "auto"`
  than on `mode: "truck"`, because car costing reaches road fragments a truck cannot. The field is
  absent when there is nothing to report, so an unaffected route body is unchanged.

  Most relevant where it is least visible: a well pad, a remote lease, a mine, a new subdivision.

- 8233d6f: Check every road a truck route traversed, not only its two ends.

  The validator looked at the origin edge, the destination edge, and temporal events within 250 m of
  the line. A posted clearance in the middle of the route was invisible, and `restrictions_applied`
  documented its own absence.

  `/trace_attributes` with `shape_match: "edge_walk"` now walks the route's own shape and names the
  ways it traversed; `/locate` reads what is posted on each of them. That pairing is what makes the
  answer certain rather than hedged. The endpoint check has to say
  `ENDPOINT_RESTRICTION_MAY_BE_EXCEEDED` when a point sits on several candidate edges, because
  `/locate` will not say which one the trip used. Along the route the traversed way is known, so a
  candidate on any other way is discarded and a posted limit the vehicle exceeds is a
  `ROUTE_RESTRICTION_EXCEEDED` conflict with nothing inferred.

  It exists for a hole that is real and reproducible: **a restriction does not bind the edge a
  vehicle departs from**. A route leaving a low bridge is returned along it whatever the vehicle's
  height, and the engine reports no error. `pipeline/routing/test/route-walk.test.sh` drives a truck
  off a `maxheight=3.5` road at 3.0 m and at 4.2 m against a real 3.8.3 engine: both get the same
  1.4 km route, and the walk is silent on the first and names the restriction on the second.

  Two measurements shaped the design, and one of them contradicted the obvious approach.
  `/trace_attributes` carries **no dimension limits at all** — an edge has 39 attributes and not one
  is a height, weight, width, length or axle-load limit, and asking for them in `filters.attributes`
  returns a body without them rather than an error. So the values must come from `/locate`, which is
  why this is two calls and not one. The test asserts that absence, so an engine upgrade that adds
  them turns into a failing check rather than a permanent extra round trip. `/locate` answered 200
  locations in a single request, so route length does not multiply round trips.

  `restrictions_applied` now ships on `TruckMeta`: every comparable restriction posted on a road the
  route traversed, whether or not the vehicle exceeded it. A 20 t bridge on the path is listed for a
  10 t truck, because knowing the route crosses it is worth having.

  Three honesty rules carry over unchanged. A failed walk withholds `route_static_restrictions` and
  says `ROUTE_RESTRICTIONS_NOT_CHECKED`, because "checked and clear" and "not checked" are different
  answers. A route with more distinct roads than one pass can sample reports
  `ROUTE_RESTRICTIONS_PARTIALLY_CHECKED`, keeps the conflicts it did find, and still withholds the
  class — 200 ways of 3,000 is not a checked route. And `restrictions_applied` is absent rather than
  `[]` in both cases, because an empty array would claim the route carries no postings.

  It does not refuse or reroute. `/route` degrades and never refuses over Truck Intelligence, and
  turning a conflict into a 4xx would remove a route the caller can still use with a different
  vehicle, on a surface whose contract is to report rather than decide.

- 5d65d3d: One error type and one retry policy across every client, plus `unmap.coverage`.

  `UnmapError` lands in `@unmap/core` and every product error now extends it, so
  `catch (e) { if (e instanceof UnmapError) }` covers the whole platform. Before
  this a caller had to enumerate `GeocoderError`, `PlacesError`, `RouterError`,
  `ElevationError`, `RoadsError` and `TransitError`, and keep that list current as
  the platform grew. The subclasses are unchanged and keep their names, so
  `instanceof GeocoderError` still works; they gain `retryAfterSeconds` from the
  header and a `retryable` getter.

  Reads now retry `429`, `502`, `503` and transport failures, three attempts by
  default, honouring `Retry-After` rather than guessing a backoff. The
  documentation has always told callers to honour that header and the clients did
  not. Configure with `retry: false` or `retry: { attempts, maxDelayMs }`.

  A wait longer than `maxDelayMs` (10 s) is not slept through: the call returns the
  failure carrying `retryAfterSeconds` instead. The sleeping add-on containers
  answer `Retry-After: 60`, and parking a caller's request handler for a minute
  inside one `await` is a worse surprise than an error they can schedule around.

  Feedback submissions are deliberately never retried: `POST /feedback` creates a
  record with no idempotency key, so a retry after a timeout risks filing the same
  report twice.

  The retry decision reads only the status and the `Retry-After` header, never the
  body. That keeps `opts.fetch` usable with a two-line stub, which is what that
  option exists for; requiring `clone()` would have broken every existing test
  double.

  `unmap.coverage` is new: `get()` for the whole `/coverage.json` document and
  `capability(id)` for one. Unauthenticated and unmetered, so checking costs
  nothing, and it is the only way to answer "is transit routing live in this city"
  before promising a user an answer.

- 5713e66: Report time-limited restrictions that carry a value, not only full closures.

  `TruckValidation` gains two things from the same source. `checkedRestrictionClasses` can now
  include `temporal_limits`, which says a posted temporary limit was compared against the vehicle
  you declared, and the findings carry new codes:

  - `TEMPORARY_LIMIT_EXCEEDED` in `conflicts`: a limit in force that your declared vehicle exceeds.
  - `TEMPORARY_LIMIT_SCHEDULED` in `unknowns`: the same, for a window that has not started.
  - `TEMPORARY_LIMIT_DEPENDS_ON_CONFIGURATION` in `unknowns`: a bridge posting different weights per
    vehicle configuration, where your declared mass is over the strictest and within the most
    permissive. Alberta posts 25 t for a single truck and 63.5 t for a B-train at the same
    structure, so a declared 40 t is legal as one and illegal as the other. This service does not
    collect your configuration, so it reports the ambiguity instead of guessing which applies.
  - `TEMPORARY_LIMIT_UNDECLARED` in `unknowns`: a limit is posted and you did not declare the
    parameter it constrains.

  Read the message as well as the code on these. A limit the authority published in a structured
  field and one read out of its own description are both reported, and the message says which,
  because they do not deserve equal confidence.

  Source today is 511 Alberta's event feed. Ontario contributes closures only; its restriction
  fields are empty.

- 82496de: Add the departure-time transit route contract. `mode: "transit"` requires `departAt`, returns
  walking and scheduled-transit legs, and stays behind the gateway's transit graph deployment gate.
- e1e9a1d: Type the `truck` coverage block on a `mode: "truck"` route result.

  `RouteResult` gains an optional `truck` field carrying the vehicle profile as sent, whether it was
  complete, per-class restriction `coverage`, a derived `verification`, and `warnings`. It is a
  sibling of `distanceMeters` / `durationSeconds` / `geometry`, so nothing that reads a route today
  changes.

  Read `warnings` before relying on a truck route. `ENDPOINT_RESTRICTIONS_UNCHECKED` appears
  whenever the endpoint check did not clear the route's first and last road segment, which includes
  every route where the check could not run: restrictions are not applied to those two segments, so
  clearance and load limits at the origin and destination have to be checked separately.

- dbf085f: Document the Truck Intelligence add-on on `RouteResult.truck`.

  `mode=truck` is unchanged and stays included with normal routing on every plan: Valhalla truck
  costing, the truck restrictions carried in the road network, and every vehicle profile parameter.
  What the add-on gates is the enriched graph and evidence layer, and the type now says so. REST,
  MCP and A2A all use the same routing service and entitlement decision.

  On a key without it, `truck` is still present and reports honestly that nothing was checked: every
  `coverage` class is `not_checked`, `verification` is `unknown`, `validation` is absent, and
  `warnings` carries `TRUCK_INTELLIGENCE_NOT_ENABLED`. `not_checked` rather than `osm_only` is the
  load-bearing detail: `osm_only` claims a provenance, and without the add-on nothing looked.

  `/route` does not refuse. There is no `addon_required` on this endpoint, because a truck route
  without the add-on is still a truck route and refusing one that works today would remove a live
  feature. Closure warnings are not gated either, on any mode: a shut road is shut to a car too.

- 36099cb: Widen the truck validation finding for time-limited restrictions.

  `TruckValidationFinding.where` gains `"route"`, for a finding that applies along the path rather
  than at an endpoint, plus `when`, `effectiveFrom` and `effectiveTo` for a restriction with a time
  window.

  `conflicts` is no longer always empty. A full closure in force needs no comparison against your
  vehicle and is reported as a conflict. A posted dimension or weight limit your declared vehicle
  exceeds is reported as one too: the routing engine does expose the stored values, in a sibling
  `access_restrictions` array, so the comparison is real rather than "something is posted here".

  Check `checkedRestrictionClasses` before trusting a `clear`: `TEMPORAL_RESTRICTIONS_NOT_CHECKED`
  in `unknowns` means the time-limited layer was unavailable, which is not the same as no closures
  found.

- 6b21a57: Type the truck endpoint check on a `mode: "truck"` route result.

  `TruckMeta` gains `validation` and `enrichedJurisdictions`. The validation block reports what was
  independently checked after the route was produced: the routing engine does not apply restrictions
  to a route's first or last segment, and this is the check that looks at those two anyway.

  Read the semantics before branching on it. `status: "clear"` means clear against
  `checkedRestrictionClasses`, never that a route is legally compliant.

  `conflicts` carries findings that are decided: a posted limit your declared vehicle exceeds, and a
  full closure in force. `unknowns` carries what could not be decided, including a restriction whose
  kind cannot be compared against dimensions at all, one whose parameter you did not declare, and an
  endpoint the routing engine moved or one that sits on a road closed to trucks. Send a complete
  vehicle profile to get real comparisons rather than "something is posted here".

### Patch Changes

- 897f993: A `502` does not carry `Retry-After`. Routing uses `routing_failed`. `/elevation` uses `upstream_error` with `elevation sample failed` when a terrain tile will not decode, and `not_found` with `terrain archive not configured` when the archive is absent. The client still retries a `502`, on its own backoff.
- 05c7ae9: Document `/matrix` null cells honestly: a pair the engine cannot connect is nulled in place
  while the rest of the grid answers, which is what production has always done.

  The previous docs, types and error message said a null cell never appears and that any
  unreachable pair fails the whole request. Re-probed across 40 pairs, that is wrong on both
  counts. Nulls are routine, and every null found was a pair `/route` answers; genuine
  unreachability is instead rejected whole by a connectivity check that is a property of the
  location set, not of any one coordinate. The 422 message now says all three things that actually
  cause it. Handle `null` on every cell, and do not show one to a user as "unreachable".

  Also sets `thor.costmatrix.allow_second_pass` in the routing config, which is the fix for those
  false nulls. It takes effect on the next routing container rebuild.

  See `docs/decisions/2026-09-20-matrix-partial-results-are-native.md`.

- 897f993: A coordinate outside Canada is `422` with code `outside_coverage`, and the geocoder or the road graph is not called. A Canadian request the graph cannot answer stays `no_route`, including Iqaluit to the mainland and open water inside Canada. A longitude or latitude outside WGS84 is `400` `bad_request` on geocoding and places, and `400` `invalid_location` on routing.
- 31b115a: `router.status()` now includes `graph.osmTimestamp` when the serving graph recorded the source OSM extract's date.
- Updated dependencies [5d65d3d]
  - @unmap/core@0.14.0

## 0.13.0

### Minor Changes

- 81b19d9: `avoidAreas`: keep a route out of a closure, a construction zone or an evacuation area.

  ```ts
  await unmap.router.route(a, b, { avoidAreas: closure });
  ```

  Any GeoJSON `Polygon`, `MultiPolygon`, or `FeatureCollection` of either, on all five endpoints.

  Valhalla defines this as an exclusion rather than a preference. Gateway support remains behind
  `AVOID_AREAS_ENABLED` while the pinned engine can snap a location across an excluded polygon;
  production keeps the flag off until an upstream fix is deployed and the live probes pass.

  Passing it switches `route()` and `isochrone()` from GET to POST, because a polygon does not fit
  in a query string. Same parameters, same response, and a plain route keeps its cacheable GET.

  Interior rings are rejected because the engine cannot preserve holes. When enabled, the request
  accepts at most 8 areas, 100 vertices and 10 km of perimeter in total.

- 96c496a: `avoid` on every routing call: keep a route away from tolls, motorways or ferries.

  ```ts
  await unmap.router.route(a, b, { avoid: ["tolls", "ferries"] });
  ```

  Accepted on `route`, `isochrone`, `matrix`, `match` and `optimize`, so a toll means the same
  thing everywhere. `tolls` and `highways` are driving modes only; `ferries` works on all five.

  It is a preference, not an exclusion. These are costing weights: a route whose only path crosses
  a toll bridge still crosses it, and nothing in the result says that it did. Use it for "prefer
  the free way if there is one", not for "this vehicle is not permitted on toll roads".

  `avoid: ["highways"]` and `useHighways` are the same setting and the gateway rejects both
  together. There is no `unpaved`: the driving engine has no notion of road surface, so the token
  would have meant two different things by mode.

### Patch Changes

- @unmap/core@0.13.0

## 0.12.0

### Minor Changes

- deb5c6d: `router.status()`: how old the routing graph is, as a number rather than a claim.

  ```ts
  const { status, engine, graph } = await unmap.router.status();
  // { status: "ready", engine: { name: "valhalla", version: "3.8.3" },
  //   graph: { builtAt: "2026-09-10T04:12:00.000Z", ageHours: 176 } }
  ```

  Resolves rather than rejecting when routing is down: it answers `status: "unavailable"`, because
  a status call that throws when its subject is unhealthy tells you nothing a failed `route()` had
  not already told you.

  `graph` is absent when the engine did not report a build time, which is the case for any graph
  built before the service was configured to report one. Absent means unknown; it never means
  fresh, and there is no placeholder date in its place.

### Patch Changes

- @unmap/core@0.12.0

## 0.11.0

### Minor Changes

- ad55c22: Add `router.matrix(origins, destinations)` and `router.match(coordinates)`. Matrix returns travel times and distances between every pair, with `0` for a real zero on the diagonal; if any pair is unreachable, or beyond the engine's own road-distance limit, the whole call rejects with a `RouterError` (422, `no_route`) rather than resolving with a `null` cell for that pair. Match snaps a GPS trace and returns the same `RouteResult` `route()` returns, and rejects the same way when the trace cannot be snapped to any road.
- 6b14c87: Add `router.optimize(stops, opts?)`: given 3 to 10 stops, returns the order to visit them in plus the route through them, as an `OptimizedRouteResult` (a `RouteResult` with one extra `order` field, indices into `stops` in visiting order). The first and last stop are the fixed start and end; only the stops between them are reordered. Optimizing solves a cost matrix over every stop internally, so it is expected to fail the same way `matrix()` does: if any stop is unreachable, or the set is spread further apart than the engine's own road-distance limit allows, the whole call rejects with a `RouterError` (422, `no_route`) rather than resolving with a partial tour.
- ed99e21: Add a `useHighways` option so driving routes can prefer or avoid motorways and trunk roads.
- 5c788c1: Add a `useHills` option so cycling and walking routes can avoid or accept climbs.

### Patch Changes

- Updated dependencies [31fdec2]
- Updated dependencies [1d5e90e]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [ed99e21]
- Updated dependencies [31fdec2]
  - @unmap/core@0.11.0

## 0.10.0

### Patch Changes

- @unmap/core@0.10.0

## 0.9.1

### Patch Changes

- @unmap/core@0.9.1

## 0.9.0

### Patch Changes

- @unmap/core@0.9.0

## 0.8.0

### Minor Changes

- 8a2d5a2: The `decimal` style is retired: it read as the same map as `blueprint`. `THEME_BASES` and `STYLE_NAMES` list eight styles. A theme document with `base: "decimal"`, the `flavor=decimal` URL forms and the `u03` preset code all resolve to `blueprint`, so nothing already printed breaks.
- 8b2c705: Seven new theme presets, each built to be unlike the others: `magma`, `neon`, `candy`, `ultraviolet`, `noir`, `sepia`, `ultramarine`. `THEME_PRESETS` is append-only, so every existing preset code keeps its meaning.
- 7008baa: Four new styles, sketched from CARTOColors: `tropic` (teal water, spring greens, cream land, coral highway), `sunset` (a warm duotone with indigo water), `bold` (the saturated street map) and `pastel`. `THEME_BASES` and `STYLE_NAMES` list twelve styles; the preset codes `u09` to `u0C` name them. Six new ramps ship with them: `linen`, `coral`, `peach`, `indigo`, `azure`, `amber`.

### Patch Changes

- Updated dependencies [8a2d5a2]
- Updated dependencies [8b2c705]
- Updated dependencies [7008baa]
  - @unmap/core@0.8.0

## 0.7.0

### Patch Changes

- @unmap/core@0.7.0

## 0.6.0

### Patch Changes

- @unmap/core@0.6.0

## 0.5.0

### Patch Changes

- @unmap/core@0.5.0

## 0.4.0

### Minor Changes

- 7179c7d: Add `mode: "car"` (the same driving profile as `auto`, under a name that does not read as
  "automatic") and `mode: "truck"` with a typed `TruckProfile` (`height`, `width`, `length`, `weight`,
  `axleLoad`, `axleCount`, `hazmat`, `useTruckRoute`) on `route()` and `isochrone()`, and export
  `RouteOptions`. The gateway now rejects an unknown `mode` with a 400 instead of silently
  routing as a car.

### Patch Changes

- `RouterError.message` now carries the gateway's reason ("mode must be one of auto, car, bicycle, pedestrian, truck") instead of only the status, and a new `code` property exposes the machine-readable error code when the response has one.

- @unmap/core@0.4.0

## 0.3.0

### Patch Changes

- @unmap/core@0.3.0

## 0.2.0

### Patch Changes

- @unmap/core@0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".
- Updated dependencies [8853c50]
  - @unmap/core@0.1.3

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.
- Updated dependencies [300bb41]
  - @unmap/core@0.1.2

## 0.1.1

### Patch Changes

- @unmap/core@0.1.1

## 0.0.3

### Patch Changes

- Updated dependencies [93e99b5]
  - @unmap/core@0.1.0
