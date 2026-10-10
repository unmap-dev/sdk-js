/**
 * Bbox query against identify-capable catalog layers. Same PostGIS tables as
 * `/identify`; tile-only catalog ids are rejected (gateway 501), not silently empty.
 */

import {
  IDENTIFY_LAYER_IDS,
  isIdentifyLayer,
  knownIdentifyLayers,
  type IdentifyLayerId,
  type IdentifyResult,
} from "./identify";

export const QUERY_LAYER_IDS = IDENTIFY_LAYER_IDS;
export type QueryLayerId = IdentifyLayerId;

export const DEFAULT_QUERY_LIMIT = 50;
export const MAX_QUERY_LIMIT = 50;

export type QueryBbox = [number, number, number, number];

export function knownQueryLayers(): string {
  return knownIdentifyLayers();
}

export function parseQueryLayer(
  raw: string | undefined,
): { layer: QueryLayerId } | { unknown: string; error: string } | { error: string } {
  const id = (raw ?? "").trim();
  if (!id) return { error: "layer required" };
  if (isIdentifyLayer(id)) return { layer: id };
  return {
    unknown: id,
    error: `unknown query layer "${id}". queryable: ${knownQueryLayers()}`,
  };
}

export function parseQueryBbox(raw: string | undefined): { bbox: QueryBbox } | { error: string } {
  const value = raw?.trim();
  if (!value) return { error: "bbox (minlng,minlat,maxlng,maxlat) required" };
  const pieces = value.split(",");
  if (pieces.length !== 4 || pieces.some((piece) => piece.trim() === "")) {
    return { error: "bbox must be minlng,minlat,maxlng,maxlat" };
  }
  const nums = pieces.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) {
    return { error: "bbox must be minlng,minlat,maxlng,maxlat" };
  }
  const [minLng, minLat, maxLng, maxLat] = nums as QueryBbox;
  if (minLng >= maxLng || minLat >= maxLat) {
    return { error: "bbox must be minlng,minlat,maxlng,maxlat" };
  }
  return { bbox: [minLng, minLat, maxLng, maxLat] };
}

/** Missing or non-numeric `limit` falls back; a finite value is clamped to 1–50. */
export function parseQueryLimit(raw: string | undefined): number {
  if (raw == null || raw === "") return DEFAULT_QUERY_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), MAX_QUERY_LIMIT) : DEFAULT_QUERY_LIMIT;
}

export interface QueryOptions {
  /** Identify-capable catalog id. Tile-only catalog ids are a 501. */
  layer: string;
  /** `[minLng, minLat, maxLng, maxLat]` in WGS84 degrees. */
  bbox: QueryBbox;
  /** Max features. Default 50, clamped to 1–50. */
  limit?: number;
  /** Include geometry when the row has one. */
  geometry?: boolean;
  signal?: AbortSignal;
}

export interface QueryResponse {
  layer: QueryLayerId;
  bbox: QueryBbox;
  results: IdentifyResult[];
}
