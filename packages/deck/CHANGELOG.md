# @unmap/deck

## 0.27.0

### Patch Changes

- @unmap/core@0.27.0

## 0.26.0

### Patch Changes

- @unmap/core@0.26.0

## 0.25.1

### Patch Changes

- @unmap/core@0.25.1

## 0.25.0

### Patch Changes

- @unmap/core@0.25.0

## 0.24.0

### Minor Changes

- bd414cc: `@unmap/deck`, a new optional package of deck.gl layers for unmap maps. `createDeckOverlay` adds a deck.gl overlay that draws inside MapLibre's own WebGL context (interleaved mode), and `deckMapOptions` turns on the antialiasing the overlay needs. `liftCablesLayer` and `liftModelsLayer` draw an area's 3D ski lifts at heights the pipeline baked from the style's terrain release, scaled by the terrain exaggeration (`bakedZ`). `fetchLifts3d` reads `GET /ski/areas/{id}/lifts-3d`, which needs the `ski` add-on. deck.gl 9.4 is a peer dependency, and `@unmap/maps` does not import this package, so a plain map does not load deck.gl.

### Patch Changes

- @unmap/core@0.24.0
