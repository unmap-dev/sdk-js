import type { Recipe, ThemeBase } from "./recipe";

/**
 * The unmap theme document: one theme, both modes, data only.
 *
 * A theme is colours, bounded numbers and one enum — never URLs, never expressions, never
 * arbitrary style JSON. That is a security boundary, not a modelling choice: theme documents
 * arrive on public query strings and are composed into style JSON the gateway signs its own
 * asset URLs into. `validateTheme` is the only door in.
 *
 * `base` names the style (one of the shipped styles); each half carries only sparse overrides
 * on that style, so presets are near-empty documents and codes stay short.
 */

// NonNullable before the object test: optional Recipe fields (pois, landcover on the upstream
// Flavor type) are `X | undefined`, and a union never `extends object`, so without it those
// two would demand complete objects instead of partial ones.
export type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends object ? DeepPartial<NonNullable<T[K]>> : T[K];
};

export type BasemapOverrides = DeepPartial<Recipe>;

export interface MarkerTheme {
  /** Pin colour, #RRGGBB or #RRGGBBAA. */
  color?: string;
  /** Pin scale, 0.5–2. */
  scale?: number;
}

export interface RouteTheme {
  /** Main stroke colour. */
  color?: string;
  /** Main stroke width in px, 1–12. */
  width?: number;
  /** Main stroke opacity, 0–1. */
  opacity?: number;
  /** Under-stroke (casing) colour. */
  casingColor?: string;
  /** Casing width in px, 0–24. 0 disables the casing. */
  casingWidth?: number;
  /** Casing opacity, 0–1. */
  casingOpacity?: number;
}

export interface ThemeHalf {
  basemap?: BasemapOverrides;
  marker?: MarkerTheme;
  route?: RouteTheme;
}

/**
 * The simple-mode seed colours a generated theme was built from. Carried on the document so a
 * shared code reopens the builder in simple mode with the seeds intact; the gateway validates
 * them like any other field and otherwise ignores them — composition reads only the halves.
 */
export interface ThemeSeeds {
  /** Neutral cast: land, buildings, roads, labels. */
  land: string;
  water: string;
  /** Vegetation: parks, wood, scrub, forest landcover. */
  nature: string;
  /** Marker + route accent. Defaults to the interface magenta. */
  accent?: string;
}

/**
 * The major layer groups a theme can hide or reorder, in their stock bottom-to-top draw order.
 * Every layer the cartography draws belongs to exactly one of these (see `layerGroupOf`) except
 * the background, which always stays underneath. `buildings3d` is the one group that is off by
 * default: it draws building extrusions from the tiles' `height` property on top of the roads.
 *
 * Append only, like `THEME_BASES`: the names are on the wire in every `ut1.` code.
 */
export const LAYER_GROUPS = [
  "land",
  "water",
  "buildings",
  "roads",
  "boundaries",
  "buildings3d",
  "labels",
] as const;
export type LayerGroup = (typeof LAYER_GROUPS)[number];

/**
 * Structural overrides on the layer groups. Doc-level, not per half: which layers draw, and in
 * what order, is one decision for both modes — colour is the only thing that differs between
 * light and dark. Sparse like the halves: an absent field means stock.
 */
export interface ThemeLayers {
  /**
   * Per-group visibility; a missing key means the group's default (every group on except
   * `buildings3d`). Hidden groups are dropped from the style entirely.
   */
  visible?: Partial<Record<LayerGroup, boolean>>;
  /**
   * Bottom-to-top draw order, always the full set of groups exactly once. Absent means the
   * stock cartography order, in which the groups interleave (tunnels under buildings, bridges
   * over boundaries); an explicit order regroups every layer under its group.
   */
  order?: LayerGroup[];
}

export interface ThemeDoc {
  v: 1;
  /** Display name, ≤ 40 chars. */
  name?: string;
  base: ThemeBase;
  seeds?: ThemeSeeds;
  layers?: ThemeLayers;
  light?: ThemeHalf;
  dark?: ThemeHalf;
}
