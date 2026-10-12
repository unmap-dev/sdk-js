# @unmap/next

## 0.21.0

### Patch Changes

- Updated dependencies [0870187]
- Updated dependencies [1769bd2]
  - @unmap/sdk@0.21.0
  - @unmap/react@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [a1dfd17]
  - @unmap/sdk@0.20.0
  - @unmap/react@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [57c38b5]
- Updated dependencies [fd42c13]
  - @unmap/sdk@0.19.0
  - @unmap/react@0.19.0

## 0.18.0

### Patch Changes

- @unmap/sdk@0.18.0
- @unmap/react@0.18.0

## 0.17.0

### Minor Changes

- 1dab6bc: Breaking. `style` is the one option that names a map style: `flavor` is removed from `createMap`, `new Unmap()`, `useUnmap()` and `<Map>`, and a string that is neither a style name nor a URL is passed through unchanged. `router.isochrone`, `geocoder.reverse` and `elevation.get` send `near=lng,lat` (`POST /isochrone` sends `near`), and the React and Vue `useDirections` isochrone call names its point `near`. `parseIdentifyAt(at)` takes one argument. In `@unmap/themes`, `validateTheme` refuses retired style names, the `u03` preset code no longer decodes, and `isThemeBase` replaces `normalizeThemeBase`. `@unmap/sdk`'s coverage types read freshness and provenance from `provenance` and `freshness_status`, `freshness_basis` is `{ en, fr }`, and document-level `jurisdictions` is `string[]`.

### Patch Changes

- Updated dependencies [1dab6bc]
  - @unmap/sdk@0.17.0
  - @unmap/react@0.17.0

## 0.16.0

### Patch Changes

- @unmap/sdk@0.16.0
- @unmap/react@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [9ffd903]
  - @unmap/sdk@0.15.0
  - @unmap/react@0.15.0

## 0.14.0

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
  - @unmap/react@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [81b19d9]
- Updated dependencies [96c496a]
- Updated dependencies [ac02791]
  - @unmap/sdk@0.13.0
  - @unmap/react@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [deb5c6d]
  - @unmap/sdk@0.12.0
  - @unmap/react@0.12.0

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
  - @unmap/react@0.11.0

## 0.10.0

### Patch Changes

- @unmap/sdk@0.10.0
- @unmap/react@0.10.0

## 0.9.1

### Patch Changes

- @unmap/sdk@0.9.1
- @unmap/react@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [2b8f66a]
  - @unmap/sdk@0.9.0
  - @unmap/react@0.9.0

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
  - @unmap/react@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [c35cde7]
  - @unmap/sdk@0.7.0
  - @unmap/react@0.7.0

## 0.6.0

### Patch Changes

- @unmap/sdk@0.6.0
- @unmap/react@0.6.0

## 0.5.0

### Patch Changes

- @unmap/sdk@0.5.0
- @unmap/react@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [7179c7d]
  - @unmap/sdk@0.4.0
  - @unmap/react@0.4.0

## 0.3.0

### Patch Changes

- @unmap/sdk@0.3.0
- @unmap/react@0.3.0

## 0.2.0

### Patch Changes

- @unmap/sdk@0.2.0
- @unmap/react@0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".
- Updated dependencies [8853c50]
  - @unmap/sdk@0.1.3
  - @unmap/react@0.1.3

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.
- Updated dependencies [300bb41]
  - @unmap/sdk@0.1.2
  - @unmap/react@0.1.2

## 0.1.1

### Patch Changes

- 9ceb72b: New packages: `@unmap/react` (`useUnmap`, `useGeocoder`, `useDirections` hooks over the SDK,
  plus `UnmapProvider` so the key is set once) and `@unmap/next` (a `"use client"` `<Map>`
  component a Next.js App Router Server Component page can render directly, re-exporting the
  hooks). Same three-hook surface as `@unmap/vue`, with `key` spelled `apiKey`.
- Updated dependencies [9ceb72b]
  - @unmap/react@0.1.1
  - @unmap/sdk@0.1.1
