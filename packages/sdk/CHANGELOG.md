# @unmap/sdk

## 0.20.0

### Minor Changes

- a1dfd17: Require `maplibre-gl` `^6.9.0` and stop loading the right-to-left text plugin. MapLibre 6.9 and later draw Arabic and Hebrew without it and deprecate `setRTLTextPlugin`, so `createMap` no longer calls it and `rtlPluginUrl` is removed from `@unmap/maps`. `unmap init` now prints `import { Map } from "maplibre-gl"`: MapLibre 6 has no default export, so the old `import maplibregl from "maplibre-gl"` snippet threw at load.

  The CDN browser bundle now publishes three files per version, not four: MapLibre 6.13's worker is self-contained and its `maplibre-gl-shared.mjs` is empty. Bundler users copy only `maplibre-gl-worker.mjs`.

### Patch Changes

- Updated dependencies [a1dfd17]
  - @unmap/maps@0.20.0
  - @unmap/core@0.20.0
  - @unmap/geocoding@0.20.0
  - @unmap/routing@0.20.0
  - @unmap/elevation@0.20.0

## 0.19.0

### Minor Changes

- 57c38b5: Clients for the layer catalog and for tenant overlays.

  ```ts
  const layers = await unmap.layers.list({ jurisdiction: "CA-AB" });
  const parcels = await unmap.layers.get("survey.dls");
  console.log(parcels.attribution, parcels.known_gaps);

  const { overlay } = await unmap.byod.upload(file, { name: "Service areas" });
  const map = new Unmap({ key, container: "#map", overlays: [overlay] });
  ```

  Both endpoints existed with no client until the SDK parity audit went looking. `@unmap/maps`
  already consumed layer and overlay **tiles** through a style document, which is why the gap was
  easy to miss: maps worked. What had no client was everything around the tiles. Nothing could ask
  what layers exist, what a layer's licence says or which add-on it needs, and nothing could upload
  an overlay without hand-rolling a multipart request.

  Two details that are the easy way to get this wrong, both pinned by tests:

  **A `Blob` upload sets no `content-type` header.** The runtime has to add the multipart boundary
  itself; setting the header by hand produces a request the server cannot parse.

  **`upload()` returns the whole record, not the id.** `overlays` takes the `byod:<id>` token rather
  than the bare id, so returning the record makes reaching for the right field the path of least
  resistance.

  `byod.list()` reports the server's own limits rather than a constant in the client that could
  drift out of step with them.

  Failures throw `CatalogError`, which extends `UnmapError`. An unknown or retired layer id is a
  `404` `not_found`. Reads honour the instance's `retry` policy; uploads and deletes are never
  retried, because a retry after a lost response would store a duplicate overlay or report a
  successful delete as a `404`. `Layer.addon` is the capability id the gateway sends (`legalLand`,
  `energy`, `agriculture`, `remote`, `mining`), not the `addon-*` SKU.

### Patch Changes

- fd42c13: Road events cover British Columbia and Alberta, and the doc comments on `unmap.coverage` now say so instead of "one province". `RoadEventsResponse.meta` gains the optional `polled` array: Alberta is served from a five-minute poll, and each feed reports when it was polled and how old it may get before it is listed in `unavailable` instead.

  The same comments no longer say transit routing is "one agency": it covers the feeds marked routing-ready on the national transit graph.

  - @unmap/core@0.19.0
  - @unmap/maps@0.19.0
  - @unmap/geocoding@0.19.0
  - @unmap/routing@0.19.0
  - @unmap/elevation@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [e8bd35b]
  - @unmap/routing@0.18.0
  - @unmap/core@0.18.0
  - @unmap/maps@0.18.0
  - @unmap/geocoding@0.18.0
  - @unmap/elevation@0.18.0

## 0.17.0

### Minor Changes

- 1dab6bc: Breaking. `style` is the one option that names a map style: `flavor` is removed from `createMap`, `new Unmap()`, `useUnmap()` and `<Map>`, and a string that is neither a style name nor a URL is passed through unchanged. `router.isochrone`, `geocoder.reverse` and `elevation.get` send `near=lng,lat` (`POST /isochrone` sends `near`), and the React and Vue `useDirections` isochrone call names its point `near`. `parseIdentifyAt(at)` takes one argument. In `@unmap/themes`, `validateTheme` refuses retired style names, the `u03` preset code no longer decodes, and `isThemeBase` replaces `normalizeThemeBase`. `@unmap/sdk`'s coverage types read freshness and provenance from `provenance` and `freshness_status`, `freshness_basis` is `{ en, fr }`, and document-level `jurisdictions` is `string[]`.

### Patch Changes

- Updated dependencies [1dab6bc]
  - @unmap/maps@0.17.0
  - @unmap/routing@0.17.0
  - @unmap/geocoding@0.17.0
  - @unmap/elevation@0.17.0
  - @unmap/core@0.17.0

## 0.16.0

### Patch Changes

- @unmap/core@0.16.0
- @unmap/maps@0.16.0
- @unmap/geocoding@0.16.0
- @unmap/routing@0.16.0
- @unmap/elevation@0.16.0

## 0.15.0

### Minor Changes

- 9ffd903: Remove `unmap.geolocation.ip()` along with `GET /ip`.

### Patch Changes

- Updated dependencies [d15501c]
- Updated dependencies [aabbb85]
  - @unmap/maps@0.15.0
  - @unmap/elevation@0.15.0
  - @unmap/core@0.15.0
  - @unmap/geocoding@0.15.0
  - @unmap/routing@0.15.0

## 0.14.0

### Minor Changes

- f192c3e: `unmap.geolocation.ip()` returns the approximate location of the current request.

  `GET /ip` reads network metadata already on the request. It does not ask for device location, and a missing field is null. `precision` is always `"approximate"`. One request is one call on the shared pool.

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

- b2e8d53: Add `unmap.transit` for scheduled Canadian transit data:

  ```ts
  await unmap.transit.agencies();
  const stops = await unmap.transit.nearbyStops([-79.3832, 43.6532]);
  await unmap.transit.departures(stops.data[0].id, { at: new Date() });
  ```

  The client also supports stop and route lookup. Responses retain source, freshness and attribution
  metadata, and departures are explicitly scheduled until a realtime phase ships.

- 2ba39a6: `unmap.timezone.lookup([lon, lat])` returns the IANA zone and the UTC offset at an instant.
- 82496de: Add the departure-time transit route contract. `mode: "transit"` requires `departAt`, returns
  walking and scheduled-transit legs, and stays behind the gateway's transit graph deployment gate.
- f0f6236: Treaty context on geocoding: `include=treaties` on `/geocode/search` and `/geocode/reverse`.

  Every result gains a `treaties` object listing the CIRNAC historic and modern treaty
  representations that cover the point: the result's own coordinate on search, the coordinate you
  sent on reverse. `status: "ok"` with no matches means no record in this dataset, never unceded
  land or an absence of Indigenous rights; `status: "unavailable"` means the lookup did not run.
  Without `include`, responses are unchanged. Still one call.

  `geocoder.search(q, { include: ["treaties"] })` and
  `geocoder.reverse(lng, lat, { include: ["treaties"], treatiesVersion })`, with the same options on
  the React and Vue `useGeocoder` hooks. `reverse` also accepts `limit`.

  `createTreatyOverlay(map, geocoder)` (in `@unmap/geocoding`, re-exported by `@unmap/sdk`) pairs with `overlays: ["treaties"]`: it shows
  or hides historic and modern treaties and answers a click, or `lookupAt([lng, lat])`, with the
  full-resolution treaty context for that point, pinned to the dataset version drawn on the map.

### Patch Changes

- 897f993: A `502` does not carry `Retry-After`. Routing uses `routing_failed`. `/elevation` uses `upstream_error` with `elevation sample failed` when a terrain tile will not decode, and `not_found` with `terrain archive not configured` when the archive is absent. The client still retries a `502`, on its own backoff.
- 1c7c1a9: Document the worldwide default basemap and supported Protomaps label languages in the package guides.
- 31b115a: `router.status()` now includes `graph.osmTimestamp` when the serving graph recorded the source OSM extract's date.
- 891b39a: Record the live TTC routing graph in the coverage snapshot.

  The static site was still painting transit as planned after TRANSIT_ENABLED
  shipped. The fallback now matches the five ingested feeds, includes
  `/route?mode=transit` only when routing is bound, and keeps TransLink and STM
  held.

- Updated dependencies [897f993]
- Updated dependencies [1c7c1a9]
- Updated dependencies [05c7ae9]
- Updated dependencies [897f993]
- Updated dependencies [fe6818e]
- Updated dependencies [c1d4973]
- Updated dependencies [b4d69a9]
- Updated dependencies [8233d6f]
- Updated dependencies [31b115a]
- Updated dependencies [897f993]
- Updated dependencies [5d65d3d]
- Updated dependencies [5713e66]
- Updated dependencies [82496de]
- Updated dependencies [f0f6236]
- Updated dependencies [e1e9a1d]
- Updated dependencies [dbf085f]
- Updated dependencies [36099cb]
- Updated dependencies [6b21a57]
  - @unmap/elevation@0.14.0
  - @unmap/geocoding@0.14.0
  - @unmap/routing@0.14.0
  - @unmap/maps@0.14.0
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

- ac02791: Clients for Places, road events and data-correction feedback.

  ```ts
  const unmap = new Unmap({ key });

  await unmap.places.search("calgary tower");
  await unmap.places.nearby("boulangerie", { near: [-73.57, 45.5] });
  await unmap.places.get("um:place:1234");

  await unmap.roads.closures({ jurisdiction: "CA-BC" });
  await unmap.roads.conditions({ near: [-114.07, 51.05], radius: 50_000 });

  await unmap.feedback.submit({
    product: "geocoding",
    category: "incorrect_location",
    description: "17 Ave SW returns a street in Edmonton.",
  });
  ```

  `Places` ships from `@unmap/geocoding` because places are the geocoding corpus: the same rows, the
  same container, the same taxonomy. `Roads` and `Feedback` ship from `@unmap/sdk`. None of the three
  is a new package, because a new package means another entry in the fixed group and another trusted
  publisher to configure, for a boundary that does not exist in the code.

  Two things the clients deliberately surface rather than hide:

  **`meta` is returned, not unwrapped.** A caller who cannot see `attribution` cannot comply with the
  licence the data came under, and one who cannot see `status` cannot tell fresh from stale. On
  `roads.closures()` in particular, read `meta.unavailable`: an empty `data` reads as "nothing is
  shut" to someone deciding whether to drive, which is a very different answer from "we could not
  reach Alberta".

  **`feedback` never sets `include_context` on its own.** That flag records a person's decision to
  attach their request, and a client that set it by default would make the consent gate meaningless.
  It is set only when the caller passes a `context`.

  `Geocoder.nearby()` and every other existing method are unchanged.

### Patch Changes

- Updated dependencies [81b19d9]
- Updated dependencies [96c496a]
- Updated dependencies [ac02791]
  - @unmap/routing@0.13.0
  - @unmap/geocoding@0.13.0
  - @unmap/core@0.13.0
  - @unmap/maps@0.13.0
  - @unmap/elevation@0.13.0

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

- Updated dependencies [deb5c6d]
  - @unmap/routing@0.12.0
  - @unmap/core@0.12.0
  - @unmap/maps@0.12.0
  - @unmap/geocoding@0.12.0
  - @unmap/elevation@0.12.0

## 0.11.0

### Minor Changes

- 31fdec2: Add a `profile: "agriculture"` composition preset and the licensed `agriculture.*` overlay catalog.
- 31fdec2: Add an `overlays` option so style URLs can compose named Canadian catalog layers.
- ed99e21: Add `unmap.data.query()` / `GET /data/query` for bbox lookups against identify-capable catalog layers.
- 4d05f16: Add `unmap.elevation.get()` and the standalone `@unmap/elevation` client: ground elevation anywhere in Canada from NRCan's national 30 m DEM, in metres above CGVD2013. One coordinate or up to a thousand per call. `null` means the dataset covers nothing there and never means sea level.
- 31fdec2: Add a `profile` composition preset so style URLs can expand the energy overlay set.
- 31fdec2: Add `well` and `facility` geocoder layers and make energy catalog layers identify-capable.
- 31fdec2: Add `identify()` for point-in-polygon lookups against Canadian catalog layers.
- 31fdec2: Add `legal_land` as a geocoder layer with structured survey fields, optional bbox, and optional geometry.
- 8c39407: Add ParcelMap BC identify (`survey.parcels`) and PID search (`parcel`).
- 8c39407: Rename the BC parcel layer to `survey.parcels` and its search layer to `parcel`. It is the whole ParcelMap BC cadastral fabric, not farmland, so it is gated by `legal-land` rather than `agriculture`. `parseFarmParcel` / `looksLikeFarmParcel` become `parseParcel` / `looksLikeParcel`.
- ed99e21: Add Remote 0.2 airport overlay catalog and Mining 0.2 Land identify extra tables.
- 31fdec2: Add `profile: "remote"` and `profile: "mining"` composition presets with the smallest live overlay catalogs.
- ed99e21: Add a `useHighways` option so driving routes can prefer or avoid motorways and trunk roads.
- 5c788c1: Add a `useHills` option so cycling and walking routes can avoid or accept climbs.
- ab0ac6e: Add `parseRuralRoute` / `looksLikeRuralRoute` for Canada Post delivery terms (`RR`, `SS`, `MR`, `GD`, `SITE`, `COMP`, `BOX`, `STN`). The gateway strips them before civic search, so `RR 1 Site 5 Comp 12 Millarville` now resolves to Millarville.

### Patch Changes

- 3c0d374: Document the `addon_required` 403 and the add-on entitlement model in the SDK error reference.
- 1d5e90e: Let `unmap add` install the energy and legal-land registry items, and share one MapProfile union that includes agriculture.
- Updated dependencies [31fdec2]
- Updated dependencies [1d5e90e]
- Updated dependencies [31fdec2]
- Updated dependencies [35145a6]
- Updated dependencies [ed99e21]
- Updated dependencies [4d05f16]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [e881470]
- Updated dependencies [6e364e6]
- Updated dependencies [bcb5354]
- Updated dependencies [e3e7a9a]
- Updated dependencies [b2159a0]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [8c39407]
- Updated dependencies [8c39407]
- Updated dependencies [ed99e21]
- Updated dependencies [31fdec2]
- Updated dependencies [ad55c22]
- Updated dependencies [6b14c87]
- Updated dependencies [ed99e21]
- Updated dependencies [5c788c1]
- Updated dependencies [ab0ac6e]
- Updated dependencies [31fdec2]
  - @unmap/core@0.11.0
  - @unmap/maps@0.11.0
  - @unmap/geocoding@0.11.0
  - @unmap/elevation@0.11.0
  - @unmap/routing@0.11.0

## 0.10.0

### Patch Changes

- @unmap/core@0.10.0
- @unmap/maps@0.10.0
- @unmap/geocoding@0.10.0
- @unmap/routing@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies [a4a5b21]
  - @unmap/maps@0.9.1
  - @unmap/core@0.9.1
  - @unmap/geocoding@0.9.1
  - @unmap/routing@0.9.1

## 0.9.0

### Minor Changes

- 2b8f66a: New `projection` option: pass `"globe"` to draw the map as a sphere, or omit it (or pass `"mercator"`) for the flat map. It reaches `createMap`, `new Unmap`, `useUnmap` and `<Map>`, and the `Projection` type is exported alongside them. A city centre with no zoom still frames the city rather than the planet, so adding the option changes nothing until you ask for it. unmap tiles Canada, so at globe zooms the country sits on the sphere and everything outside the archive is empty.

### Patch Changes

- Updated dependencies [2b8f66a]
  - @unmap/maps@0.9.0
  - @unmap/core@0.9.0
  - @unmap/geocoding@0.9.0
  - @unmap/routing@0.9.0

## 0.8.0

### Minor Changes

- b536611: Maps now come with zoom and compass buttons. `createMap()` adds MapLibre's navigation control at `top-right` by default, so `new Unmap({ container })`, `useUnmap()`, `<Map>` and both registry lanes get one without asking. Pass `controls: false` for a bare canvas, or `controls: { position: "bottom-left" }` to move it. Existing maps gain the buttons on upgrade.
- 8a2d5a2: The `decimal` style is retired: it read as the same map as `blueprint`. `THEME_BASES` and `STYLE_NAMES` list eight styles. A theme document with `base: "decimal"`, the `flavor=decimal` URL forms and the `u03` preset code all resolve to `blueprint`, so nothing already printed breaks.
- 8b2c705: Seven new theme presets, each built to be unlike the others: `magma`, `neon`, `candy`, `ultraviolet`, `noir`, `sepia`, `ultramarine`. `THEME_PRESETS` is append-only, so every existing preset code keeps its meaning.
- 7008baa: Four new styles, sketched from CARTOColors: `tropic` (teal water, spring greens, cream land, coral highway), `sunset` (a warm duotone with indigo water), `bold` (the saturated street map) and `pastel`. `THEME_BASES` and `STYLE_NAMES` list twelve styles; the preset codes `u09` to `u0C` name them. Six new ramps ship with them: `linen`, `coral`, `peach`, `indigo`, `azure`, `amber`.

### Patch Changes

- Updated dependencies [b536611]
- Updated dependencies [8a2d5a2]
- Updated dependencies [8b2c705]
- Updated dependencies [7008baa]
  - @unmap/maps@0.8.0
  - @unmap/core@0.8.0
  - @unmap/geocoding@0.8.0
  - @unmap/routing@0.8.0

## 0.7.0

### Minor Changes

- c35cde7: `@unmap/maps` moves to MapLibre GL JS 6 and takes `maplibre-gl` as a **peer dependency** rather
  than a direct one.

  Two changes, for two reasons.

  **The peer dependency.** `@unmap/maps` is a wrapper around a renderer that callers also use
  directly, so owning a private copy of it was wrong: anyone who installed `maplibre-gl` themselves
  to reach `Marker` or `Popup` could end up with two instances in the bundle, two stylesheets, and
  `instanceof` checks that fail across the boundary. Install `maplibre-gl` alongside
  `@unmap/maps` — `npm i @unmap/maps maplibre-gl`.

  `@unmap/sdk` is unaffected in practice: it still depends on `maplibre-gl` directly, so
  `npm i @unmap/sdk` continues to give you a working map with nothing else to install.

  **MapLibre 6.** v6 is ESM-only and dropped the default export, so `@unmap/maps` now re-exports the
  module namespace. `import { maplibregl } from "@unmap/maps"` is unchanged for callers, and
  `createMap()` keeps its signature. If you were reaching for MapLibre through a UMD build or a
  `maplibregl` global, that path is gone upstream: import by name from `maplibre-gl.mjs` instead.

  Also worth knowing when you upgrade: v6 requires WebGL2 (WebGL 1 support was removed), and its
  `error` event carries an `ErrorLike` (`{ message }`) rather than a full `Error`.

### Patch Changes

- Updated dependencies [c35cde7]
  - @unmap/maps@0.7.0
  - @unmap/core@0.7.0
  - @unmap/geocoding@0.7.0
  - @unmap/routing@0.7.0

## 0.6.0

### Patch Changes

- @unmap/core@0.6.0
- @unmap/maps@0.6.0
- @unmap/geocoding@0.6.0
- @unmap/routing@0.6.0

## 0.5.0

### Patch Changes

- @unmap/core@0.5.0
- @unmap/maps@0.5.0
- @unmap/geocoding@0.5.0
- @unmap/routing@0.5.0

## 0.4.0

### Minor Changes

- 7179c7d: Add `mode: "car"` (the same driving profile as `auto`, under a name that does not read as
  "automatic") and `mode: "truck"` with a typed `TruckProfile` (`height`, `width`, `length`, `weight`,
  `axleLoad`, `axleCount`, `hazmat`, `useTruckRoute`) on `route()` and `isochrone()`, and export
  `RouteOptions`. The gateway now rejects an unknown `mode` with a 400 instead of silently
  routing as a car.

### Patch Changes

- Updated dependencies [7179c7d]
  - @unmap/routing@0.4.0
  - @unmap/core@0.4.0
  - @unmap/maps@0.4.0
  - @unmap/geocoding@0.4.0

## 0.3.0

### Patch Changes

- @unmap/core@0.3.0
- @unmap/maps@0.3.0
- @unmap/geocoding@0.3.0
- @unmap/routing@0.3.0

## 0.2.0

### Patch Changes

- @unmap/core@0.2.0
- @unmap/maps@0.2.0
- @unmap/geocoding@0.2.0
- @unmap/routing@0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".
- Updated dependencies [8853c50]
  - @unmap/core@0.1.3
  - @unmap/maps@0.1.3
  - @unmap/geocoding@0.1.3
  - @unmap/routing@0.1.3

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.
- Updated dependencies [300bb41]
  - @unmap/core@0.1.2
  - @unmap/maps@0.1.2
  - @unmap/geocoding@0.1.2
  - @unmap/routing@0.1.2

## 0.1.1

### Patch Changes

- @unmap/core@0.1.1
- @unmap/maps@0.1.1
- @unmap/geocoding@0.1.1
- @unmap/routing@0.1.1

## 0.1.0

### Minor Changes

- 93e99b5: Style options that shipped on the gateway on 2026-09-01 now reach the clients: `mode` (`light` |
  `dark`, overrides the mode half of `flavor`), `lang` (label language; omitted, the gateway follows
  `Accept-Language`), and `theme` (a `ut1.` code from unmap.dev/create, which wins over `flavor`).
  `styleUrl()` in core forwards all three; `createMap()`/`unmapStyle()` in maps and `new Unmap()` in
  the SDK accept them. `@unmap/maps` also exports `maplibregl` as the module object (so
  `maplibregl.Marker` works) and starts the compact attribution control collapsed.

### Patch Changes

- Updated dependencies [035ebdd]
- Updated dependencies [93e99b5]
  - @unmap/geocoding@0.1.0
  - @unmap/core@0.1.0
  - @unmap/maps@0.1.0
  - @unmap/routing@0.0.3

## 0.0.3

### Patch Changes

- Republish cascade: `@unmap/routing@0.0.1` and `@unmap/geocoding@0.0.1` were burned by an
  unpublish (npm permanently blocks reusing an unpublished version), so both move to `0.0.2` and
  the exact-pinned dependents ride one more patch to point at versions that exist.

## 0.0.2

### Patch Changes

- Rename `@unmap/geocoder` → `@unmap/geocoding` and `@unmap/router` → `@unmap/routing`. The SDK's
  dependencies move to the new names; the API surface is unchanged (`unmap.geocoder.*` and the
  exported `Geocoder`/`Router` classes keep their names). vue and nuxt ride along so the published
  graph stays coherent with the renamed set.
