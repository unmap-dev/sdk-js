import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/** The one path this client calls. A literal so the gateway's SDK-parity audit can see it. */
const GEOIP_PATH = "/geoip";

/** DB-IP City Lite is CC BY 4.0: show `text`, linked to `url`, wherever the result is used. */
export interface GeoIpAttribution {
  text: string;
  url: string;
}

/** An address the database lists. Accuracy is city level at best, often only the country. */
export interface GeoIpFound {
  /** The canonical form of the address that was looked up. */
  ip: string;
  found: true;
  /** ISO 3166-1 alpha-2. */
  country_code: string;
  country: string;
  /** `null` when the database has no region for the address. */
  region: string | null;
  /** `null` when the database has no city for the address. */
  city: string | null;
  /** `[longitude, latitude]`, the same order as the rest of the SDK. */
  coordinates: [number, number];
  accuracy: "city";
  release: string;
  attribution: GeoIpAttribution;
}

/**
 * A public address the database does not list, such as unassigned space. Private, loopback,
 * link-local and other reserved addresses are not this: like a malformed address, they throw
 * `GeoIpError` with status `400` and code `invalid_ip`.
 */
export interface GeoIpNotFound {
  ip: string;
  found: false;
  release: string;
  attribution: GeoIpAttribution;
}

export type GeoIpResult = GeoIpFound | GeoIpNotFound;

export interface GeoIpLocateOptions {
  signal?: AbortSignal;
}

export class GeoIpError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "GeoIpError";
  }
}

export interface GeoIpOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  retry?: RetryPolicy | false;
}

/**
 * City-level location for an IP address, worldwide.
 *
 *   const here = await unmap.geoip.locate();            // the caller's own address
 *   const google = await unmap.geoip.locate("8.8.8.8");
 *
 * Omit the address to look up the machine making the request. From a browser that is the
 * visitor; from a server it is the server. Show `attribution` wherever you use the result.
 * A malformed, private or reserved address throws `GeoIpError` (`400`, `invalid_ip`); an
 * unavailable dataset throws one with status `503`.
 */
export class GeoIp {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: GeoIpOptions) {
    this.retry = opts.retry;
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async locate(ip?: string, opts: GeoIpLocateOptions = {}): Promise<GeoIpResult> {
    const q = new URLSearchParams({ key: this.key });
    if (ip !== undefined) q.set("ip", ip);
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${GEOIP_PATH}?${q}`,
      { signal: opts.signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as GeoIpResult;
  }
}

async function errorFrom(res: Response): Promise<GeoIpError> {
  const retryAfter = parseRetryAfter(res.headers?.get?.("retry-after") ?? null) ?? undefined;
  let message = res.statusText || `geoip ${res.status}`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    if (typeof body.error === "string" && body.error) message = body.error;
    if (typeof body.code === "string") code = body.code;
  } catch {
    /* a non-JSON failure still carries the status */
  }
  return new GeoIpError(res.status, message, code, retryAfter);
}
