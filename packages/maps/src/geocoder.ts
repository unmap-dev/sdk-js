import MaplibreGeocoder, {
  type MaplibreGeocoderApi,
  type MaplibreGeocoderApiConfig,
  type MaplibreGeocoderFeatureResults,
  type MaplibreGeocoderOptions,
} from "@maplibre/maplibre-gl-geocoder";
import { Geocoder, type GeocodeResult, type GeocoderOptions } from "@unmap/geocoding";
import * as maplibregl from "maplibre-gl";

/**
 * The unmap gateway behind `@maplibre/maplibre-gl-geocoder`, the MapLibre search control.
 *
 * The plugin owns the UI (input, suggestion list, fly-to, marker) and asks a `geocoderApi` for
 * features in Mapbox's Carmen GeoJSON shape. This module is that API: it maps the plugin's request
 * onto `@unmap/geocoding` and each result back into a Carmen feature, so the control works the way
 * its own docs describe and callers who already use the Mapbox geocoder find the fields they read.
 *
 * Separate entry point (`@unmap/maps/geocoder`) so a map that never searches does not pull in the
 * plugin, its CSS or `@unmap/geocoding`.
 */

/**
 * A Carmen GeoJSON feature, with the unmap result it came from, untouched, on `properties.unmap`.
 *
 * Declared here rather than as the plugin's `CarmenGeojsonFeature & {...}`: under MapLibre 6 the
 * plugin's own declarations do not resolve (they import a `maplibre-gl` default export that no
 * longer exists and the `GeoJSON` namespace without depending on `@types/geojson`), and that type
 * silently becomes `any`, which would take these fields' types down with it. This shape is a
 * structural match for it, so a feature is accepted wherever the plugin wants one.
 */
export interface UnmapCarmenFeature {
  type: "Feature";
  id: string;
  /** The feature's own text: the street for an address, otherwise the name. */
  text: string;
  /** The full result line, e.g. "1000 9 AV SW, Calgary, AB". */
  place_name: string;
  /** Carmen type: `address`, `street`, `poi`, `place`, `region`, or an unmap-only layer name. */
  place_type: string[];
  center: [number, number];
  geometry: { type: "Point"; coordinates: [number, number] };
  /** House number, the way Carmen carries it apart from the street in `text`. */
  address?: string;
  language?: string;
  context: { id: string; text: string; short_code?: string }[];
  properties: { layer: GeocodeResult["layer"]; unmap: GeocodeResult };
}

export interface UnmapGeocoderApiOptions extends GeocoderOptions {
  /**
   * `autocomplete` (the default) answers every keystroke from the type-ahead endpoint, which is
   * what the control calls while `showResultsWhileTyping` is on. `search` uses full-text search,
   * for a control that only searches on Enter.
   */
  mode?: "autocomplete" | "search";
}

/**
 * Carmen `types` to unmap `layers`. unmap has one `locality` layer for municipalities and
 * neighbourhoods alike, so `place`, `locality` and `neighborhood` all reach it.
 */
const LAYER_FOR_TYPE: Readonly<Record<string, string>> = {
  address: "address",
  street: "street",
  poi: "poi",
  place: "locality",
  locality: "locality",
  neighborhood: "locality",
  district: "locality",
  region: "region",
};

/** unmap layer to Carmen `place_type`. Layers with no Carmen counterpart keep their own name. */
const TYPE_FOR_LAYER: Readonly<Record<string, string>> = {
  address: "address",
  street: "street",
  poi: "poi",
  locality: "place",
  region: "region",
};

/** One unmap result as a Carmen feature. */
export function toCarmenFeature(result: GeocodeResult, language?: string): UnmapCarmenFeature {
  const address = result.address ?? {};
  const center: [number, number] = [result.lng, result.lat];
  const placeType = TYPE_FOR_LAYER[result.layer] ?? result.layer;
  const isAddress = result.layer === "address" && !!address.housenumber && !!address.street;
  const ownCity = !!address.city && address.city === result.name;
  // `name` already reads "1000 9 AV SW, Calgary" for an address; the province completes it the
  // way Carmen's `place_name` does. A region names itself, and so does a city's own row.
  const province = result.layer === "region" || !address.region ? "" : address.region;
  const placeName = [result.name, province].filter(Boolean).join(", ");

  return {
    id: `${result.layer}.${result.id}`,
    type: "Feature",
    text: isAddress ? address.street! : result.name,
    ...(isAddress ? { address: address.housenumber } : {}),
    place_name: placeName,
    place_type: [placeType],
    center,
    geometry: { type: "Point", coordinates: center },
    ...(language ? { language } : {}),
    properties: { layer: result.layer, unmap: result },
    context: [
      ...(address.postcode ? [{ id: `postcode.${address.postcode}`, text: address.postcode }] : []),
      ...(address.city && !ownCity && result.layer !== "region" ? [{ id: `place.${address.city}`, text: address.city }] : []),
      ...(address.region && result.layer !== "region"
        ? [{ id: `region.${address.region}`, text: address.region, short_code: `CA-${address.region}` }]
        : []),
      { id: "country.ca", text: "Canada", short_code: "ca" },
    ],
  };
}

const collection = (features: UnmapCarmenFeature[]): MaplibreGeocoderFeatureResults => ({
  type: "FeatureCollection",
  features,
});

const inBbox = ([minLng, minLat, maxLng, maxLat]: number[], f: UnmapCarmenFeature) =>
  f.center[0] >= minLng! && f.center[0] <= maxLng! && f.center[1] >= minLat! && f.center[1] <= maxLat!;

/**
 * A `geocoderApi` for `new MaplibreGeocoder(api, options)`, answered by the unmap gateway.
 *
 * ```ts
 * import MaplibreGeocoder from "@maplibre/maplibre-gl-geocoder";
 * import { unmapGeocoderApi } from "@unmap/maps/geocoder";
 *
 * map.addControl(new MaplibreGeocoder(unmapGeocoderApi({ key }), { maplibregl, render: renderResult, popupRender: renderPopup }));
 * ```
 *
 * Pass `renderResult` and `renderPopup` (or your own escaping renderers): the plugin's defaults
 * build HTML from result text without escaping it, and result text is editable open data.
 */
export function unmapGeocoderApi(opts: UnmapGeocoderApiOptions): MaplibreGeocoderApi {
  const { mode = "autocomplete", ...clientOpts } = opts;
  const client = new Geocoder(clientOpts);

  return {
    async forwardGeocode(config: MaplibreGeocoderApiConfig) {
      const q = typeof config.query === "string" ? config.query.trim() : "";
      if (!q) return collection([]);
      let layers: string | undefined;
      if (config.types) {
        const mapped = [...new Set(config.types.split(",").map((t) => LAYER_FOR_TYPE[t.trim()]).filter(Boolean))];
        // Only types unmap has no layer for (`postcode`, `country`): nothing can match them, and
        // sending no `layers` would answer as if the caller had not filtered at all.
        if (!mapped.length) return collection([]);
        layers = mapped.join(",");
      }
      const limit = config.limit ?? 5;
      const bbox = config.bbox?.length === 4 ? config.bbox : undefined;
      const focus = config.proximity?.length === 2 ? ([config.proximity[0], config.proximity[1]] as [number, number]) : undefined;
      const search = {
        lang: config.language,
        layers,
        focus,
        // `/geocode/autocomplete` has no `bbox`, so a box is applied here, over a wider pool.
        limit: bbox && mode === "autocomplete" ? Math.min(50, limit * 4) : limit,
        ...(bbox && mode === "search" ? { bbox: bbox as [number, number, number, number] } : {}),
      };
      const results = mode === "search" ? await client.search(q, search) : await client.autocomplete(q, search);
      const features = results.map((r) => toCarmenFeature(r, config.language));
      return collection((bbox ? features.filter((f) => inBbox(bbox, f)) : features).slice(0, limit));
    },

    async reverseGeocode(config: MaplibreGeocoderApiConfig) {
      if (!Array.isArray(config.query) || config.query.length !== 2) return collection([]);
      const [lng, lat] = config.query as [number, number];
      const results = await client.reverse(lng, lat, { limit: config.limit ?? 1, lang: config.language });
      return collection(results.map((r) => toCarmenFeature(r, config.language)));
    },
  };
}

/**
 * Escape text for the HTML string the plugin's `render` and `popupRender` return. Result text is
 * open data (OSM, OpenAddresses, StatCan) that anyone can edit, so it is never markup.
 */
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type RenderItem = { text?: string; place_name?: string; geometry?: unknown };

/** Title before the first comma, the rest of `place_name` after it, both escaped. */
const splitPlaceName = (item: RenderItem) => {
  const [title = "", ...rest] = (item.place_name ?? item.text ?? "").split(",");
  return { title: escapeHtml(title), detail: escapeHtml(rest.join(",").trim()) };
};

/**
 * The plugin's suggestion-list layout, with the text escaped.
 *
 * The plugin's own `render` and `popupRender` concatenate `place_name` into HTML unescaped, so a
 * place whose name carries markup would run script in the host page. `createGeocoder` uses these
 * by default; pass them yourself when you build the plugin around `unmapGeocoderApi`.
 */
export function renderResult(item: RenderItem): string {
  if (!("geometry" in item)) {
    return `<div class="maplibregl-ctrl-geocoder--suggestion"><div class="maplibregl-ctrl-geocoder--suggestion-info"><div class="maplibregl-ctrl-geocoder--suggestion-title">${escapeHtml(item.text ?? "")}</div></div></div>`;
  }
  const { title, detail } = splitPlaceName(item);
  return `<div class="maplibregl-ctrl-geocoder--result"><div><div class="maplibregl-ctrl-geocoder--result-title">${title}</div><div class="maplibregl-ctrl-geocoder--result-address">${detail}</div></div></div>`;
}

/** The plugin's result-popup layout, with the text escaped. See `renderResult`. */
export function renderPopup(item: RenderItem): string {
  const { title, detail } = splitPlaceName(item);
  return `<div class="maplibregl-ctrl-geocoder--suggestion popup-suggestion"><div class="maplibregl-ctrl-geocoder--suggestion-title popup-suggestion-title">${title}</div><div class="maplibregl-ctrl-geocoder--suggestion-address popup-suggestion-address">${detail}</div></div>`;
}

export type CreateGeocoderOptions = UnmapGeocoderApiOptions & Omit<MaplibreGeocoderOptions, "maplibregl">;

/**
 * The MapLibre search control on the unmap gateway, ready for `map.addControl`.
 *
 * ```ts
 * import { createGeocoder } from "@unmap/maps/geocoder";
 * import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
 *
 * map.addControl(createGeocoder({ key: "um_live_..." }), "top-left");
 * ```
 *
 * Results show while typing, and a picked result fills the input with its full `place_name`;
 * every other option is the plugin's own and passes through, merged over these defaults.
 */
export function createGeocoder(opts: CreateGeocoderOptions): MaplibreGeocoder {
  const { key, gateway, fetch, retry, mode, ...control } = opts;
  return new MaplibreGeocoder(unmapGeocoderApi({ key, gateway, fetch, retry, mode }), {
    maplibregl,
    showResultsWhileTyping: true,
    debounceSearch: 200,
    minLength: 2,
    // The plugin's own default writes `item.text` into the input, which for a Carmen address is
    // the street without its number ("EVANSTON DR NW"). The full line reads back what was picked.
    getItemValue: (item) => ("place_name" in item && item.place_name ? item.place_name : item.text),
    // Escaped stand-ins for the plugin's unescaped HTML renderers (see `renderResult`).
    render: renderResult,
    popupRender: renderPopup,
    ...control,
  });
}

export { MaplibreGeocoder };
