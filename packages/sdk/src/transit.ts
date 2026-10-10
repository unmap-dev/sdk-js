import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

export type TransitMetaStatus = "current" | "stale" | "partial" | "unknown";

export interface TransitMeta {
  /** Static GTFS is scheduled data. Realtime will use a different value and updated_at. */
  schedule_type: "scheduled";
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
  status: TransitMetaStatus;
  attribution: string;
}

export interface TransitResponse<T> {
  data: T;
  meta: TransitMeta;
}

export interface TransitAgency {
  id: string;
  feed: string;
  name: string;
  url?: string;
  timezone: string;
  lang?: string;
  phone?: string;
  fare_url?: string;
}

export interface TransitStop {
  id: string;
  feed: string;
  name: string;
  coordinates: [number, number];
  code?: string;
  description?: string;
  zone_id?: string;
  parent_station_id?: string;
  wheelchair_boarding?: 0 | 1 | 2;
  route_ids: string[];
  /** Metres from the requested point. Present only on nearbyStops. */
  distance?: number;
}

export interface TransitRoute {
  id: string;
  feed: string;
  agency_id: string;
  short_name?: string;
  long_name?: string;
  description?: string;
  route_type: number;
  colour?: string;
  text_colour?: string;
  url?: string;
}

export interface TransitDeparture {
  stop_id: string;
  route_id: string;
  trip_id: string;
  headsign?: string;
  arrival: string;
  departure: string;
  stop_sequence: number;
  /** 2 = phone agency; 3 = coordinate with driver. Omitted for ordinary pickup. */
  pickup_type?: 2 | 3;
  schedule_type: "scheduled";
}

export interface NearbyStopsOptions {
  /** Metres. Default 1000, range 50 to 10000. */
  radius?: number;
  /** Default 20, maximum 100. */
  limit?: number;
  signal?: AbortSignal;
}

export interface DepartureOptions {
  /** An instant. Date values serialize to ISO; strings must include Z or an offset. Default now. */
  at?: Date | string;
  /** Minutes after at. Default 60, maximum 240. */
  window?: number;
  /** Default 50, maximum 200. */
  limit?: number;
  signal?: AbortSignal;
}

export interface TransitOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  /**
   * Retry policy for `429`, `502`, `503` and transport failures. `false` disables it.
   *
   * On by default. `Retry-After` is on a `429` other than `billing_required`, and on a container
   * `503`. A `502` has none: routing and `/elevation` both use
   * `upstream_error`. With no header the client backs off itself. A wait longer than
   * `maxDelayMs` (10 s) is not slept through; the error carries `retryAfterSeconds` instead.
   * See `RetryPolicy` in `@unmap/core`.
   */
  retry?: RetryPolicy | false;
}

/**
 * A transit failure.
 *
 * Extends `UnmapError`, so `catch (e) { if (e instanceof UnmapError) }` catches this alongside
 * every other unmap client's errors. `status` and `code` carry the HTTP status and the
 * gateway's error code, and `retryAfterSeconds` comes from the `Retry-After` header.
 */
export class TransitError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "TransitError";
  }
}

/**
 * The gateway's error body, as a `TransitError`.
 *
 * Named rather than inline since 2026-09-20: `fetchWithRetry` needs to inspect the failure to
 * decide whether to wait, and the throw needs to build the same error. Two copies of this would
 * be two chances for the retry predicate and the thrown error to disagree.
 */
async function errorFrom(res: Response, path: string): Promise<TransitError> {
  let body: { error?: unknown; code?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* use the bounded fallback */
  }
  const message = typeof body.error === "string" ? body.error : `transit ${res.status} on ${path}`;
  const code = typeof body.code === "string" ? body.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;
  return new TransitError(res.status, message, code, retryAfter);
}

/** Static Canadian GTFS data. Scheduled departures ship before realtime. */
export class Transit {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: TransitOptions) {
    this.retry = opts.retry;
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  agencies(signal?: AbortSignal): Promise<TransitResponse<TransitAgency[]>> {
    return this.get("/transit/agencies", undefined, signal);
  }

  nearbyStops(near: [number, number], options: NearbyStopsOptions = {}): Promise<TransitResponse<TransitStop[]>> {
    return this.get("/transit/stops", {
      near: near.join(","),
      radius: options.radius,
      limit: options.limit,
    }, options.signal);
  }

  getStop(id: string, signal?: AbortSignal): Promise<TransitResponse<TransitStop>> {
    return this.get(`/transit/stops/${encodeURIComponent(id)}`, undefined, signal);
  }

  getRoute(id: string, signal?: AbortSignal): Promise<TransitResponse<TransitRoute>> {
    return this.get(`/transit/routes/${encodeURIComponent(id)}`, undefined, signal);
  }

  departures(id: string, options: DepartureOptions = {}): Promise<TransitResponse<TransitDeparture[]>> {
    return this.get(`/transit/stops/${encodeURIComponent(id)}/departures`, {
      at: options.at instanceof Date ? options.at.toISOString() : options.at,
      window: options.window,
      limit: options.limit,
    }, options.signal);
  }

  private async get<T>(
    path: string,
    values?: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<TransitResponse<T>> {
    const query = new URLSearchParams({ key: this.key });
    for (const [name, value] of Object.entries(values ?? {})) {
      if (value !== undefined) query.set(name, String(value));
    }
    const response = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${query}`,
      { signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!response.ok) throw await errorFrom(response, path);
    return await response.json() as TransitResponse<T>;
  }
}
