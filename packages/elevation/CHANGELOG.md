# @unmap/elevation

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

- aabbb85: Support the global Mapterhorn elevation response metadata while preserving the ordered array returned by `elevation.get()`. The global DEM mixes terrain/surface models, native resolutions and vertical datums; direct HTTP clients must accept `datum: "mixed"`, `resolution: null` and sampling metadata. Canadian rollback keeps its MRDEM contract. Check `/coverage.json` for the active release.
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

### Patch Changes

- 897f993: A `502` does not carry `Retry-After`. Routing uses `routing_failed`. `/elevation` uses `upstream_error` with `elevation sample failed` when a terrain tile will not decode, and `not_found` with `terrain archive not configured` when the archive is absent. The client still retries a `502`, on its own backoff.
- Updated dependencies [5d65d3d]
  - @unmap/core@0.14.0

## 0.13.0

### Patch Changes

- @unmap/core@0.13.0

## 0.12.0

### Patch Changes

- @unmap/core@0.12.0

## 0.11.0

### Minor Changes

- 4d05f16: Add `unmap.elevation.get()` and the standalone `@unmap/elevation` client: ground elevation anywhere in Canada from NRCan's national 30 m DEM, in metres above CGVD2013. One coordinate or up to a thousand per call. `null` means the dataset covers nothing there and never means sea level.

### Patch Changes

- Updated dependencies [31fdec2]
- Updated dependencies [1d5e90e]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [ed99e21]
- Updated dependencies [31fdec2]
  - @unmap/core@0.11.0
