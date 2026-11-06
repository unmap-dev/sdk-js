import { MapLibreOverlay, type MapLibreOverlayProps } from "@deck.gl/maplibre";
import type { LayersList } from "@deck.gl/core";
import type { Map as MaplibreMap } from "maplibre-gl";

/** The map `createDeckOverlay` takes: a MapLibre `Map`, such as `createMap` returns. */
export type DeckOverlayMap = MaplibreMap;

/** Overlay props, less `interleaved`: this package always shares MapLibre's WebGL context. */
export type DeckOverlayOptions = Omit<MapLibreOverlayProps, "interleaved">;

export interface DeckOverlay {
  /** The underlying `MapLibreOverlay`, for picking (`pickObject`) or any other deck.gl prop. */
  readonly overlay: MapLibreOverlay;
  /** Replace the drawn layers. Keep layer ids stable so deck.gl diffs rather than rebuilds. */
  setLayers(layers: LayersList): void;
  /** Take the overlay off the map and release its GPU resources. Safe to call twice. */
  remove(): void;
}

const warned = new WeakSet<object>();

/**
 * Whether the map's WebGL context was created with antialiasing. `undefined` when it cannot be
 * told (no WebGL2 context yet). Reads the context the map already made: `getContext` with the
 * same type returns the existing one and never creates a second.
 */
function antialiased(map: DeckOverlayMap): boolean | undefined {
  const gl = map.getCanvas().getContext("webgl2");
  return gl?.getContextAttributes()?.antialias;
}

/**
 * Add a deck.gl overlay to a MapLibre map, interleaved: deck.gl draws into MapLibre's own WebGL
 * context and layer stack (one context, depth shared with the terrain), never a second canvas.
 *
 * Create the map with `deckMapOptions` for smooth cables; antialiasing cannot be switched on after
 * the map exists, so this warns once per map when it is off.
 *
 *   const deck = createDeckOverlay(map, { layers: [liftCablesLayer(lifts)] });
 *   deck.setLayers([...]);
 *   deck.remove();
 */
export function createDeckOverlay(map: DeckOverlayMap, opts: DeckOverlayOptions = {}): DeckOverlay {
  if (antialiased(map) === false && !warned.has(map)) {
    warned.add(map);
    console.warn(
      "@unmap/deck: this map was created without antialiasing, so deck.gl lines will draw with hard " +
        "edges. Create it with `maplibre: deckMapOptions` (createMap) or spread `deckMapOptions` into " +
        "the MapLibre Map options.",
    );
  }
  const overlay = new MapLibreOverlay({ ...opts, interleaved: true });
  map.addControl(overlay);
  let removed = false;
  let layers: LayersList = opts.layers ?? [];
  // @deck.gl/maplibre adds interleaved layers to the map only while `map.isStyleLoaded()`, which is
  // false while any tile is still loading, and retries only on `styledata`. Layers set during a
  // camera flight would otherwise never be drawn, so they are applied again once the map is idle.
  const reapplyWhenIdle = () => {
    if (removed || map.isStyleLoaded()) return;
    map.once("idle", () => {
      if (!removed) overlay.setProps({ layers });
    });
  };
  reapplyWhenIdle();
  return {
    overlay,
    setLayers(next) {
      layers = next;
      overlay.setProps({ layers });
      reapplyWhenIdle();
    },
    remove() {
      if (removed) return;
      removed = true;
      map.removeControl(overlay);
    },
  };
}
