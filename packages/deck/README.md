# @unmap/deck

deck.gl layers for unmap maps: 3D ski lifts on MapLibre terrain, drawn in MapLibre's own WebGL
context (deck.gl interleaved mode).

```sh
npm i @unmap/deck @unmap/maps maplibre-gl @deck.gl/core @deck.gl/layers @deck.gl/mesh-layers @deck.gl/maplibre @luma.gl/core
```

```ts
import { createMap } from "@unmap/maps";
import { createDeckOverlay, deckMapOptions, fetchLifts3d, liftCablesLayer } from "@unmap/deck";

const key = "um_live_...";
const map = createMap({ key, container: "#map", style: "winter", terrain: true, maplibre: deckMapOptions });
map.on("load", async () => {
  const lifts = await fetchLifts3d({ key, areaId: "osm-way-123" });
  const exaggeration = map.getTerrain()?.exaggeration ?? 1;
  createDeckOverlay(map, { layers: [liftCablesLayer(lifts, { exaggeration })] });
});
```

## What it exports

- `createDeckOverlay(map, opts?)` adds an interleaved `MapLibreOverlay` and returns
  `{ overlay, setLayers(layers), remove() }`. It is always interleaved: one WebGL context, with
  depth shared with the terrain.
- `deckMapOptions` is `{ canvasContextAttributes: { antialias: true } }`. MapLibre creates its
  context with antialiasing off, which gives cables hard edges, and the setting can only be
  chosen when the map is created. Pass it as `createMap`'s `maplibre` option.
  `createDeckOverlay` warns once per map when it is missing.
- `liftCablesLayer(lifts, opts?)` is a `PathLayer` of each lift's cable at its baked height,
  coloured by `aerialway` (`LIFT_COLORS`, overridable with `colors`). Width is 2 px by
  default; pass `width` and `widthUnits: "meters"` for real size.
- `liftModelsLayer(lifts, { models })` returns one `ScenegraphLayer` per kind (`pylon`,
  `station`) that has a glTF URL in `models`. Each model is placed at a tower or station and
  turned to face along the line. No models ship with this package. glTF models are Y-up: they
  are rolled 90° onto deck.gl's Z-up axis and yawed by `-bearing`. If a model faces another way,
  correct it with `yawOffset`. `liftModelInstances(lifts)` returns the same placements as plain
  data.
- `fetchLifts3d({ key, areaId, gateway?, fetch?, signal? })` calls
  `GET /ski/areas/{id}/lifts-3d` and returns the typed `Lifts3dDocument`. It throws
  `Lifts3dError` (an `UnmapError`) when the response is not 2xx, for example `403` with
  `addon_required` when the key has no ski add-on. It also throws, with code
  `schema_mismatch`, when the body is not an `unmap.ski-lifts-3d.v1` document. The key goes
  in the gateway URL only.
- `bakedZ(point, exaggeration = 1)` gives the height to draw a baked point at.

## Heights and terrain exaggeration

deck.gl layers do not drape on MapLibre terrain. Every z comes from the lifts file: metres
above sea level, sampled from `terrain_release`, the same terrain release the style's
`terrain=on` draws. Nothing is queried at render time.

MapLibre draws terrain at the DEM height times `exaggeration`, measured from sea level. A
baked z has to be multiplied by the same factor to stay on that terrain. So every layer takes
`exaggeration`, with a default of 1. Read it from the map with
`map.getTerrain()?.exaggeration ?? 1`. Rebuild the layers if it changes. Layer ids stay the
same, so deck.gl updates the layers in place.

The file stores one z per point, not ground height plus height above ground. So the part above
the ground is scaled too. At 1.5×, a tower's foot stays on the ground, but the tower draws
1.5 times as tall. At 1× the heights are exact.

## Bundle cost

`@unmap/maps` never imports this package, so a plain map does not load deck.gl. deck.gl is
a peer dependency (`~9.4.0`) and is never bundled. `fetchLifts3d`, `bakedZ` and
`deckMapOptions` import no renderer at runtime, and the package is `sideEffects: false`.
Load the layers with a dynamic `import("@unmap/deck")` when the user turns 3D on.

The lift data needs the `ski` add-on. The renderers are free.
