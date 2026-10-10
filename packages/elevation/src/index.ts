import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/** [longitude, latitude]. Longitude first, everywhere in unmap. Not exported: `@unmap/routing`
 *  already exports a `LngLat` of the same shape, and both packages land in `@unmap/sdk`'s star
 *  exports, where two same-named exports would be a type error. */
type LngLat = [number, number];

export interface ElevationOptions {
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

/** The gateway's own cap. Checked here so an over-long batch fails without spending a call. */
export const MAX_ELEVATION_POINTS = 1000;

/**
 * Cloudflare refuses a request URL longer than this at the edge, before the Worker runs.
 *
 * It bites well before `MAX_ELEVATION_POINTS` does. `URLSearchParams` percent-encodes both of
 * the batch separators (`,` becomes `%2C`, `|` becomes `%7C`), so a coordinate costs about six
 * bytes more than it reads, and a thousand six-decimal points is roughly 22 KB of URL. Past the
 * limit the request never reaches the gateway: the caller gets an edge 414 with no error
 * envelope to explain it, which is the least legible failure in the system. So the check is
 * here, against the real encoded URL, and the message says what actually fits.
 */
export const MAX_REQUEST_URL_BYTES = 16384;

/** Headroom under the edge limit, so a proxy that appends a parameter cannot tip a request over. */
const URL_HEADROOM_BYTES = 256;

/**
 * An elevation failure.
 *
 * Extends `UnmapError`, so `catch (e) { if (e instanceof UnmapError) }` catches this alongside
 * every other unmap client's errors. `status` and `code` carry the HTTP status and the
 * gateway's error code, and `retryAfterSeconds` comes from the `Retry-After` header.
 */
export class ElevationError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "ElevationError";
  }
}

interface ElevationResponse {
  elevations: (number | null)[];
  units: "m";
  datum: string;
  resolution: number | null;
  model?: "mixed";
  sampling?: { zoom: number; tile_size: number; height_increment_m: number; interpolation: "bilinear" };
}

/**
 * Typed client for the unmap elevation API (gateway `/elevation`).
 *
 * Heights are metres in the active DEM's vertical datum. The global Mapterhorn mosaic mixes
 * terrain/surface models and vertical datums; Canadian rollback uses CGVD2013. `null` means
 * missing data, and the client does not substitute a number for it. See /coverage.json and
 * the HTTP response's metadata for the active release and its limitations.
 */
export class Elevation {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: ElevationOptions) {
    this.retry = opts.retry;
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    // Bound to globalThis for the same reason Router does it: a bare `fetch` stored on an
    // instance is invoked with that instance as its receiver, which browsers reject.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * DEM elevation in metres, one entry per coordinate, in the order asked.
   *
   * Always an array, whether you passed one coordinate or a thousand, so the single and batch
   * cases are the same call:
   *
   *   const [metres] = await unmap.elevation.get([-114.0719, 51.0447]);
   */
  async get(
    points: LngLat | LngLat[],
    opts: { signal?: AbortSignal } = {},
  ): Promise<(number | null)[]> {
    const list: LngLat[] = isSingle(points) ? [points] : points;
    if (list.length === 0) return [];
    if (list.length > MAX_ELEVATION_POINTS) {
      throw new ElevationError(400, `elevation.get takes at most ${MAX_ELEVATION_POINTS} coordinates`);
    }

    const q = new URLSearchParams({ key: this.key });
    if (list.length === 1) {
      // Safe: the length check above guarantees index 0 exists. Only lng,lat go on the wire, as in
      // the batch branch, so a GeoJSON position with an altitude still works.
      const [lng, lat] = list[0]!;
      q.set("near", `${lng},${lat}`);
    } else {
      q.set("points", list.map(([lng, lat]) => `${lng},${lat}`).join("|"));
    }

    const target = `${this.base}/elevation?${q}`;
    const bytes = new TextEncoder().encode(target).length;
    const budget = MAX_REQUEST_URL_BYTES - URL_HEADROOM_BYTES;
    if (bytes > budget) {
      // Scaled from the URL actually built, so the number quoted reflects this caller's own
      // coordinate precision rather than an average of somebody else's.
      const fits = Math.max(1, Math.floor((list.length * budget) / bytes));
      throw new ElevationError(
        414,
        `elevation.get built a ${bytes} byte request URL; this client sends at most ${budget} ` +
          `bytes, keeping headroom under the edge's ${MAX_REQUEST_URL_BYTES} byte limit. Send ` +
          `at most about ${fits} of these coordinates per request (roughly 700 at six decimal ` +
          `places).`,
      );
    }

    const res = await fetchWithRetry(
      this.fetchImpl,
      target,
      { signal: opts.signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res);
    const body = (await res.json()) as ElevationResponse;
    return body.elevations;
  }
}

/** `[number, number]` is a coordinate; `[[number, number], ...]` is a list of them. */
function isSingle(points: LngLat | LngLat[]): points is LngLat {
  return typeof points[0] === "number";
}

async function errorFrom(res: { status: number; headers?: Headers; json(): Promise<unknown> }): Promise<ElevationError> {
  const fallback = `elevation ${res.status}`;
  let body: { error?: unknown; code?: unknown } | undefined;
  try {
    body = (await res.json()) as { error?: unknown; code?: unknown };
  } catch {
    body = undefined;
  }
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;
  return new ElevationError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter);
}

// The shared error type and retry policy, re-exported so a caller who installed only this
// package can `catch (e) { if (e instanceof UnmapError) }` without adding @unmap/core.
export { UnmapError, parseRetryAfter, type RetryPolicy } from "@unmap/core";
