import type { GeocodeResult, ReverseOptions } from "./index";
import type { TreatyCategory, TreatyContext } from "./treaties";

/**
 * Treaty overlay controller (docs/indigenous-context/contract.md, "Tiles").
 *
 * Drawing is the style's job: `overlays: ["treaties"]` composes the catalog layer, in the style's
 * own colours. This helper does the rest: shows or hides historic and modern, and answers "which
 * treaties are here" for a clicked point or a point a keyboard user supplied. The answer comes
 * from the geocoder's full-resolution lookup, never from the tile features, because a tile may
 * have simplified away a small record; the clicked features only say which dataset version is on
 * screen, and every lookup is pinned to it.
 *
 * Each lookup is one reverse geocode call. Creating the controller, toggling and restyling make
 * no requests.
 */

/** The layer ids `overlays: ["treaties"]` composes (apps/gateway/src/overlays.ts). */
export function treatyLayerIds(category: TreatyCategory): [fill: string, line: string] {
  return [`overlay_treaties_fill_${category}`, `overlay_treaties_line_${category}`];
}

const CATEGORIES: readonly TreatyCategory[] = ["historic", "modern"];

/** The slice of a MapLibre map this controller uses. */
export interface TreatyMapLike {
  on(type: "click", listener: (e: { lngLat: { lng: number; lat: number }; point: unknown }) => void): unknown;
  on(type: "styledata", listener: () => void): unknown;
  off(type: "click", listener: (e: { lngLat: { lng: number; lat: number }; point: unknown }) => void): unknown;
  off(type: "styledata", listener: () => void): unknown;
  getLayer(id: string): unknown;
  setLayoutProperty(id: string, name: "visibility", value: "visible" | "none"): unknown;
  queryRenderedFeatures(point: unknown, options: { layers: string[] }): Array<{ properties?: Record<string, unknown> | null }>;
}

/** Anything with the geocoder's `reverse`: `unmap.geocoder`, or a `Geocoder`. */
export interface TreatyLookupClient {
  reverse(lng: number, lat: number, opts?: ReverseOptions): Promise<GeocodeResult[]>;
}

export interface TreatySelection {
  /** Treaty context for the point, from the full-resolution lookup. */
  context: TreatyContext;
  /** Record ids drawn under the point on screen, deduplicated across tile fragments. */
  drawn: string[];
  /** Categories currently hidden on the map. Their matches are still in `context`. */
  hidden: TreatyCategory[];
}

export interface TreatyOverlayOptions {
  historic?: boolean;
  modern?: boolean;
  lang?: "en" | "fr";
  /** Answer map clicks. Default true; false leaves lookups to `lookupAt`. */
  interactive?: boolean;
  /** The latest selection. A superseded or destroyed lookup never calls this. */
  onSelect?(selection: TreatySelection): void;
  /**
   * A lookup failed. `code: "treaties_version_not_found"` means the drawn version has been
   * retired: show it as unavailable and offer to reload the map, never newer details.
   */
  onError?(error: Error & { code?: string }): void;
}

export interface TreatyOverlayController {
  setVisibility(value: { historic?: boolean; modern?: boolean }): void;
  readonly visibility: { historic: boolean; modern: boolean };
  setLanguage(lang: "en" | "fr"): void;
  /**
   * Treaty context for a point: the non-canvas path (a geocoder result, typed coordinates).
   * `datasetVersion` pins it; omitted, it pins to whatever the map last showed at a click, or the
   * current release when nothing has been clicked.
   */
  lookupAt(point: [number, number], datasetVersion?: string): Promise<TreatySelection | undefined>;
  destroy(): void;
}

export function createTreatyOverlay(
  map: TreatyMapLike,
  client: TreatyLookupClient,
  options: TreatyOverlayOptions = {},
): TreatyOverlayController {
  const visibility = { historic: options.historic ?? true, modern: options.modern ?? true };
  let lang = options.lang ?? "en";
  let latest = 0;
  let destroyed = false;
  let drawnVersion: string | undefined;

  const allLayers = (): string[] => CATEGORIES.flatMap((c) => treatyLayerIds(c)).filter((id) => map.getLayer(id));

  const apply = (): void => {
    for (const category of CATEGORIES) {
      for (const id of treatyLayerIds(category)) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility[category] ? "visible" : "none");
      }
    }
  };

  const hidden = (): TreatyCategory[] => CATEGORIES.filter((c) => !visibility[c]);

  async function select(point: [number, number], version: string | undefined, drawn: string[]) {
    const id = ++latest;
    try {
      const results = await client.reverse(point[0], point[1], {
        include: ["treaties"],
        lang,
        limit: 1,
        ...(version ? { treatiesVersion: version } : {}),
      });
      const context = results[0]?.treaties;
      if (!context) throw new Error("the geocoder returned no treaty context");
      const selection: TreatySelection = { context, drawn, hidden: hidden() };
      if (id === latest && !destroyed) options.onSelect?.(selection);
      return selection;
    } catch (err) {
      if (id === latest && !destroyed) {
        options.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
      return undefined;
    }
  }

  const onClick = (e: { lngLat: { lng: number; lat: number }; point: unknown }): void => {
    const layers = allLayers();
    const features = layers.length > 0 ? map.queryRenderedFeatures(e.point, { layers }) : [];
    const drawn = [...new Set(features.map((f) => f.properties?.id).filter((v): v is string => typeof v === "string"))].sort();
    const version = features
      .map((f) => f.properties?.dataset_version)
      .find((v): v is string => typeof v === "string");
    if (version) drawnVersion = version;
    void select([e.lngLat.lng, e.lngLat.lat], version ?? drawnVersion, drawn);
  };

  // A style swap drops layout state; reapply it on every styledata. One listener, removed on
  // destroy, so repeated swaps never stack handlers.
  map.on("styledata", apply);
  if (options.interactive !== false) map.on("click", onClick);
  apply();

  return {
    get visibility() {
      return { ...visibility };
    },
    setVisibility(value) {
      if (value.historic !== undefined) visibility.historic = value.historic;
      if (value.modern !== undefined) visibility.modern = value.modern;
      apply();
    },
    setLanguage(next) {
      lang = next;
    },
    lookupAt(point, datasetVersion) {
      return select(point, datasetVersion ?? drawnVersion, []);
    },
    destroy() {
      destroyed = true;
      map.off("styledata", apply);
      map.off("click", onClick);
    },
  };
}
