/**
 * @unmap/deck: deck.gl layers for unmap maps, interleaved in MapLibre's WebGL context.
 *
 * Optional and separate from @unmap/maps, so a plain map never loads deck.gl. `fetchLifts3d`,
 * `bakedZ` and `deckMapOptions` import no renderer, and the package is `sideEffects: false`, so a
 * bundler drops deck.gl from a chunk that uses only them; load the layers with a dynamic
 * `import("@unmap/deck")` when the user turns 3D on.
 */
export type { Lift3d, Lifts3dDocument, LngLatZ, RGBA } from "./types";
export { bakedZ } from "./geometry";
export { deckMapOptions } from "./options";
export { LIFTS_3D_SCHEMA, Lifts3dError, fetchLifts3d, type FetchLifts3dOptions } from "./fetch";
export {
  LIFT_COLORS,
  liftCablesLayer,
  liftModelInstances,
  liftModelsLayer,
  type LiftCablesLayerOptions,
  type LiftColorKey,
  type LiftModelInstance,
  type LiftModelKind,
  type LiftModelsLayerOptions,
  type LiftsInput,
} from "./layers";
export { createDeckOverlay, type DeckOverlay, type DeckOverlayMap, type DeckOverlayOptions } from "./overlay";

// Re-exported so `catch (e) { if (e instanceof UnmapError) }` works without adding @unmap/core.
export { UnmapError } from "@unmap/core";
