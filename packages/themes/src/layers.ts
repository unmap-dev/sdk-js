import { LAYER_GROUPS, type LayerGroup, type ThemeLayers } from "./doc";

/**
 * Layer groups: the structural half of a theme. A theme can hide any of the seven major groups
 * and redraw them in another order, the way kepler.gl's base-map panel does. This module owns
 * the mapping from the expanded Protomaps layer list onto those groups and applies a document's
 * `layers` field to a style's layer array.
 *
 * It works on the expanded layers rather than the Flavor because the groups are about what
 * draws, not what colour it draws in — the Recipe stays the colour surface, this is the only
 * structural one, and both are still data (booleans and one enum list on the wire).
 */

/** Stock visibility: every group draws except the extrusions, which are opt-in. */
export const DEFAULT_LAYER_VISIBILITY: Readonly<Record<LayerGroup, boolean>> = {
  land: true,
  water: true,
  buildings: true,
  roads: true,
  boundaries: true,
  buildings3d: false,
  labels: true,
};

/** The id of the synthetic extrusion layer `buildings3d` draws. */
export const BUILDINGS_3D_LAYER_ID = "buildings_3d";

/** Airport surfaces are lines in the roads source-layer but read as ground, not as roads. */
const LAND_LINES = new Set(["roads_runway", "roads_taxiway"]);

/**
 * Which group an expanded Protomaps layer belongs to, or `null` for the background, which is
 * never hidden or moved: with land off it is what you see. Symbol layers are labels regardless
 * of their source, so the POI icons, shields and one-way arrows hide with the text.
 *
 * The contract test asserts every stock layer lands in a group, so an upstream layer this
 * cannot place fails loudly rather than becoming an unmovable, unhideable stray.
 */
export function layerGroupOf(layer: { id: string; type: string }): LayerGroup | null {
  const { id, type } = layer;
  if (type === "symbol") return "labels";
  if (id === "background") return null;
  if (id === BUILDINGS_3D_LAYER_ID) return "buildings3d";
  if (id === "buildings") return "buildings";
  if (id.startsWith("water")) return "water";
  if (id.startsWith("boundaries")) return "boundaries";
  if (LAND_LINES.has(id)) return "land";
  if (id.startsWith("roads")) return "roads";
  if (id === "earth" || id === "landcover" || id.startsWith("landuse")) return "land";
  return null;
}

/** Whether a group draws under this `layers` field (absent field means stock). */
export function isLayerVisible(layers: ThemeLayers | undefined, group: LayerGroup): boolean {
  return layers?.visible?.[group] ?? DEFAULT_LAYER_VISIBILITY[group];
}

/** The bottom-to-top group order this `layers` field asks for; stock when it names none. */
export function effectiveLayerOrder(layers: ThemeLayers | undefined): readonly LayerGroup[] {
  return layers?.order ?? LAYER_GROUPS;
}

/** True when `order` is the stock order (or absent), so nothing needs regrouping. */
export function isStockLayerOrder(order: readonly LayerGroup[] | undefined): boolean {
  return !order || (order.length === LAYER_GROUPS.length && order.every((g, i) => g === LAYER_GROUPS[i]));
}

/** True when the field changes nothing — the builder strips such a field back to absent. */
export function isStockLayers(layers: ThemeLayers | undefined): boolean {
  if (!layers) return true;
  if (!isStockLayerOrder(layers.order)) return false;
  return LAYER_GROUPS.every((g) => isLayerVisible(layers, g) === DEFAULT_LAYER_VISIBILITY[g]);
}

/**
 * The extrusion layer `buildings3d` draws: every building from the tiles' `height` (metres,
 * from OSM `height` / `building:levels`) and `min_height`, with a two-storey stand-in for the
 * ones that carry neither so a downtown does not come up as a field of flat slabs beside
 * towers. Colour is the theme's `buildings` slot; opacity stays a touch under solid so the
 * roads under an overhang still read.
 */
function buildings3dLayer(source: string, color: string) {
  return {
    id: BUILDINGS_3D_LAYER_ID,
    type: "fill-extrusion",
    source,
    "source-layer": "buildings",
    minzoom: 13,
    filter: ["in", "kind", "building", "building_part"],
    paint: {
      "fill-extrusion-color": color,
      "fill-extrusion-height": ["coalesce", ["get", "height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": 0.85,
    },
  };
}

/**
 * Apply a theme's `layers` field to an expanded style layer array. Returns the input untouched
 * when the field changes nothing, so a zero-override theme stays byte-identical to its flavor.
 *
 * Hidden groups are removed outright rather than set to `visibility: none` — a smaller style,
 * and nothing left for a client to accidentally switch back on. With the stock order the
 * remaining layers keep their stock positions (and the extrusions, if on, slot in just under
 * the labels). With a custom order every group's layers are gathered under it, in stock
 * relative order within the group; the background and any layer outside every group stay
 * first, in their stock order.
 *
 * `buildingsColor` paints the extrusions: the resolved theme's `buildings` slot.
 */
export function applyThemeLayers<T extends { id: string; type: string }>(
  styleLayers: T[],
  layers: ThemeLayers | undefined,
  buildingsColor: string,
): T[] {
  if (isStockLayers(layers)) return styleLayers;

  const visible = (g: LayerGroup) => isLayerVisible(layers, g);
  const tagged = styleLayers.map((layer) => ({ layer, group: layerGroupOf(layer) }));
  const source =
    (styleLayers.find((l) => l.id === "buildings") as { source?: string } | undefined)?.source ??
    "unmap";
  const extrusion = visible("buildings3d")
    ? (buildings3dLayer(source, buildingsColor) as unknown as T)
    : null;

  if (isStockLayerOrder(layers?.order)) {
    const kept = tagged.filter(({ group }) => group === null || visible(group)).map((t) => t.layer);
    if (!extrusion) return kept;
    const firstLabel = kept.findIndex((l) => layerGroupOf(l) === "labels");
    const at = firstLabel === -1 ? kept.length : firstLabel;
    return [...kept.slice(0, at), extrusion, ...kept.slice(at)];
  }

  const out: T[] = tagged.filter(({ group }) => group === null).map((t) => t.layer);
  for (const group of effectiveLayerOrder(layers)) {
    if (!visible(group)) continue;
    if (group === "buildings3d") {
      if (extrusion) out.push(extrusion);
      continue;
    }
    for (const t of tagged) if (t.group === group) out.push(t.layer);
  }
  return out;
}
