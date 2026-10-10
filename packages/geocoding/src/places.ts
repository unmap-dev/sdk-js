import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/**
 * Typed client for the Places API (gateway `/places/*`).
 *
 * It lives in `@unmap/geocoding` rather than in a package of its own because places ARE the
 * geocoding corpus: the same rows, the same container, the same taxonomy. A twelfth npm package
 * would also mean a twelfth entry in the changesets fixed group and a twelfth trusted publisher
 * to configure, which is real founder work for no boundary that exists in the code.
 *
 * `Geocoder.nearby()` is untouched and still answers in the geocoder's own shape. This is the
 * Place shape over the same rows.
 */

/** A Canadian point of interest, as `/places/*` returns it. */
export interface Place {
  /** `um:place:<id>`. Opaque: a corpus rebuild may renumber the tail, so do not parse it. */
  id: string;
  /** The corpus id, for `POST /places/{id}/feedback`. */
  source_id: string;
  name: string;
  /** Every language and alternate spelling the corpus holds, including syllabics where recorded. */
  names: Record<string, string>;
  /** Taxonomy id, e.g. `finance.bank`. */
  category: string | null;
  /** The part before the dot, e.g. `finance`. */
  category_group: string | null;
  /** `[lng, lat]`, WGS84. */
  coordinates: [number, number];
  address: {
    housenumber?: string;
    street?: string;
    city?: string;
    region?: string;
    postcode?: string;
    country?: string;
  };
  /** Metres from the anchor. Only on `nearby()`. */
  distance?: number;
  /** Registry id of the dataset, for provenance. */
  source: string;
}

/**
 * The envelope `/places/*` answers in.
 *
 * `meta` is deliberately surfaced rather than unwrapped away: a caller that cannot see
 * `attribution` cannot comply with the licence the data came under, and one that cannot see
 * `status` cannot tell fresh data from stale.
 */
export interface PlacesResponse<T> {
  data: T;
  meta: {
    status: "current" | "stale" | "partial" | "unknown";
    attribution: string;
    unmap_updated_at: string;
    source?: string;
    source_updated_at?: string | null;
  };
}

export interface PlacesOptions {
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

export interface PlaceSearchOptions {
  limit?: number;
  lang?: string;
  /**
   * [minLng, minLat, maxLng, maxLat] hard filter. Excludes; name the city in the query to merely prefer.
   * A corner outside WGS84 is status 400, code `bad_request`. A box outside Canada stays a filter.
   */
  bbox?: [number, number, number, number];
  signal?: AbortSignal;
}

export interface PlaceNearbyOptions {
  /** `[lng, lat]`. Exactly one of `near` or `bbox`. */
  near?: [number, number];
  bbox?: [number, number, number, number];
  /** Metres, clamped server-side to 50..50000. */
  radius?: number;
  limit?: number;
  lang?: string;
  signal?: AbortSignal;
}

/**
 * A places failure.
 *
 * Extends `UnmapError`, so `catch (e) { if (e instanceof UnmapError) }` catches this alongside
 * every other unmap client's errors. `status` and `code` carry the HTTP status and the
 * gateway's error code, and `retryAfterSeconds` comes from the `Retry-After` header.
 */
export class PlacesError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "PlacesError";
  }
}

async function errorFrom(res: Response, path: string): Promise<PlacesError> {
  const fallback = `places ${res.status} on ${path}`;
  let body: { error?: unknown; code?: unknown } | undefined;
  try {
    body = (await res.json()) as { error?: unknown; code?: unknown };
  } catch {
    body = undefined;
  }
  // The gateway's `error` says what went wrong in words. Putting it in the message means a caller
  // who logs the thrown error reads the reason rather than just a status.
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;
  return new PlacesError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter);
}

/**
 * Canadian places.
 *
 *   const places = new Places({ key: "um_live_..." });
 *   const { data } = await places.nearby("bakery", { near: [-114.07, 51.05] });
 *
 * ## Fields this does not carry
 *
 * No `phone`, `website`, `opening_hours`, `accessibility` or `operator`. The corpus does not hold
 * them, so they are ABSENT from the response rather than null: an absent key is a statement about
 * unmap's coverage and is true, while `"phone": null` would be a statement about the place and
 * usually a false one. The types above reflect that rather than declaring optional fields nothing
 * ever populates.
 */
export class Places {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: PlacesOptions) {
    this.retry = opts.retry;
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    // Bound to globalThis for the same reason `Geocoder` does it: a bare `fetch` stored on an
    // instance is invoked with the instance as its receiver, and browsers reject that with
    // "Illegal invocation". Node is lenient, so it only ever surfaces in a browser.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Search places by name.
   *
   * Unlike `Geocoder.search()`, which returns whatever best matches and for "Calgary" is the city
   * itself, this returns places. A missing query is 400 `bad_request` (`q is required`). A bbox
   * corner outside WGS84 is the same status and code. A box outside Canada stays a filter.
   */
  search(q: string, opts: PlaceSearchOptions = {}): Promise<PlacesResponse<Place[]>> {
    return this.request<Place[]>("/places/search", {
      q,
      limit: opts.limit != null ? String(opts.limit) : undefined,
      lang: opts.lang,
      bbox: opts.bbox?.join(","),
    }, opts.signal);
  }

  /**
   * Places of a category near a point.
   *
   * `category` takes a taxonomy id (`health.pharmacy`) or a word in English or French
   * (`pharmacy`, `pharmacie`); the gateway resolves aliases, so `"boulangerie"` works. An anchor
   * outside Canada rejects with status 422 and code `outside_coverage`. A longitude or latitude
   * outside WGS84, including a bbox corner, rejects with status 400 and code `bad_request`.
   */
  nearby(
    category: string | readonly string[],
    opts: PlaceNearbyOptions = {},
  ): Promise<PlacesResponse<Place[]>> {
    return this.request<Place[]>("/places/nearby", {
      category: Array.isArray(category) ? category.join(",") : String(category),
      near: opts.near?.join(","),
      bbox: opts.bbox?.join(","),
      radius: opts.radius != null ? String(opts.radius) : undefined,
      limit: opts.limit != null ? String(opts.limit) : undefined,
      lang: opts.lang,
    }, opts.signal);
  }

  /**
   * One place by its unmap id.
   *
   * Throws `PlacesError` with status 404 when it does not exist. A malformed id is also a 404,
   * because from a caller's side "does not exist" and "is not a well-formed id" are the same
   * answer; the gateway's message distinguishes them as far as it honestly can.
   */
  get(id: string, opts: { lang?: string; signal?: AbortSignal } = {}): Promise<PlacesResponse<Place>> {
    return this.request<Place>(`/places/${encodeURIComponent(id)}`, { lang: opts.lang }, opts.signal);
  }

  private async request<T>(
    path: string,
    params: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlacesResponse<T>> {
    const q = new URLSearchParams({ key: this.key });
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, v);
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${q}`,
      { signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res, path);
    return (await res.json()) as PlacesResponse<T>;
  }
}
