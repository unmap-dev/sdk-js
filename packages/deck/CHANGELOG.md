# @unmap/deck

## 0.33.0

### Minor Changes

- ae11bf3: `showTrees(map)` draws the basemap's woods as low-poly 3D conifers standing on the terrain, from zoom 13.5 in, near the camera, with water and buildings cut out and strips cleared along roads, railways, rivers and the `ski` overlay's runs and lifts (`SKI_TREE_CLEARANCE`, or your own lines through `clear`). It fetches nothing: trees are placed from the vector tiles the map has loaded, at heights read from the terrain it draws, and share the map's one deck.gl overlay with any 3D lifts. Placement is seeded by position, so the same woods look the same on every visit. Also exports `TREES_MIN_ZOOM`.

### Patch Changes

- @unmap/core@0.33.0

## 0.32.2

### Patch Changes

- 2145758: `createDeckOverlay` can be called more than once on the same map. deck.gl allows a single interleaved overlay per map and threw on a second one; now every handle draws through the same `MapLibreOverlay`, each owning its own layers, and the overlay comes off the map with the last handle. Winter's 3D trees and 3D lifts draw together this way.
  - @unmap/core@0.32.2

## 0.32.1

### Patch Changes

- @unmap/core@0.32.1

## 0.32.0

### Patch Changes

- @unmap/core@0.32.0

## 0.31.1

### Patch Changes

- @unmap/core@0.31.1

## 0.31.0

### Patch Changes

- @unmap/core@0.31.0

## 0.30.0

### Patch Changes

- @unmap/core@0.30.0

## 0.29.0

### Patch Changes

- @unmap/core@0.29.0

## 0.28.0

### Patch Changes

- @unmap/core@0.28.0

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
