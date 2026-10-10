import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/** The one path this client calls. A literal so the gateway's SDK-parity audit can see it. */
const TIMEZONE_PATH = "/timezone";

export interface TimezoneResult {
  timezone: string | null;
  offset: string | null;
  offsetSeconds: number | null;
  dst: boolean | null;
}

export interface TimezoneLookupOptions {
  /** Instant the offset is evaluated at. Omit it for the current time. */
  at?: Date;
  signal?: AbortSignal;
}

export class TimezoneError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "TimezoneError";
  }
}

export interface TimezoneOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  retry?: RetryPolicy | false;
}

/**
 * IANA timezone for a coordinate.
 *
 *   const zone = await unmap.timezone.lookup([-114.0719, 51.0447]);
 *
 * The coordinate is `[longitude, latitude]`, the same order as the rest of the SDK.
 * `at` selects the offset. It does not change which zone the coordinate falls in.
 */
export class Timezone {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: TimezoneOptions) {
    this.retry = opts.retry;
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async lookup(coordinate: [number, number], opts: TimezoneLookupOptions = {}): Promise<TimezoneResult> {
    const [lon, lat] = coordinate;
    const q = new URLSearchParams({ key: this.key, lon: String(lon), lat: String(lat) });
    if (opts.at) q.set("at", opts.at.toISOString());
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${TIMEZONE_PATH}?${q}`,
      { signal: opts.signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as TimezoneResult;
  }
}

async function errorFrom(res: Response): Promise<TimezoneError> {
  const retryAfter = parseRetryAfter(res.headers?.get?.("retry-after") ?? null) ?? undefined;
  let message = res.statusText || `timezone ${res.status}`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    if (typeof body.error === "string" && body.error) message = body.error;
    if (typeof body.code === "string") code = body.code;
  } catch {
    /* a non-JSON failure still carries the status */
  }
  return new TimezoneError(res.status, message, code, retryAfter);
}
