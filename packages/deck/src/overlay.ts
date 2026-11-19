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
  /** Replace this handle's layers. Keep layer ids stable so deck.gl diffs rather than rebuilds. */
  setLayers(layers: LayersList): void;
  /**
   * Take this handle's layers off the map; the last handle on a map also takes the overlay off and
   * releases its GPU resources. Safe to call twice.
   */
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

/** The one deck.gl overlay a map holds, and the handles drawing through it, oldest first. */
interface SharedOverlay {
  overlay: MapLibreOverlay;
  handles: Array<{ layers: LayersList }>;
  /** True while an idle listener is waiting to re-apply the layers. */
  waiting: boolean;
}

// deck.gl allows one interleaved overlay per map (`MapLibreOverlay supports one interleaved
// overlay per map`), so every handle on a map draws through the same one.
const shared = new WeakMap<object, SharedOverlay>();

/**
 * Add a deck.gl overlay to a MapLibre map, interleaved: deck.gl draws into MapLibre's own WebGL
 * context and layer stack (one context, depth shared with the terrain), never a second canvas.
 *
 * Call it as often as you like on one map: deck.gl allows a single interleaved overlay per map,
 * so every handle draws through the same `MapLibreOverlay`, each owning its own layers (drawn in
 * the order the handles were created). Keep layer ids unique across handles. Props other than
 * `layers` are shared by every handle; the last given wins. The overlay comes off the map with its
 * last handle.
 *
 * Create the map with `deckMapOptions` for smooth cables; antialiasing cannot be switched on after
 * the map exists, so this warns once per map when it is off.
 *
 *   const deck = createDeckOverlay(map, { layers: [liftCablesLayer(lifts)] });
 *   deck.setLayers([...]);
 *   deck.remove();
 */
export function createDeckOverlay(map: DeckOverlayMap, opts: DeckOverlayOptions = {}): DeckOverlay {
  return openOverlay(map, opts, true);
}

/**
 * `createDeckOverlay`, with the antialiasing warning optional: 3D trees draw through the same
 * overlay but have no lines to roughen, so they need no antialiased map and do not warn.
 */
export function openOverlay(map: DeckOverlayMap, opts: DeckOverlayOptions, warnWithoutAntialias: boolean): DeckOverlay {
  if (warnWithoutAntialias && antialiased(map) === false && !warned.has(map)) {
    warned.add(map);
    console.warn(
      "@unmap/deck: this map was created without antialiasing, so deck.gl lines will draw with hard " +
        "edges. Create it with `maplibre: deckMapOptions` (createMap) or spread `deckMapOptions` into " +
        "the MapLibre Map options.",
    );
  }
  const { layers: initial = [], ...props } = opts;
  const handle = { layers: initial };
  let group = shared.get(map);
  const all = (g: SharedOverlay): LayersList => g.handles.flatMap((h) => [...h.layers]);
  // @deck.gl/maplibre adds interleaved layers to the map only while `map.isStyleLoaded()`, which is
  // false while any tile is still loading, and retries only on `styledata`. Layers set during a
  // camera flight would otherwise never be drawn, so they are applied again once the map is idle.
  const reapplyWhenIdle = (g: SharedOverlay) => {
    if (g.waiting || map.isStyleLoaded()) return;
    g.waiting = true;
    map.once("idle", () => {
      g.waiting = false;
      if (shared.get(map) === g) g.overlay.setProps({ layers: all(g) });
    });
  };
  if (!group) {
    group = { overlay: new MapLibreOverlay({ ...props, layers: initial, interleaved: true }), handles: [handle], waiting: false };
    shared.set(map, group);
    map.addControl(group.overlay);
  } else {
    group.handles.push(handle);
    group.overlay.setProps({ ...props, layers: all(group) });
  }
  const g = group;
  reapplyWhenIdle(g);
  let removed = false;
  return {
    overlay: g.overlay,
    setLayers(next) {
      if (removed) return;
      handle.layers = next;
      g.overlay.setProps({ layers: all(g) });
      reapplyWhenIdle(g);
    },
    remove() {
      if (removed) return;
      removed = true;
      g.handles.splice(g.handles.indexOf(handle), 1);
      if (g.handles.length > 0) {
        g.overlay.setProps({ layers: all(g) });
        return;
      }
      shared.delete(map);
      map.removeControl(g.overlay);
    },
  };
}
