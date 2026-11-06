/**
 * MapLibre options `@unmap/deck` needs at construction time. Pass them as `createMap`'s
 * `maplibre` option (or spread them into `new maplibregl.Map({...})`).
 *
 * MapLibre creates its WebGL context with `antialias: false`, which gives deck.gl's lift cables
 * hard, stair-stepped edges. Antialiasing is a context attribute, so it can only be chosen when
 * the map is created; `createDeckOverlay` cannot turn it on later and warns instead.
 */
export const deckMapOptions: { canvasContextAttributes: { antialias: true } } = {
  canvasContextAttributes: { antialias: true },
};
