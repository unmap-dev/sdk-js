import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/**
 * Typed clients for road events (`/incidents`, `/closures`, `/road-conditions`) and for data
 * correction (`POST /feedback`).
 *
 * These live in `@unmap/sdk` rather than in packages of their own. A twelfth and thirteenth npm
 * package would each need an entry in the changesets fixed group and a trusted publisher
 * configured on npmjs.com, which is founder work, and neither has a framework wrapper the way
 * geocoding and routing do. If a customer ever wants roads without the rest of the SDK, that is
 * the moment to split it out.
 */

export type RoadEventType =
  | "closure"
  | "incident"
  | "construction"
  | "weather"
  | "restriction"
  | "ferry"
  | "hazard"
  | "special_event"
  | "unknown";

export type RoadCondition =
  | "dry"
  | "wet"
  | "snow"
  | "ice"
  | "packed_snow"
  | "reduced_visibility"
  | "travel_not_recommended"
  | "closed"
  | "unknown";

export type RoadSeverity = "minor" | "major" | "unknown";

export interface AffectedRoad {
  name: string;
  direction: "north" | "south" | "east" | "west" | "both" | "unknown";
  /** True only when the publisher says closed. Never inferred from the description. */
  closed: boolean;
  from?: string;
  to?: string;
  condition: RoadCondition;
}

export interface RoadEvent {
  /** `um:road:<jurisdiction>:<publisher id>`. */
  id: string;
  /** The publisher's own id, so a report can be taken back to them. */
  source_id: string;
  /** ISO 3166-2, e.g. `CA-BC`. */
  jurisdiction: string;
  type: RoadEventType;
  /** The publisher's own subtype strings, untranslated. */
  subtypes: string[];
  status: "active" | "planned" | "archived";
  severity: RoadSeverity;
  /**
   * The publisher's description, verbatim.
   *
   * Believe this over `type` when they disagree: our categories are a lossy projection of someone
   * else's taxonomy, and the sentence a driver needs is in the prose.
   */
  description: string;
  headline?: string;
  /** The worst surface condition across this event's roads. */
  condition: RoadCondition;
  roads: AffectedRoad[];
  /** GeoJSON Point or LineString, WGS84. */
  geometry: { type: string; coordinates: unknown } | null;
  starts_at: string | null;
  ends_at: string | null;
  source_updated_at: string | null;
  unmap_updated_at: string;
  source: string;
}

export interface RoadEventsResponse {
  data: RoadEvent[];
  meta: {
    status: "current" | "stale" | "partial" | "unknown";
    attribution: string;
    unmap_updated_at: string;
    /**
     * Jurisdictions that could not be reached, each with a reason.
     *
     * **Check this.** On `/closures` an empty `data` reads as "nothing is shut" to someone
     * deciding whether to drive, and that is a very different answer from "we could not reach
     * British Columbia".
     */
    unavailable?: { jurisdiction: string; reason: string }[];
    /**
     * Feeds served from unmap's five-minute poll rather than fetched for this request (Alberta),
     * each with its age. A feed older than `max_age_seconds` is in `unavailable` instead.
     */
    polled?: {
      jurisdiction: string;
      feed: "events" | "conditions";
      polled_at: string;
      age_seconds: number;
      max_age_seconds: number;
    }[];
  };
}

export interface RoadEventQuery {
  /** Comma-separated ISO 3166-2 codes, or an array. An uncovered code is a 400, not an empty list. */
  jurisdiction?: string | readonly string[];
  bbox?: [number, number, number, number];
  near?: [number, number];
  /** Metres from `near`. Default 25000, max 500000. */
  radius?: number;
  type?: RoadEventType | readonly RoadEventType[];
  severity?: RoadSeverity | readonly RoadSeverity[];
  status?: "active" | "planned" | "archived";
  /** ISO 8601. Only events the publisher changed at or after this time. */
  updated_since?: string;
  /** 1 to 500, default 100. Applied AFTER the endpoint's own narrowing. */
  limit?: number;
  signal?: AbortSignal;
}

export interface RoadsOptions {
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
 * A road events failure.
 *
 * Extends `UnmapError`, so `catch (e) { if (e instanceof UnmapError) }` catches this alongside
 * every other unmap client's errors. `status` and `code` carry the HTTP status and the
 * gateway's error code, and `retryAfterSeconds` comes from the `Retry-After` header.
 */
export class RoadsError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "RoadsError";
  }
}

function list(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(",") : String(value);
}

async function errorFrom(res: Response, path: string, name: string): Promise<RoadsError> {
  const fallback = `${name} ${res.status} on ${path}`;
  let body: { error?: unknown; code?: unknown } | undefined;
  try {
    body = (await res.json()) as { error?: unknown; code?: unknown };
  } catch {
    body = undefined;
  }
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;
  return new RoadsError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter);
}

/**
 * Canadian road events.
 *
 *   const { data, meta } = await unmap.roads.closures({ jurisdiction: "CA-BC" });
 *
 * A 503 means every requested jurisdiction was unreachable; the body still carries
 * `meta.unavailable`, so the thrown error is the exception rather than the information. Prefer
 * reading `meta.unavailable` on a 200 over treating an empty list as good news.
 */
export class Roads {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: RoadsOptions) {
    this.retry = opts.retry;
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Every current road event. */
  incidents(query: RoadEventQuery = {}): Promise<RoadEventsResponse> {
    return this.request("/incidents", query);
  }

  /** The subset where a road is actually shut. Narrowed before `limit` is applied. */
  closures(query: RoadEventQuery = {}): Promise<RoadEventsResponse> {
    return this.request("/closures", query);
  }

  /**
   * The subset carrying a surface condition.
   *
   * Thin for British Columbia by design: its feed reports lane availability rather than the
   * surface, so unmap answers `unknown` instead of inferring a dry road from open lanes.
   */
  conditions(query: RoadEventQuery = {}): Promise<RoadEventsResponse> {
    return this.request("/road-conditions", query);
  }

  private async request(path: string, query: RoadEventQuery): Promise<RoadEventsResponse> {
    const q = new URLSearchParams({ key: this.key });
    const params: Record<string, string | undefined> = {
      jurisdiction: list(query.jurisdiction),
      bbox: query.bbox?.join(","),
      near: query.near?.join(","),
      radius: query.radius != null ? String(query.radius) : undefined,
      type: list(query.type),
      severity: list(query.severity),
      status: query.status,
      updated_since: query.updated_since,
      limit: query.limit != null ? String(query.limit) : undefined,
    };
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, v);

    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${q}`,
      { signal: query.signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res, path, "roads");
    return (await res.json()) as RoadEventsResponse;
  }
}

// ---------------------------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------------------------

export type FeedbackProduct =
  | "tiles"
  | "terrain"
  | "names"
  | "geocoding"
  | "places"
  | "routing"
  | "layers"
  | "transit"
  | "roads"
  | "ev";

export type FeedbackCategory =
  | "incorrect_location"
  | "incorrect_address"
  | "missing_place"
  | "wrong_place_name"
  | "wrong_category"
  | "bad_route"
  | "missing_road_closure"
  | "incorrect_road_condition"
  | "incorrect_transit_result"
  | "other";

export interface FeedbackReport {
  product: FeedbackProduct;
  category: FeedbackCategory;
  /** Up to 2000 characters, stored exactly as written. One of this or `resultId` is required. */
  description?: string;
  /** The unmap id of the result being reported. */
  resultId?: string;
  /**
   * The request being reported.
   *
   * **Only send this with the reporter's explicit agreement.** The gateway refuses it without
   * `include_context: true`, which this sets whenever `context` is present, and that flag is
   * meant to record a person's choice rather than a client default. unmap redacts query strings
   * from its own logs; a client that attached them here would undo that.
   */
  context?: unknown;
  signal?: AbortSignal;
}

export interface FeedbackReceipt {
  /** Quote this in a follow-up. */
  id: string;
  status: string;
  created_at: string;
  /** Whether a request context was actually kept. `false` when none was offered. */
  context_stored: boolean;
}

/**
 * Report wrong data.
 *
 *   await unmap.feedback.submit({
 *     product: "geocoding",
 *     category: "incorrect_location",
 *     description: "17 Ave SW returns a street in Edmonton.",
 *   });
 *
 * Authenticated like everything else and **never metered**: telling us our data is wrong does not
 * cost a call. At most 200 reports per account per day.
 */
export class Feedback {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RoadsOptions) {
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  submit(report: FeedbackReport): Promise<FeedbackReceipt> {
    return this.post("/feedback", {
      product: report.product,
      category: report.category,
      ...(report.description ? { description: report.description } : {}),
      ...(report.resultId ? { result_id: report.resultId } : {}),
      ...(report.context !== undefined ? { include_context: true, context: report.context } : {}),
    }, report.signal);
  }

  /** A report about one place. `product` and `result_id` come from the path. */
  aboutPlace(
    placeId: string,
    report: Omit<FeedbackReport, "product" | "resultId">,
  ): Promise<FeedbackReceipt> {
    return this.post(`/places/${encodeURIComponent(placeId)}/feedback`, {
      category: report.category,
      ...(report.description ? { description: report.description } : {}),
      ...(report.context !== undefined ? { include_context: true, context: report.context } : {}),
    }, report.signal);
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<FeedbackReceipt> {
    // Deliberately NOT routed through `fetchWithRetry`, unlike every read on this client.
    //
    // A feedback submission creates a record and carries no idempotency key, so a retry after a
    // timeout or a 503 risks filing the same report twice. Retrying a read costs a round trip;
    // retrying this costs the quality programme a duplicate, and the caller is the only one who
    // knows whether their report already landed.
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await errorFrom(res, path, "feedback");
    return (await res.json()) as FeedbackReceipt;
  }
}
