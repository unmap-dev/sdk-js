import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/**
 * Modelled urban noise (`/noise/point`), behind the Urban Noise add-on.
 *
 *   const { data, meta } = await unmap.noise.point({ lat: 51.054, lng: -114.0884 });
 *   data.lden; // 49.3 dB, day-evening-night
 *   data.label; // "Quiet"
 *
 * Six cities: Calgary, Edmonton, Vancouver, Toronto, Montréal and Québec City. A point outside
 * them throws `NoiseError` 422 `outside_coverage`, with the covered cities in `cities`.
 *
 * The levels are computed from OpenStreetMap, so the data is ODbL: show `meta.attribution`
 * ("© OpenStreetMap contributors; noise model: PickYourPlace") wherever you show it. They are
 * modelled, not measured: screening data, not a compliance assessment.
 *
 * A key without the add-on gets `NoiseError` 403 `addon_required` (or `dev_only` /
 * `usage_limit_reached` on the dev plan), with the SKU that unlocks it in `addon`.
 */

export type NoiseLabel = "Quiet" | "Moderate" | "Noisy" | "Very noisy" | "Severe";
export type NoiseSource = "road" | "rail" | "aircraft" | "commercial";

/** One H3 hexagon's modelled noise, as the gateway returns it (`apps/gateway/src/noise.ts`). */
export interface NoisePoint {
  /** H3 index of the hexagon. */
  h3: string;
  /** H3 resolution: 11, about 25 m across. */
  resolution: number;
  /** The covered city: `calgary`, `edmonton`, `vancouver`, `toronto`, `montreal` or `quebec-city`. */
  city: string;
  /** Day-evening-night level, dB (EU Lden). Null where no modelled source is in range: never 0 dB. */
  lden: number | null;
  /** Night level, 23:00 to 07:00, dB. */
  lnight: number | null;
  /** 0 to 100, anchored to the WHO 2018 Environmental Noise Guidelines; 100 is quiet. */
  score: number | null;
  /** 100 minus the score. */
  risk: number | null;
  /** 80 and up Quiet, 60 Moderate, 40 Noisy, 20 Very noisy, below 20 Severe. */
  label: NoiseLabel | null;
  /** Lden above 53 dB (day) and Lnight above 45 dB (night), the WHO 2018 road-traffic levels. */
  exceeds_who: { day: boolean | null; night: boolean | null };
  dominant_source: NoiseSource | null;
  /** Each source's level at the hexagon, dB; null where that source is not modelled in range. */
  sources_db: Record<NoiseSource, number | null>;
  /** Present only when `lden` is null: "no modelled source within range". */
  note?: string;
}

/** The provenance every noise response carries. `data_version` is the release that answered. */
export interface NoiseMeta {
  source?: string;
  source_updated_at?: string | null;
  source_version?: string;
  content_hash?: string | null;
  unmap_updated_at: string;
  data_version?: string;
  status: "current" | "stale" | "partial" | "unknown";
  /** "© OpenStreetMap contributors; noise model: PickYourPlace". Display it with the data. */
  attribution: string;
  /** "ODbL-1.0". */
  licence: string;
}

export interface NoiseResponse<T> {
  data: T;
  meta: NoiseMeta;
}

/** A city Urban Noise covers, as a 422 `outside_coverage` lists them. */
export interface NoiseCity {
  slug: string;
  name: { en: string; fr: string };
  /** [west, south, east, north]. */
  bbox: [number, number, number, number];
}

export interface NoisePointOptions {
  lat: number;
  lng: number;
  signal?: AbortSignal;
}

export interface NoiseOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  /** Retry policy for `429`, `502`, `503` and transport failures. `false` disables it. See `RetryPolicy` in `@unmap/core`. */
  retry?: RetryPolicy | false;
}

/**
 * A noise failure.
 *
 * Extends `UnmapError`. `code` is the gateway's: `addon_required`, `dev_only` or
 * `usage_limit_reached` on a 403 (with `addon`, the SKU that unlocks it), `outside_coverage` on a
 * 422 (with `cities`, what is covered), `bad_request` for a coordinate the gateway refused,
 * `service_unavailable` while no release is served.
 */
export class NoiseError extends UnmapError {
  constructor(
    status: number,
    message: string,
    code?: string,
    retryAfterSeconds?: number,
    /** The add-on SKU that unlocks the data, on a 403. */
    readonly addon?: string,
    /** The covered cities, on a 422 `outside_coverage`. */
    readonly cities?: NoiseCity[],
  ) {
    super(status, message, code, retryAfterSeconds);
    this.name = "NoiseError";
  }
}

async function errorFrom(res: Response, path: string): Promise<NoiseError> {
  const fallback = `noise ${res.status} on ${path}`;
  let body: { error?: unknown; code?: unknown; addon?: unknown; cities?: unknown } | undefined;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = undefined;
  }
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const addon = typeof body?.addon === "string" ? body.addon : undefined;
  const cities = Array.isArray(body?.cities) ? (body.cities as NoiseCity[]) : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get?.("retry-after") ?? null) ?? undefined;
  return new NoiseError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter, addon, cities);
}

/** Modelled urban noise for six Canadian cities. Needs the Urban Noise add-on. */
export class Noise {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: NoiseOptions) {
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.retry = opts.retry;
  }

  /**
   * The modelled noise of the hexagon (about 25 m) at a point. Throws `NoiseError` 422
   * `outside_coverage` outside the six cities, and 400 for a coordinate outside WGS84, which is
   * checked here before any request is made.
   */
  async point(opts: NoisePointOptions): Promise<NoiseResponse<NoisePoint>> {
    const { lat, lng } = opts;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new NoiseError(400, "lat and lng must be WGS84 degrees", "bad_request");
    }
    const path = "/noise/point";
    const query = new URLSearchParams({ key: this.key, lat: String(lat), lng: String(lng) });
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${query}`,
      { signal: opts.signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res, path);
    return (await res.json()) as NoiseResponse<NoisePoint>;
  }
}
