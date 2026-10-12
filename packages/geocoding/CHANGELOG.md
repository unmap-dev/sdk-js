# @unmap/geocoding

## 0.21.0

### Patch Changes

- @unmap/core@0.21.0

## 0.20.0

### Patch Changes

- @unmap/core@0.20.0

## 0.19.0

### Patch Changes

- @unmap/core@0.19.0

## 0.18.0

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
- 897f993: A coordinate outside Canada is `422` with code `outside_coverage`, and the geocoder or the road graph is not called. A Canadian request the graph cannot answer stays `no_route`, including Iqaluit to the mainland and open water inside Canada. A longitude or latitude outside WGS84 is `400` `bad_request` on geocoding and places, and `400` `invalid_location` on routing.
- Updated dependencies [5d65d3d]
  - @unmap/core@0.14.0

## 0.13.0

### Minor Changes

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

- @unmap/core@0.13.0

## 0.12.0

### Patch Changes

- @unmap/core@0.12.0

## 0.11.0

### Minor Changes

- 35145a6: Add `unmap geocode csv`: geocode a local CSV, with review output and resume.

  ```bash
  npx @unmap/cli geocode csv addresses.csv \
    --query-column address --output geocoded.csv --review-output review.csv
  ```

  The file stays on the machine; only the mapped column is sent. Ten `unmap_`-prefixed columns are
  appended to a copy, and every input row appears exactly once no matter what happened to it, so
  nothing is dropped quietly. `--review-output` writes the subset worth a human look: fallbacks,
  partial matches, near-ties, no-matches and failures.

  `--estimate` counts and validates the mapping with no network and no charge, and reports both
  the floor and the ceiling, because a retried row is billed per attempt. Ctrl-C checkpoints and
  `--resume` continues; the resume truncates the output to the last durably recorded byte first,
  so a crash cannot leave duplicated or missing rows. It does not claim exactly-once execution: a
  request in flight when the process died may have been served already.

  `@unmap/geocoding` gains the pieces both this and the hosted service will share: a streaming
  RFC 4180 CSV codec that handles BOMs, quoted newlines, mixed line endings and leading zeros, and
  the output schema and review rules (`classify`, `outputValues`, `resolveOutputHeader`).

- ed99e21: Add `unmap.data.query()` / `GET /data/query` for bbox lookups against identify-capable catalog layers.
- 31fdec2: Add a `profile` composition preset so style URLs can expand the energy overlay set.
- 31fdec2: Add `well` and `facility` geocoder layers and make energy catalog layers identify-capable.
- e881470: Geocode results now say where they came from and how well they match.

  Four additive fields on `GeocodeResult`: `source` and `source_id` (the dataset the returned
  record came from, and its id there), `match_type` (`exact` | `partial` | `fallback` |
  `unknown`), `precision` (`point` | `street` | `locality` | `region` | `unknown`), and
  `match_reasons`, a list of stable codes explaining a non-exact match. `address.unit` is
  surfaced where a source published one.

  The point is that a coarser answer can no longer pass for a precise one: a street or locality
  returned for a query that named a civic number is `fallback`, never `exact`, and carries
  `housenumber_not_matched`. `precision` is a separate axis from `match_type`, so a perfect
  locality-name match reads as exact _and_ locality-level rather than as an address.

  `score` is unchanged and still raw BM25 relevance. Nothing here is a confidence value, and
  `precision: "point"` is not a rooftop-accuracy claim.

- 6e364e6: Add `focus`, `layers` and `region` to search, autocomplete and structured search.

  `focus=lng,lat` is a soft proximity preference: it moves ranking toward the point over a ~25 km
  decay and excludes nothing, so a relevant result across the country still comes back behind the
  near ones. `layers` and `region` are hard filters, composed by intersection, and contradictory
  filters return no matches rather than quietly widening.

  `layers` extends the existing energy parameter rather than adding a second one. Civic values
  (`address`, `street`, `locality`, `region`, `poi`) filter within the civic corpus; `well` and
  `facility` still select the energy corpus. Mixing the two is a 400, and so is an unknown value —
  a tightening, since unrecognised tokens used to be dropped silently, so `layers=adress` searched
  everything and looked like it had worked.

  Also fixes `parseFocus` accepting a trailing comma: `Number("")` is 0, so `focus=-114,` would
  have parsed as a point in the Gulf of Guinea.

- bcb5354: Add structured geocoding: `geocoder.structured({ address, city, region, postalcode })`, backed
  by `GET /geocode/structured`.

  Components stay components. `address` and `city` retrieve and rank; `region` and `postalcode`
  constrain, under one rule — a supplied component excludes records that contradict it and never
  excludes records that are silent about it, so a row with no postal code survives a postal-code
  query and reports `postalcode_not_verified`. `country` is validated rather than matched.

  This is what a free-text query cannot do: in "Kelowna, BC" the `BC` is just a token, free to
  score the province's own row. Here it can only narrow.

  Also exports the province table the two sides share: `parseRegion`, `regionForms`,
  `REGION_CODES`, `REGIONS`.

- 31fdec2: Add `identify()` for point-in-polygon lookups against Canadian catalog layers.
- 31fdec2: Add `legal_land` as a geocoder layer with structured survey fields, optional bbox, and optional geometry.
- 8c39407: Add ParcelMap BC identify (`survey.parcels`) and PID search (`parcel`).
- 8c39407: Rename the BC parcel layer to `survey.parcels` and its search layer to `parcel`. It is the whole ParcelMap BC cadastral fabric, not farmland, so it is gated by `legal-land` rather than `agriculture`. `parseFarmParcel` / `looksLikeFarmParcel` become `parseParcel` / `looksLikeParcel`.
- ab0ac6e: Add `parseRuralRoute` / `looksLikeRuralRoute` for Canada Post delivery terms (`RR`, `SS`, `MR`, `GD`, `SITE`, `COMP`, `BOX`, `STN`). The gateway strips them before civic search, so `RR 1 Site 5 Comp 12 Millarville` now resolves to Millarville.

### Patch Changes

- e3e7a9a: Documentation only: two task pages and the error codes the hosted batch API added.

  `Build an address autocomplete` covers the two things every hand-rolled autocomplete gets wrong,
  which produce the same symptom: debouncing, and dropping responses you no longer want, with a
  generation counter behind the abort because a cancel that loses the race still has to be ignored.
  It also says plainly that cancelling does not un-bill the request.

  `Build a store locator` is the job the existing nearest-location page is not: your own list of
  locations rather than the public corpus, geocoded once with structured search and checked against
  `match_type` before the pins are trusted, then shortlisted by straight line and ranked by drive
  time. It quotes what a visit actually costs, because the mistake is geocoding your own branches
  on every page load.

  The errors page gains `conflict`, `payload_too_large` and `plan_required`, and a section naming
  the response headers cross-origin JavaScript can actually read, since a `Retry-After` your code
  cannot see is one your retry logic does not have.

- b2159a0: Documentation only: the hosted batch geocoding flow is now in the dashboard at
  `/dashboard/batch`, alongside the local `unmap geocode csv` command. The two produce the same
  file with the same columns in the same order, so a job can move between them without anything
  downstream noticing. The docs page says where they differ: the hosted service needs a paid plan,
  never bills a retry, and stores the file for seven days, while the CLI bills each attempt and
  never sends the file at all.
- 31fdec2: Split identify layers into land vs energy so the gateway can fan out across domain containers.
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

### Patch Changes

- `GeocoderError.message` now carries the gateway's reason ("q required", "invalid or disabled API key") instead of only the status, and a new `code` property exposes the machine-readable error code when the response has one.

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

## 0.1.0

### Minor Changes

- 035ebdd: `nearby()`: category search against the new `/geocode/nearby` endpoint — POIs by taxonomy id or bilingual alias (`pharmacy` / `pharmacie`), sorted by distance. `GeocodeResult` gains optional `category` and `distance`. Do not publish until the categorized corpus is live (see docs/superpowers/plans/2026-09-01-geocoder-category-search.md, Task 9).

### Patch Changes

- Updated dependencies [93e99b5]
  - @unmap/core@0.1.0
