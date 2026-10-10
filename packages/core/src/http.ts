/**
 * The transport every unmap client shares: one error type, one retry policy.
 *
 * Before this, six clients each declared their own `Error` subclass with the same three fields
 * and their own copy of "parse the body, pull out `error` and `code`". A caller could not write
 * `catch (e) { if (e instanceof UnmapError) }` at all: they had to enumerate `GeocoderError`,
 * `PlacesError`, `RouterError`, `ElevationError`, `RoadsError` and `TransitError`, and keep that
 * list current as the platform grew.
 *
 * It lives in `@unmap/core` because that package is already a dependency of every client and has
 * no dependencies of its own.
 */

/** How long the server said to wait, in seconds, or null when it said nothing usable. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  // RFC 9110 also allows an HTTP-date. Clamp at zero: a date in the past means "now".
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, (at - Date.now()) / 1000) : null;
}

/**
 * Every failure an unmap client throws.
 *
 * Per-product subclasses carry their own `name`, so `instanceof GeocoderError` narrows to
 * one product and `instanceof UnmapError` catches them all.
 */
export class UnmapError extends Error {
  constructor(
    /** HTTP status. `0` when the request never reached the server. */
    readonly status: number,
    message: string,
    /** The gateway's machine-readable code, when the body carried one. */
    readonly code?: string,
    /**
     * `Retry-After` in seconds, when the response carried one.
     *
     * Present on the failures worth waiting out, and the number is not decoration: a cold land
     * or energy container answers `60`, where geocode and routing answer `5`. A client that
     * guesses instead will hammer a booting container for a minute.
     */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "UnmapError";
  }

  /** Whether waiting and trying again could plausibly succeed. */
  get retryable(): boolean {
    return this.status === 429 || this.status === 502 || this.status === 503 || this.status === 0;
  }
}

export interface RetryPolicy {
  /** Total attempts including the first. `1` disables retrying. Default 3. */
  attempts?: number;
  /**
   * Longest `Retry-After` this client will wait out, in milliseconds. Default 10 000.
   *
   * A cap rather than an unbounded sleep, because the honest failure is better than the hidden
   * one: a cold `land` container asks for 60 seconds, and silently parking a caller's request
   * handler for a minute is a worse surprise than an error carrying `retryAfterSeconds: 60` for
   * them to schedule around. Raise it if your caller can afford to wait.
   */
  maxDelayMs?: number;
}

const DEFAULTS = { attempts: 3, maxDelayMs: 10_000 } as const;

/** Exponential backoff with full jitter, used only when the server named no delay itself. */
function backoffMs(attempt: number): number {
  const ceiling = Math.min(1000 * 2 ** (attempt - 1), 8000);
  return Math.random() * ceiling;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The statuses worth trying again. A 4xx other than 429 describes the request; repeating it only spends quota. */
function retryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503;
}

/**
 * Fetch, retrying the failures that are worth retrying, and honouring `Retry-After`.
 *
 * **Never reads the response body.** The retry decision needs a status and a header, nothing
 * more, and the body is the one part of a `Response` that can only be consumed once. Reading it
 * here would mean cloning, which would make `clone()` a requirement on every `opts.fetch` a
 * caller supplies -- and that option exists precisely so tests can pass a two-line stub. The
 * response comes back untouched and the caller builds its own error from it exactly as before.
 *
 * `headers` is read defensively for the same reason: a hand-written stub may not have one.
 */
export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  retry: RetryPolicy | false | undefined,
): Promise<Response> {
  const attempts = retry === false ? 1 : Math.max(1, retry?.attempts ?? DEFAULTS.attempts);
  const maxDelayMs = retry === false ? 0 : (retry?.maxDelayMs ?? DEFAULTS.maxDelayMs);

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch (cause) {
      // Never reached the server. An abort is the caller's own decision and is never retried.
      if (init.signal?.aborted || attempt === attempts) throw cause;
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok || attempt === attempts || !retryableStatus(res.status)) return res;

    const named = parseRetryAfter(res.headers?.get?.("retry-after") ?? null);
    const waitMs = named != null ? named * 1000 : backoffMs(attempt);
    // The server asked for longer than this client will wait. Hand the caller the response
    // rather than parking them: it still carries the header, and so will the thrown error.
    if (waitMs > maxDelayMs) return res;
    await sleep(waitMs);
  }
}
