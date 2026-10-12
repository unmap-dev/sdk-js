# @unmap/nuxt

## 0.21.0

### Patch Changes

- @unmap/vue@0.21.0
- @unmap/core@0.21.0

## 0.20.0

### Patch Changes

- @unmap/vue@0.20.0
- @unmap/core@0.20.0

## 0.19.0

### Patch Changes

- @unmap/vue@0.19.0
- @unmap/core@0.19.0

## 0.18.0

### Patch Changes

- @unmap/vue@0.18.0
- @unmap/core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [1dab6bc]
  - @unmap/vue@0.17.0
  - @unmap/core@0.17.0

## 0.16.0

### Patch Changes

- @unmap/core@0.16.0
- @unmap/vue@0.16.0

## 0.15.0

### Patch Changes

- @unmap/vue@0.15.0
- @unmap/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [5d65d3d]
- Updated dependencies [f0f6236]
  - @unmap/core@0.14.0
  - @unmap/vue@0.14.0

## 0.13.0

### Patch Changes

- @unmap/vue@0.13.0
- @unmap/core@0.13.0

## 0.12.0

### Patch Changes

- @unmap/vue@0.12.0
- @unmap/core@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [31fdec2]
- Updated dependencies [1d5e90e]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [ed99e21]
- Updated dependencies [31fdec2]
  - @unmap/core@0.11.0
  - @unmap/vue@0.11.0

## 0.10.0

### Patch Changes

- @unmap/core@0.10.0
- @unmap/vue@0.10.0

## 0.9.1

### Patch Changes

- @unmap/vue@0.9.1
- @unmap/core@0.9.1

## 0.9.0

### Patch Changes

- @unmap/vue@0.9.0
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
  - @unmap/vue@0.8.0

## 0.7.0

### Patch Changes

- @unmap/vue@0.7.0
- @unmap/core@0.7.0

## 0.6.0

### Patch Changes

- @unmap/core@0.6.0
- @unmap/vue@0.6.0

## 0.5.0

### Patch Changes

- @unmap/core@0.5.0
- @unmap/vue@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [7179c7d]
  - @unmap/vue@0.4.0
  - @unmap/core@0.4.0

## 0.3.0

### Patch Changes

- @unmap/core@0.3.0
- @unmap/vue@0.3.0

## 0.2.0

### Patch Changes

- @unmap/core@0.2.0
- @unmap/vue@0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".
- Updated dependencies [8853c50]
  - @unmap/core@0.1.3
  - @unmap/vue@0.1.3

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.
- Updated dependencies [300bb41]
  - @unmap/core@0.1.2
  - @unmap/vue@0.1.2

## 0.1.1

### Patch Changes

- @unmap/core@0.1.1
- @unmap/vue@0.1.1

## 0.0.5

### Patch Changes

- Updated dependencies [091c561]
  - @unmap/vue@0.1.0

## 0.0.4

### Patch Changes

- Updated dependencies [93e99b5]
  - @unmap/core@0.1.0
  - @unmap/vue@0.0.4

## 0.0.3

### Patch Changes

- Republish cascade: `@unmap/routing@0.0.1` and `@unmap/geocoding@0.0.1` were burned by an
  unpublish (npm permanently blocks reusing an unpublished version), so both move to `0.0.2` and
  the exact-pinned dependents ride one more patch to point at versions that exist.
- Updated dependencies
  - @unmap/vue@0.0.3

## 0.0.2

### Patch Changes

- Rename `@unmap/geocoder` → `@unmap/geocoding` and `@unmap/router` → `@unmap/routing`. The SDK's
  dependencies move to the new names; the API surface is unchanged (`unmap.geocoder.*` and the
  exported `Geocoder`/`Router` classes keep their names). vue and nuxt ride along so the published
  graph stays coherent with the renamed set.
- Updated dependencies
  - @unmap/vue@0.0.2
