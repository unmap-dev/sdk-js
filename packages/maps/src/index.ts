import {
  Map as MaplibreMap,
  NavigationControl,
  type ControlPosition,
  type MapOptions,
  type ProjectionSpecification,
} from "maplibre-gl";
import { unmapStyle, type MapProfile } from "./style";

export * from "./style";
/**
 * The MapLibre GL library itself, re-exported so that reaching for `Marker` or `Popup` never
 * means a second copy of MapLibre in the bundle.
 *
 * v6 is ESM-only and dropped the default export, so this is the module namespace rather than a
 * default import. `import { maplibregl } from "@unmap/maps"` is unchanged for callers.
 */
export * as maplibregl from "maplibre-gl";
export type { Map } from "maplibre-gl";

/** Map projection. Globe is the default; `mercator` draws the flat map. */
export type Projection = "globe" | "mercator";

export interface UnmapMapOptions {
  key: string;
  container: string | HTMLElement;
  gateway?: string;
  /** Style name (`base`, `muted`, `outdoor`), full style URL, or MapLibre style; defaults to `base`. */
  style?: string;
  /** "light" or "dark", light by default. Applies to a bare style name; a `<style>-<mode>` string is passed through as written and `mode` does not change it. */
  mode?: string;
  /** Label language, e.g. "fr". Omit to follow the request's Accept-Language. */
  lang?: string;
  /** Compact `ut1.` theme code from unmap.dev/create. Wins over the path style on the gateway. */
  theme?: string;
  /** Catalog layer ids composed onto the style (`municipalities`, `survey.dls`, …). */
  overlays?: readonly string[];
  /** Composition preset. Not a style. Explicit overlays replace the profile list. */
  profile?: MapProfile;
  /**
   * `"globe"` (the default) draws the map as a sphere; `"mercator"` draws the flat map.
   * MapLibre's globe flattens into Mercator as it zooms in, so a city view reads as a flat map.
   * A city centre without a zoom still frames the city, not the planet.
   */
  projection?: Projection;
  center?: [number, number];
  zoom?: number;
  /**
   * On-map controls. `true` (the default) adds MapLibre's navigation control — zoom in, zoom
   * out, and a compass — at `top-right`. `false` adds nothing.
   *
   * Shaped after MapLibre's own `attributionControl: false | {...}` so the two read alike. When
   * further controls are offered they get their own keys here rather than overloading a boolean.
   */
  controls?: boolean | UnmapControlsOptions;
  /** Extra MapLibre GL Map options, merged last. */
  maplibre?: Partial<MapOptions>;
}

export interface UnmapControlsOptions {
  /** Corner to mount the controls in. Defaults to `top-right`. */
  position?: ControlPosition;
}

/** The projection a map is drawn in when the caller does not say. */
const DEFAULT_PROJECTION: Projection = "globe";

/** Where controls land when the caller does not say. MapLibre's own default corner. */
const DEFAULT_CONTROL_POSITION: ControlPosition = "top-right";

/**
 * Start the compact attribution collapsed.
 *
 * `attributionControl: { compact: true }` is necessary but not sufficient, which is easy to miss.
 * MapLibre's `_updateCompact` adds BOTH `maplibregl-compact` and `maplibregl-compact-show`, and
 * the CSS reads:
 *
 *   .maplibregl-compact      .maplibregl-ctrl-attrib-inner { display: none }
 *   .maplibregl-compact-show .maplibregl-ctrl-attrib-inner { display: block }
 *
 * so the pill is built but rendered *expanded*, and only collapses once the user drags the map.
 * Dropping `compact-show` is what actually yields the ⓘ affordance on first paint.
 *
 * Doing it via `addControl(new AttributionControl({ compact: true }))` instead changes nothing —
 * that path runs the same `_updateCompact`. The class is the lever, not the construction site.
 *
 * This is stable across resizes: `_updateCompact` re-adds `compact-show` only when the element
 * does not already carry `maplibregl-compact`, and it still does. Clicking the ⓘ still toggles.
 *
 * When it happens matters. At construction the control has no text yet, so MapLibre marks it
 * `maplibregl-attrib-empty` and does not compact it; the first `styledata` or `sourcedata` that
 * brings a credit adds both classes, and the credit then shows in full until something removes
 * `compact-show`. Waiting for `load` left it open over a third of a phone map for as long as the
 * tiles took. So collapse on the first data event that compacts it (MapLibre's own listener runs
 * first, being registered in the constructor), then stop listening, so a reader who opens it
 * keeps it open. A caller who adds their own attribution control later is covered the same way.
 */
function collapseAttribution(map: MaplibreMap): void {
  const collapse = (): boolean => {
    const el = map.getContainer().querySelector(".maplibregl-ctrl-attrib.maplibregl-compact");
    el?.classList.remove("maplibregl-compact-show");
    return !!el;
  };
  if (collapse()) return;
  const onData = () => {
    if (!collapse()) return;
    map.off("styledata", onData);
    map.off("sourcedata", onData);
  };
  map.on("styledata", onData);
  map.on("sourcedata", onData);
}

/**
 * MapLibre resolves a string `container` with `getElementById`, so `"#map"` throws
 * "Container '#map' not found" even though it is the first thing a developer reaches for.
 * Accept both: an id first, then any selector the string happens to be.
 */
function resolveContainer(container: string | HTMLElement): string | HTMLElement {
  if (typeof container !== "string" || typeof document === "undefined") return container;
  if (document.getElementById(container)) return container;
  try {
    return document.querySelector<HTMLElement>(container) ?? container;
  } catch {
    return container;
  }
}

/** Create a MapLibre GL map wired to the unmap gateway (Mapbox-GL-JS-compatible surface). */
export function createMap(opts: UnmapMapOptions): MaplibreMap {
  const map = new MaplibreMap({
    container: resolveContainer(opts.container),
    style: unmapStyle(opts),
    // Collapse attribution to the ⓘ affordance. MapLibre only auto-compacts under 640px, so on
    // any narrower-than-full-width desktop map the full credit line runs across the bottom of
    // the map, and on phones it wraps to two lines over the cartography. Attribution is not
    // reduced by this — the same string stays one tap away, which is the standard treatment and
    // what the OSM guidelines contemplate for small displays.
    attributionControl: { compact: true },
    ...(opts.center ? { center: opts.center } : {}),
    // A centre without a zoom is a city, not the whole planet: MapLibre's default zoom is 0,
    // which turns `new Unmap({ center: calgary })` into a world map. 11 frames a city.
    ...(opts.zoom != null ? { zoom: opts.zoom } : opts.center ? { zoom: 11 } : {}),
    // Spread last so a caller can override any default above, including the attribution.
    ...opts.maplibre,
  });
  // MapLibre 6 has no constructor `projection` option, and calling `setProjection` before the
  // style exists throws, so the projection is applied on `style.load`. Applied even for the
  // default: MapLibre's own default is Mercator, and the style document carries none.
  //
  // MapLibre 6 also keeps the projection on the style document, so `map.setStyle` (diffed or
  // not) to a style that names none draws Mercator. Carry what the map showed before the swap
  // onto the new style, as the registry's map-context does: the projection this map was created
  // with, or one the caller set since. A style's own projection is carried the same way, onto
  // later styles, overriding theirs; a caller who wants the new style's projection sets it in
  // their own `style.load` listener, which runs after this one.
  let carried: ProjectionSpecification = { type: opts.projection ?? DEFAULT_PROJECTION };
  const swapStyle = map.setStyle.bind(map);
  map.setStyle = (style, options) => {
    // Undefined while a style is still loading: keep what the last one carried.
    const shown = map.getProjection();
    if (shown) carried = shown;
    return swapStyle(style, options);
  };
  map.on("style.load", () => map.setProjection(carried));
  // A style that loaded inside the constructor fired its `style.load` before the listener existed.
  if (map.getStyle()) map.setProjection(carried);

  // Skip only when the caller turned attribution off entirely; there is nothing to collapse.
  if (opts.maplibre?.attributionControl !== false) collapseAttribution(map);

  // Controls are added after construction because MapLibre offers no constructor option for
  // them: `attributionControl` is the single exception, and every other control is an
  // `addControl` call. Anything falsy but `undefined` means the caller opted out.
  if (opts.controls !== false) {
    const controls = typeof opts.controls === "object" ? opts.controls : {};
    map.addControl(new NavigationControl(), controls.position ?? DEFAULT_CONTROL_POSITION);
  }

  return map;
}
