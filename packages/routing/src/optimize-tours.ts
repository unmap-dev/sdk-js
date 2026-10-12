import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";
import type { OptimizeToursRequest, OptimizeToursResponse } from "@unmap/optimize-schema";

export type {
  OptimizeToursRequest,
  OptimizeToursResponse,
  ShipmentModel as OptimizeShipmentModel,
  Shipment as OptimizeShipment,
  Vehicle as OptimizeVehicle,
  ShipmentRoute as OptimizeShipmentRoute,
  SkippedShipment as OptimizeSkippedShipment,
} from "@unmap/optimize-schema";

export interface OptimizeToursOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  /**
   * Retry policy for `429`, `502`, `503` and transport failures. `false` disables it. A failed
   * solve is never billed, so a retry costs nothing, but a solve that is still running when the
   * connection drops is not cancelled: it holds one of your plan's concurrent solves until it ends.
   * See `RetryPolicy` in `@unmap/core`.
   */
  retry?: RetryPolicy | false;
  signal?: AbortSignal;
}

/**
 * One entry of the `X-Unmap-Optimize-Warnings` header: a field Unmap accepted but cannot honour,
 * a clamped timeout, road travel the routing budget decided, or a route polyline that could not be
 * drawn. A final `WARNINGS_TRUNCATED` entry counts any that did not fit the header.
 */
export interface OptimizeToursWarning {
  code: string;
  field?: string;
  path?: string;
  count?: number;
  message: string;
}

/**
 * What `optimizeTours()` resolves with.
 *
 * `response` is Google's `OptimizeToursResponse`, exactly as the gateway sent it: Unmap never adds
 * a field to it, so code written against Google's response shape reads `response` unchanged. What
 * Unmap knows beyond that arrives in the response headers and is parsed here, beside it.
 */
export interface OptimizeToursResult {
  response: OptimizeToursResponse;
  /** Parsed `X-Unmap-Optimize-Warnings`. Empty when there were none or the header was unreadable. */
  warnings: OptimizeToursWarning[];
  /**
   * Parsed `X-Unmap-Billable-Shipments`: the shipments this request billed. `0` for
   * `VALIDATE_ONLY`, a free re-solve within 24 hours, and when the header is absent. A dev origin
   * is billed like any other.
   */
  billableShipments: number;
  /** True when your `timeout` was over the plan's cap and the gateway shortened it. */
  timeoutClamped: boolean;
  /** The timeout the solve ran with, in seconds, when `timeoutClamped`; otherwise `null`. */
  clampedTimeoutSeconds: number | null;
}

/** One Google `Status.details` entry (`google.rpc.BadRequest`, `PreconditionFailure`, `RetryInfo`, ...). */
export interface OptimizeToursErrorDetail {
  "@type"?: string;
  [key: string]: unknown;
}

/**
 * An Unmap Optimize failure.
 *
 * Extends `UnmapError`, so `instanceof UnmapError` catches it with every other unmap client's
 * errors. `status` is the HTTP status, `code` the gateway's string code (`bad_request`,
 * `rate_limited`, `quota_exceeded`, ...), and `retryAfterSeconds` comes from `Retry-After`.
 * `googleStatus` is Google's RPC status name (`INVALID_ARGUMENT`, `FAILED_PRECONDITION`, ...) and
 * `details` Google's `error.details`: a `google.rpc.BadRequest` lists each field violation, and a
 * `PreconditionFailure` lists the mandatory shipments no vehicle can serve. A response that is
 * not Google-shaped (the gateway's plain `404` when Optimize is not enabled) has no
 * `googleStatus` and an empty `details`.
 */
export class UnmapOptimizeError extends UnmapError {
  constructor(
    status: number,
    message: string,
    code?: string,
    retryAfterSeconds?: number,
    readonly googleStatus?: string,
    readonly details: OptimizeToursErrorDetail[] = [],
  ) {
    super(status, message, code, retryAfterSeconds);
    this.name = "UnmapOptimizeError";
  }
}

async function optimizeErrorFrom(res: { status: number; headers?: Headers; json(): Promise<unknown> }): Promise<UnmapOptimizeError> {
  const fallback = `optimize ${res.status} on /optimize`;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const top = (typeof body === "object" && body !== null ? body : {}) as { error?: unknown; code?: unknown };
  const code = typeof top.code === "string" ? top.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;

  let reason: string | undefined;
  let googleStatus: string | undefined;
  let details: OptimizeToursErrorDetail[] = [];
  if (typeof top.error === "string") {
    reason = top.error;
  } else if (typeof top.error === "object" && top.error !== null) {
    const g = top.error as { message?: unknown; status?: unknown; details?: unknown };
    if (typeof g.message === "string") reason = g.message;
    if (typeof g.status === "string") googleStatus = g.status;
    if (Array.isArray(g.details)) {
      details = g.details.filter((d): d is OptimizeToursErrorDetail => typeof d === "object" && d !== null);
    }
  }
  return new UnmapOptimizeError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter, googleStatus, details);
}

function parseWarnings(header: string | null): OptimizeToursWarning[] {
  if (!header) return [];
  try {
    const parsed: unknown = JSON.parse(header);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is OptimizeToursWarning =>
        typeof w === "object" && w !== null && typeof (w as { code?: unknown }).code === "string" && typeof (w as { message?: unknown }).message === "string",
    );
  } catch {
    return [];
  }
}

function parseBillable(header: string | null): number {
  if (!header || !/^[0-9]+$/.test(header.trim())) return 0;
  return Number(header.trim());
}

function parseClamp(header: string | null): number | null {
  const m = header ? /timeout clamped to (\d+)s/.exec(header) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Assign shipments to vehicles and order their visits (Unmap Optimize, `POST /optimize`).
 *
 * The request and the `response` are Google Route Optimization's `OptimizeToursRequest` and
 * `OptimizeToursResponse`. Unmap's own findings (warnings, the shipments billed) are returned
 * beside the response, never inside it.
 *
 *   const { response } = await optimizeTours(request, { key: "um_live_..." });
 *
 * The key is sent in `X-API-Key`, not in the URL. Billed per shipment performed; see
 * `billableShipments`. A failure throws `UnmapOptimizeError`.
 */
export async function optimizeTours(request: OptimizeToursRequest, opts: OptimizeToursOptions): Promise<OptimizeToursResult> {
  const base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
  const path = "/optimize";
  // Bound to globalThis: a bare `fetch` stored on an object is rejected by browsers with
  // "Illegal invocation" when called with that object as the receiver.
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const res = await fetchWithRetry(
    fetchImpl,
    `${base}${path}`,
    {
      method: "POST",
      signal: opts.signal,
      headers: { accept: "application/json", "content-type": "application/json", "x-api-key": opts.key },
      body: JSON.stringify(request),
    },
    opts.retry,
  );
  if (!res.ok) throw await optimizeErrorFrom(res);
  let response: OptimizeToursResponse;
  try {
    response = (await res.json()) as OptimizeToursResponse;
  } catch {
    // A proxy or a captive portal can answer 200 with HTML; callers catch one error type.
    throw new UnmapOptimizeError(res.status, `optimize ${res.status} on /optimize: the response body is not JSON`);
  }
  const clamped = parseClamp(res.headers?.get("warning") ?? null);
  return {
    response,
    warnings: parseWarnings(res.headers?.get("x-unmap-optimize-warnings") ?? null),
    billableShipments: parseBillable(res.headers?.get("x-unmap-billable-shipments") ?? null),
    timeoutClamped: clamped !== null,
    clampedTimeoutSeconds: clamped,
  };
}
