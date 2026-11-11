import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { DEFAULT_GATEWAY, UnmapError, lngLatToTile, tileUrl } from "@unmap/core";
import type { Feature } from "geojson";

/**
 * Reads the basemap's vector tiles directly, for apps that need features (parks, water, cafés)
 * rather than pixels. A subpath export on purpose: it pulls in a protobuf decoder, and the root
 * entry is what `@unmap/sdk`'s browser bundle imports from.
 */

export type TileBBox = [west: number, south: number, east: number, north: number];

export interface TileFeaturesOptions {
  key: string;
  bbox: TileBBox;
  layers: readonly string[];
  /** Default 14, the deepest zoom the gateway serves. */
  zoom?: number;
  /** Refuse boxes needing more tiles than this, before spending any calls. Default 16. */
  maxTiles?: number;
  gateway?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export interface TileFeaturesResult {
  /** One key per requested layer, `[]` when the layer is absent from the tiles. */
  features: Record<string, Feature[]>;
  /** Tiles fetched. Each is one metered call, so callers can show the count. */
  requests: number;
}

/** Every `[x, y]` tile at `zoom` that a box touches, west to east then north to south. */
export function tilesCovering(bbox: TileBBox, zoom: number): [x: number, y: number][] {
  const [west, south, east, north] = bbox;
  const nw = lngLatToTile(west, north, zoom);
  const se = lngLatToTile(east, south, zoom);
  const tiles: [number, number][] = [];
  for (let x = nw.x; x <= se.x; x++) {
    for (let y = nw.y; y <= se.y; y++) tiles.push([x, y]);
  }
  return tiles;
}

export async function tileFeatures(opts: TileFeaturesOptions): Promise<TileFeaturesResult> {
  const zoom = opts.zoom ?? 14;
  const maxTiles = opts.maxTiles ?? 16;
  const tiles = tilesCovering(opts.bbox, zoom);
  if (tiles.length > maxTiles) {
    throw new RangeError(
      `This box needs ${tiles.length} tiles at z${zoom}, over the cap of ${maxTiles}. Use a smaller box or raise maxTiles.`,
    );
  }
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const template = tileUrl(opts.key, { gateway: opts.gateway ?? DEFAULT_GATEWAY });

  const features: Record<string, Feature[]> = {};
  for (const layer of opts.layers) features[layer] = [];

  const decoded = await Promise.all(
    tiles.map(async ([x, y]) => {
      const url = template
        .replace("{z}", String(zoom))
        .replace("{x}", String(x))
        .replace("{y}", String(y));
      const res = await doFetch(url, { signal: opts.signal });
      // 204 is a tile with nothing in it (open water, wilderness): empty, not an error.
      if (res.status === 204) return { x, y, tile: null };
      if (!res.ok) {
        throw new UnmapError(res.status, `Tile ${zoom}/${x}/${y} failed with ${res.status}`);
      }
      const tile = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
      return { x, y, tile };
    }),
  );

  for (const { x, y, tile } of decoded) {
    if (!tile) continue;
    for (const name of opts.layers) {
      const layer = tile.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        features[name]!.push(layer.feature(i).toGeoJSON(x, y, zoom) as Feature);
      }
    }
  }
  return { features, requests: tiles.length };
}
