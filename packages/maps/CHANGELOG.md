# @unmap/maps

## 0.21.0

### Patch Changes

- @unmap/core@0.21.0

## 0.20.0

### Minor Changes

- a1dfd17: Require `maplibre-gl` `^6.9.0` and stop loading the right-to-left text plugin. MapLibre 6.9 and later draw Arabic and Hebrew without it and deprecate `setRTLTextPlugin`, so `createMap` no longer calls it and `rtlPluginUrl` is removed from `@unmap/maps`. `unmap init` now prints `import { Map } from "maplibre-gl"`: MapLibre 6 has no default export, so the old `import maplibregl from "maplibre-gl"` snippet threw at load.

  The CDN browser bundle now publishes three files per version, not four: MapLibre 6.13's worker is self-contained and its `maplibre-gl-shared.mjs` is empty. Bundler users copy only `maplibre-gl-worker.mjs`.

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

### Minor Changes

- d15501c: Add Atlas and Swiss map styles in light and dark modes, including shareable style presets.

### Patch Changes

- @unmap/core@0.15.0

## 0.14.0

### Patch Changes

- 1c7c1a9: Document the worldwide default basemap and supported Protomaps label languages in the package guides.
- 897f993: Load MapLibre's RTL text plugin immediately so an English map can show Arabic names.
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

- 31fdec2: Add a `profile: "agriculture"` composition preset and the licensed `agriculture.*` overlay catalog.
- 31fdec2: Add an `overlays` option so style URLs can compose named Canadian catalog layers.
- 31fdec2: Add a `profile` composition preset so style URLs can expand the energy overlay set.
- ed99e21: Add Remote 0.2 airport overlay catalog and Mining 0.2 Land identify extra tables.
- 31fdec2: Add `profile: "remote"` and `profile: "mining"` composition presets with the smallest live overlay catalogs.

### Patch Changes

- 1d5e90e: Let `unmap add` install the energy and legal-land registry items, and share one MapProfile union that includes agriculture.
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

- a4a5b21: `projection` is now documented where the other options are: the `new Unmap(options)` table in both languages, and the `@unmap/maps`, `@unmap/sdk` and `@unmap/next` READMEs. It shipped with an examples page and no reference entry, so it was findable only by browsing.
  - @unmap/core@0.9.1

## 0.9.0

### Minor Changes

- 2b8f66a: New `projection` option: pass `"globe"` to draw the map as a sphere, or omit it (or pass `"mercator"`) for the flat map. It reaches `createMap`, `new Unmap`, `useUnmap` and `<Map>`, and the `Projection` type is exported alongside them. A city centre with no zoom still frames the city rather than the planet, so adding the option changes nothing until you ask for it. unmap tiles Canada, so at globe zooms the country sits on the sphere and everything outside the archive is empty.

### Patch Changes

- @unmap/core@0.9.0

## 0.8.0

### Minor Changes

- b536611: Maps now come with zoom and compass buttons. `createMap()` adds MapLibre's navigation control at `top-right` by default, so `new Unmap({ container })`, `useUnmap()`, `<Map>` and both registry lanes get one without asking. Pass `controls: false` for a bare canvas, or `controls: { position: "bottom-left" }` to move it. Existing maps gain the buttons on upgrade.
- 8a2d5a2: The `decimal` style is retired: it read as the same map as `blueprint`. `THEME_BASES` and `STYLE_NAMES` list eight styles. A theme document with `base: "decimal"`, the `flavor=decimal` URL forms and the `u03` preset code all resolve to `blueprint`, so nothing already printed breaks.
- 8b2c705: Seven new theme presets, each built to be unlike the others: `magma`, `neon`, `candy`, `ultraviolet`, `noir`, `sepia`, `ultramarine`. `THEME_PRESETS` is append-only, so every existing preset code keeps its meaning.
- 7008baa: Four new styles, sketched from CARTOColors: `tropic` (teal water, spring greens, cream land, coral highway), `sunset` (a warm duotone with indigo water), `bold` (the saturated street map) and `pastel`. `THEME_BASES` and `STYLE_NAMES` list twelve styles; the preset codes `u09` to `u0C` name them. Six new ramps ship with them: `linen`, `coral`, `peach`, `indigo`, `azure`, `amber`.

### Patch Changes

- Updated dependencies [8a2d5a2]
- Updated dependencies [8b2c705]
- Updated dependencies [7008baa]
  - @unmap/core@0.8.0

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

- @unmap/core@0.7.0

## 0.6.0

### Patch Changes

- @unmap/core@0.6.0

## 0.5.0

### Patch Changes

- @unmap/core@0.5.0

## 0.4.0

### Patch Changes

- A `center` with no `zoom` now frames a city (zoom 11) instead of the whole planet at MapLibre's default zoom 0.
- `createMap` accepts a CSS selector as `container` (`"#map"`) as well as an element id; MapLibre alone only resolves ids, so the obvious spelling threw "Container '#map' not found".

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

- 93e99b5: Style options that shipped on the gateway on 2026-09-01 now reach the clients: `mode` (`light` |
  `dark`, overrides the mode half of `flavor`), `lang` (label language; omitted, the gateway follows
  `Accept-Language`), and `theme` (a `ut1.` code from unmap.dev/create, which wins over `flavor`).
  `styleUrl()` in core forwards all three; `createMap()`/`unmapStyle()` in maps and `new Unmap()` in
  the SDK accept them. `@unmap/maps` also exports `maplibregl` as the module object (so
  `maplibregl.Marker` works) and starts the compact attribution control collapsed.

### Patch Changes

- Updated dependencies [93e99b5]
  - @unmap/core@0.1.0
