import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/**
 * Canadian ski areas (`/ski/areas`, `/ski/areas/{id}`), their 3D lifts
 * (`/ski/areas/{id}/lifts-3d`) and their runs and lifts with stable ids
 * (`/ski/areas/{id}/features`), behind the Ski add-on.
 *
 *   const { data } = await unmap.ski.areas({ province: "BC", activity: "downhill" });
 *   const { data: area } = await unmap.ski.area(data[0].id);
 *   const { data: { features } } = await unmap.ski.features(area.id);
 *
 * Every field is derived from OpenStreetMap, so every response is ODbL: show
 * `meta.attribution` ("© OpenStreetMap contributors") wherever you show the data. The numbers
 * are terrain information, not avalanche or safety advice.
 *
 * A key without the add-on gets `SkiError` 403 `addon_required` (or `dev_only` /
 * `usage_limit_reached` on the dev plan), with the SKU that unlocks it in `addon`.
 */

export type SkiActivity = "downhill" | "nordic";

/** The eight compass directions the aspect histogram is binned into. */
export type SkiAspectDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** One ski area, as the gateway returns it (`apps/gateway/src/ski.ts`). */
export interface SkiArea {
  /** Stable OSM-derived id: `osm-way-<n>`, `osm-relation-<n>` or `osm-node-<n>`. */
  id: string;
  name: string;
  /** Two-letter province or territory code, or "" when the area could not be placed. */
  province: string;
  /** The nearest town, from our reverse geocoder. */
  locality: string;
  /** Representative point, [lng, lat]. */
  location: [number, number];
  /** The lowest lift station, where the road and the car park are; null with no lifts or runs. */
  base: [number, number] | null;
  /** [west, south, east, north]. */
  bbox: [number, number, number, number];
  activities: SkiActivity[];
  status: string | null;
  websites: string[];
  wikidata_id: string | null;
  /** From the terrain release the build sampled; null when the area has no lifts or runs to sample. */
  elevation: { top_m: number; base_m: number; vertical_m: number } | null;
  runs: { count: number; downhill_km: number; nordic_km: number };
  lifts: { count: number };
  /** Share of downhill run length facing each way, from the terrain release the build sampled. */
  aspect: Record<SkiAspectDirection, number>;
  /**
   * Fastest drive from the nearest of the three closest census metropolitan areas of 100,000 or
   * more. Null when none is within the routing engine's matrix limit.
   */
  drive: { from: string; minutes: number } | null;
  source: string;
  licence: string;
}

/** The provenance every ski response carries. `data_version` is the ski release that answered. */
export interface SkiMeta {
  source?: string;
  source_updated_at?: string | null;
  source_version?: string;
  content_hash?: string | null;
  sources?: readonly {
    id: string;
    source: string;
    source_url: string;
    attribution: string;
    source_updated_at: string | null;
    source_version: string;
    content_hash: string | null;
    status: "current" | "stale" | "unknown";
  }[];
  unmap_updated_at: string;
  data_version?: string;
  status: "current" | "stale" | "partial" | "unknown";
  /** "© OpenStreetMap contributors". Display it with the data: the data is ODbL. */
  attribution: string;
}

export interface SkiResponse<T> {
  data: T;
  meta: SkiMeta;
}

export interface SkiAreasOptions {
  /** Two-letter province or territory code (`BC`, `QC`, ...). */
  province?: string;
  activity?: SkiActivity;
  /** [west, south, east, north] in degrees; matches on the area's representative point. */
  bbox?: [number, number, number, number];
  /** Name search, accent- and case-insensitive ("mont sainte anne" finds "Mont-Sainte-Anne"). */
  q?: string;
  signal?: AbortSignal;
}

/** A point on a lift in 3D: [lng, lat, metres above sea level]. */
export type SkiPoint3d = [number, number, number];

/** One lift, ready to draw in 3D. */
export interface SkiLift3d {
  /** The OSM way, as `way-123`: the same id `features()` and the tiles give the lift. */
  id: string;
  /** Null when the lift has no name in OpenStreetMap. */
  name: string | null;
  /** The OSM `aerialway=*` value: `chair_lift`, `gondola`, `t-bar`, ... */
  aerialway: string;
  /** The two ends, on the ground. */
  stations: [SkiPoint3d, SkiPoint3d];
  /** Each at the top of its tower. */
  pylons: SkiPoint3d[];
  /** The cable line, sag included. */
  cable: SkiPoint3d[];
}

/**
 * The `data` of `GET /ski/areas/{id}/lifts-3d`: one area's lifts with heights. `meta.data_version`
 * is the ski release. A known area with no lifts has `lifts: []`.
 */
export interface SkiLifts3d {
  schema: "unmap.ski-lifts-3d.v1";
  area_id: string;
  /** The terrain release the heights were sampled from. Draw on the same one. */
  terrain_release: string;
  lifts: SkiLift3d[];
}

/** A [lng, lat] position in WGS84 degrees. */
export type SkiLngLat = [number, number];

/** A run or lift's own OpenStreetMap geometry. An area run (an OSM polygon, such as a bowl) is a polygon. */
export type SkiFeatureGeometry =
  | { type: "LineString"; coordinates: SkiLngLat[] }
  | { type: "MultiLineString"; coordinates: SkiLngLat[][] }
  | { type: "Polygon"; coordinates: SkiLngLat[][] }
  | { type: "MultiPolygon"; coordinates: SkiLngLat[][][] };

/**
 * One run or lift with a stable id. Geometry and identifiers only: nothing here says whether it
 * is open, groomed or safe. Every key is present; the other kind's fields are null.
 */
export interface SkiFeature {
  /**
   * The OSM element, `way-123` or `relation-456`. The same in every release while the element
   * exists, and the `id` property of the `runs` and `lifts` tile features. Compare it as a string;
   * `osm` carries its parts.
   */
  id: string;
  kind: "run" | "lift";
  name: string | null;
  /** Runs: OSM `piste:type` (`downhill`, `nordic`, `skitour`, `sled`). Null on a lift. */
  piste_type: string | null;
  /** Runs: OSM `piste:difficulty`, or `park` for a terrain park. Null when OSM has none, and on a lift. */
  difficulty: string | null;
  /** Lifts: OSM `aerialway` (`chair_lift`, `gondola`, ...). Null on a run. */
  aerialway: string | null;
  geometry: SkiFeatureGeometry;
  /** Horizontal length in metres along the line; for an area run, its greatest extent. */
  length_m: number;
  osm: { type: "way" | "relation"; id: number };
  source: string;
  licence: string;
}

/**
 * The `data` of `GET /ski/areas/{id}/features`: every run and lift of one area, lifts first, then
 * runs, each by id. `data_version` is the ski release. A known area with nothing mapped has
 * `features: []`.
 */
export interface SkiFeatures {
  schema: "unmap.ski-features.v1";
  area_id: string;
  data_version: string;
  features: SkiFeature[];
}

export interface SkiOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  /** Retry policy for `429`, `502`, `503` and transport failures. `false` disables it. See `RetryPolicy` in `@unmap/core`. */
  retry?: RetryPolicy | false;
}

/**
 * A ski failure.
 *
 * Extends `UnmapError`. `code` is the gateway's: `addon_required`, `dev_only` or
 * `usage_limit_reached` on a 403 (with `addon`, the SKU that unlocks it), `not_found` for an
 * unknown id, `bad_request` for a filter the gateway refused, `service_unavailable` when no ski
 * release is published.
 */
export class SkiError extends UnmapError {
  constructor(
    status: number,
    message: string,
    code?: string,
    retryAfterSeconds?: number,
    /** The add-on SKU that unlocks the data, on a 403. */
    readonly addon?: string,
  ) {
    super(status, message, code, retryAfterSeconds);
    this.name = "SkiError";
  }
}

async function errorFrom(res: Response, path: string): Promise<SkiError> {
  const fallback = `ski ${res.status} on ${path}`;
  let body: { error?: unknown; code?: unknown; addon?: unknown } | undefined;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = undefined;
  }
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const addon = typeof body?.addon === "string" ? body.addon : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get?.("retry-after") ?? null) ?? undefined;
  return new SkiError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter, addon);
}

/** Canadian ski areas. Needs the Ski add-on. */
export class Ski {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: SkiOptions) {
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.retry = opts.retry;
  }

  /** Every ski area, or those matching the filters, sorted by id. */
  areas(opts: SkiAreasOptions = {}): Promise<SkiResponse<SkiArea[]>> {
    return this.get(
      "/ski/areas",
      {
        province: opts.province || undefined,
        activity: opts.activity,
        bbox: opts.bbox?.join(","),
        q: opts.q || undefined,
      },
      opts.signal,
    );
  }

  /** One ski area. Throws `SkiError` 404 `not_found` for an unknown id. */
  area(id: string, opts: { signal?: AbortSignal } = {}): Promise<SkiResponse<SkiArea>> {
    return this.get(`/ski/areas/${encodeURIComponent(id)}`, undefined, opts.signal);
  }

  /** One area's lifts in 3D: stations, pylons and cable with heights. Throws `SkiError` 404 `not_found` for an unknown id. */
  lifts3d(id: string, opts: { signal?: AbortSignal } = {}): Promise<SkiResponse<SkiLifts3d>> {
    return this.get(`/ski/areas/${encodeURIComponent(id)}/lifts-3d`, undefined, opts.signal);
  }

  /**
   * One area's runs and lifts, each with a stable OSM-derived id, its name, kind and geometry.
   * Throws `SkiError` 404 `not_found` for an unknown id.
   */
  features(id: string, opts: { signal?: AbortSignal } = {}): Promise<SkiResponse<SkiFeatures>> {
    return this.get(`/ski/areas/${encodeURIComponent(id)}/features`, undefined, opts.signal);
  }

  private async get<T>(path: string, values: Record<string, string | undefined> | undefined, signal?: AbortSignal): Promise<T> {
    const query = new URLSearchParams({ key: this.key });
    for (const [name, value] of Object.entries(values ?? {})) {
      if (value !== undefined) query.set(name, value);
    }
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${query}`,
      { signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res, path);
    return (await res.json()) as T;
  }
}
