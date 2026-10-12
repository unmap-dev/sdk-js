# @unmap/core

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

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

## 0.13.0

## 0.12.0

## 0.11.0

### Minor Changes

- 31fdec2: Add a `profile: "agriculture"` composition preset and the licensed `agriculture.*` overlay catalog.
- 31fdec2: Add an `overlays` option so style URLs can compose named Canadian catalog layers.
- 31fdec2: Add a `profile` composition preset so style URLs can expand the energy overlay set.
- ed99e21: Add Remote 0.2 airport overlay catalog and Mining 0.2 Land identify extra tables.
- 31fdec2: Add `profile: "remote"` and `profile: "mining"` composition presets with the smallest live overlay catalogs.

### Patch Changes

- 1d5e90e: Let `unmap add` install the energy and legal-land registry items, and share one MapProfile union that includes agriculture.

## 0.10.0

## 0.9.1

## 0.9.0

## 0.8.0

### Minor Changes

- 8a2d5a2: The `decimal` style is retired: it read as the same map as `blueprint`. `THEME_BASES` and `STYLE_NAMES` list eight styles. A theme document with `base: "decimal"`, the `flavor=decimal` URL forms and the `u03` preset code all resolve to `blueprint`, so nothing already printed breaks.
- 8b2c705: Seven new theme presets, each built to be unlike the others: `magma`, `neon`, `candy`, `ultraviolet`, `noir`, `sepia`, `ultramarine`. `THEME_PRESETS` is append-only, so every existing preset code keeps its meaning.
- 7008baa: Four new styles, sketched from CARTOColors: `tropic` (teal water, spring greens, cream land, coral highway), `sunset` (a warm duotone with indigo water), `bold` (the saturated street map) and `pastel`. `THEME_BASES` and `STYLE_NAMES` list twelve styles; the preset codes `u09` to `u0C` name them. Six new ramps ship with them: `linen`, `coral`, `peach`, `indigo`, `azure`, `amber`.

## 0.7.0

## 0.6.0

## 0.5.0

## 0.4.0

## 0.3.0

## 0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.

## 0.1.1

## 0.1.0

### Minor Changes

- 93e99b5: Style options that shipped on the gateway on 2026-09-01 now reach the clients: `mode` (`light` |
  `dark`, overrides the mode half of `flavor`), `lang` (label language; omitted, the gateway follows
  `Accept-Language`), and `theme` (a `ut1.` code from unmap.dev/create, which wins over `flavor`).
  `styleUrl()` in core forwards all three; `createMap()`/`unmapStyle()` in maps and `new Unmap()` in
  the SDK accept them. `@unmap/maps` also exports `maplibregl` as the module object (so
  `maplibregl.Marker` works) and starts the compact attribution control collapsed.
