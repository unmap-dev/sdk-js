# @unmap/vue

## 0.21.0

### Patch Changes

- Updated dependencies [0870187]
- Updated dependencies [1769bd2]
  - @unmap/sdk@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [a1dfd17]
  - @unmap/sdk@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [57c38b5]
- Updated dependencies [fd42c13]
  - @unmap/sdk@0.19.0

## 0.18.0

### Patch Changes

- @unmap/sdk@0.18.0

## 0.17.0

### Minor Changes

- 1dab6bc: Breaking. `style` is the one option that names a map style: `flavor` is removed from `createMap`, `new Unmap()`, `useUnmap()` and `<Map>`, and a string that is neither a style name nor a URL is passed through unchanged. `router.isochrone`, `geocoder.reverse` and `elevation.get` send `near=lng,lat` (`POST /isochrone` sends `near`), and the React and Vue `useDirections` isochrone call names its point `near`. `parseIdentifyAt(at)` takes one argument. In `@unmap/themes`, `validateTheme` refuses retired style names, the `u03` preset code no longer decodes, and `isThemeBase` replaces `normalizeThemeBase`. `@unmap/sdk`'s coverage types read freshness and provenance from `provenance` and `freshness_status`, `freshness_basis` is `{ en, fr }`, and document-level `jurisdictions` is `string[]`.

### Patch Changes

- Updated dependencies [1dab6bc]
  - @unmap/sdk@0.17.0

## 0.16.0

### Patch Changes

- @unmap/sdk@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [9ffd903]
  - @unmap/sdk@0.15.0

## 0.14.0

### Minor Changes

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

- Updated dependencies [897f993]
- Updated dependencies [1c7c1a9]
- Updated dependencies [f192c3e]
- Updated dependencies [31b115a]
- Updated dependencies [5d65d3d]
- Updated dependencies [b2e8d53]
- Updated dependencies [2ba39a6]
- Updated dependencies [891b39a]
- Updated dependencies [82496de]
- Updated dependencies [f0f6236]
  - @unmap/sdk@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [81b19d9]
- Updated dependencies [96c496a]
- Updated dependencies [ac02791]
  - @unmap/sdk@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [deb5c6d]
  - @unmap/sdk@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [3c0d374]
- Updated dependencies [31fdec2]
- Updated dependencies [1d5e90e]
- Updated dependencies [31fdec2]
- Updated dependencies [ed99e21]
- Updated dependencies [4d05f16]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [8c39407]
- Updated dependencies [8c39407]
- Updated dependencies [ed99e21]
- Updated dependencies [31fdec2]
- Updated dependencies [ed99e21]
- Updated dependencies [5c788c1]
- Updated dependencies [ab0ac6e]
  - @unmap/sdk@0.11.0

## 0.10.0

### Patch Changes

- @unmap/sdk@0.10.0

## 0.9.1

### Patch Changes

- @unmap/sdk@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [2b8f66a]
  - @unmap/sdk@0.9.0

## 0.8.0

### Minor Changes

- 8a2d5a2: The `decimal` style is retired: it read as the same map as `blueprint`. `THEME_BASES` and `STYLE_NAMES` list eight styles. A theme document with `base: "decimal"`, the `flavor=decimal` URL forms and the `u03` preset code all resolve to `blueprint`, so nothing already printed breaks.
- 8b2c705: Seven new theme presets, each built to be unlike the others: `magma`, `neon`, `candy`, `ultraviolet`, `noir`, `sepia`, `ultramarine`. `THEME_PRESETS` is append-only, so every existing preset code keeps its meaning.
- 7008baa: Four new styles, sketched from CARTOColors: `tropic` (teal water, spring greens, cream land, coral highway), `sunset` (a warm duotone with indigo water), `bold` (the saturated street map) and `pastel`. `THEME_BASES` and `STYLE_NAMES` list twelve styles; the preset codes `u09` to `u0C` name them. Six new ramps ship with them: `linen`, `coral`, `peach`, `indigo`, `azure`, `amber`.

### Patch Changes

- Updated dependencies [b536611]
- Updated dependencies [8a2d5a2]
- Updated dependencies [8b2c705]
- Updated dependencies [7008baa]
  - @unmap/sdk@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [c35cde7]
  - @unmap/sdk@0.7.0

## 0.6.0

### Patch Changes

- @unmap/sdk@0.6.0

## 0.5.0

### Patch Changes

- @unmap/sdk@0.5.0

## 0.4.0

### Minor Changes

- 7179c7d: Add `mode: "car"` (the same driving profile as `auto`, under a name that does not read as
  "automatic") and `mode: "truck"` with a typed `TruckProfile` (`height`, `width`, `length`, `weight`,
  `axleLoad`, `axleCount`, `hazmat`, `useTruckRoute`) on `route()` and `isochrone()`, and export
  `RouteOptions`. The gateway now rejects an unknown `mode` with a 400 instead of silently
  routing as a car.

### Patch Changes

- Updated dependencies [7179c7d]
  - @unmap/sdk@0.4.0

## 0.3.0

### Patch Changes

- @unmap/sdk@0.3.0

## 0.2.0

### Patch Changes

- @unmap/sdk@0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".
- Updated dependencies [8853c50]
  - @unmap/sdk@0.1.3

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.
- Updated dependencies [300bb41]
  - @unmap/sdk@0.1.2

## 0.1.1

### Patch Changes

- @unmap/sdk@0.1.1

## 0.1.0

### Minor Changes

- 091c561: `useGeocoder()` gains `nearby(category, opts)`, the category-search wrapper that
  `@unmap/geocoding` 0.1.0 added, sharing the same `results` / `loading` / `error` refs as
  `search`, `autocomplete` and `reverse`.

## 0.0.4

### Patch Changes

- Updated dependencies [93e99b5]
  - @unmap/sdk@0.1.0

## 0.0.3

### Patch Changes

- Republish cascade: `@unmap/routing@0.0.1` and `@unmap/geocoding@0.0.1` were burned by an
  unpublish (npm permanently blocks reusing an unpublished version), so both move to `0.0.2` and
  the exact-pinned dependents ride one more patch to point at versions that exist.
- Updated dependencies
  - @unmap/sdk@0.0.3

## 0.0.2

### Patch Changes

- Rename `@unmap/geocoder` → `@unmap/geocoding` and `@unmap/router` → `@unmap/routing`. The SDK's
  dependencies move to the new names; the API surface is unchanged (`unmap.geocoder.*` and the
  exported `Geocoder`/`Router` classes keep their names). vue and nuxt ride along so the published
  graph stays coherent with the renamed set.
- Updated dependencies
  - @unmap/sdk@0.0.2
