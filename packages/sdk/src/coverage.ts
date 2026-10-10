import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/**
 * `GET /coverage.json` — where each capability actually works, and where it does not.
 *
 * The document is generated from the gateway's source registry rather than written by hand, so
 * it cannot claim a capability with no registered source behind it. It is also the only place
 * that answers "is transit routing live in this city" before you promise a user an answer:
 * routing covers only the feeds marked routing-ready, road events cover two provinces, and Places coverage is OpenStreetMap's,
 * which is thin outside cities.
 *
 * Unauthenticated and unmetered on the gateway, which is why this client takes no key: a
 * developer deciding whether to use unmap has no key yet, and a customer checking whether a gap
 * has closed should not pay a call to be told it has not.
 */

/** The one path this client calls. A literal so the gateway's SDK-parity audit can see it. */
const COVERAGE_PATH = "/coverage.json";

/** Freshness of a capability or a source. `unknown` means no cadence was declared. */
export type CoverageFreshness = "current" | "stale" | "unknown";

/** How a source's freshness is judged, mirrored from the gateway's `FreshnessPolicy`. */
export interface CoverageFreshnessPolicy {
  /** ISO 8601 duration, `static`, or `unknown`. */
  interval: string;
  basis: string;
  /** When `freshness_status` stops being true, or null when staleness cannot be asked. */
  stale_after: string | null;
}

/** Where a source's data came from and when unmap last produced it. */
export interface CoverageProvenance {
  source_updated_at: string | null;
  unmap_updated_at: string | null;
  build_id: string | null;
  version: string;
  content_hash: string | null;
  freshness_policy: CoverageFreshnessPolicy;
  freshness_status: CoverageFreshness;
  /** Counts the producing job measured. Omitted when it measured none. */
  measurements?: Record<string, number>;
}

export interface CoverageSource {
  id: string;
  provider: string;
  /** Bilingual, like every human-readable field in this document. */
  dataset_name: { en: string; fr: string };
  canonical_url: string;
  licence: { en: string; fr: string };
  licence_url: string;
  attribution: string;
  jurisdiction: string[];
  /** ISO 8601 duration, e.g. `P1D`. */
  refresh_interval: string;
  last_checked_at: string;
  /** Upstream's edition date, when unmap last produced the data, which build did, and how fresh that is. */
  provenance: CoverageProvenance;
  coverage: string;
  known_gaps: { en: string; fr: string };
  quality_status: string;
  /** A note on the source, in English, present only when there is one. */
  notes?: string;
}

export interface CoverageCapability {
  /** `tiles`, `geocoding`, `routing`, `places`, `transit`, `roads`, and so on. */
  id: string;
  display_name: { en: string; fr: string };
  /** `planned` is published as honestly as `live`: a capability absent from the page reads as "not our problem". */
  availability: "live" | "planned";
  /** The endpoints that serve it. Empty while planned. */
  endpoints: string[];
  coverage: { en: string; fr: string };
  /** Written to be accurate rather than flattering. Read this before promising coverage to a user. */
  known_gaps: { en: string; fr: string };
  /** ISO 3166-2 subdivisions, or `CA` for national. */
  jurisdictions: string[];
  freshness_status: CoverageFreshness;
  sources: CoverageSource[];
}

export interface CoverageDocument {
  generated_at: string;
  /** How to read the dates below, in both official languages. */
  freshness_basis: { en: string; fr: string };
  /** Schema tag of the manifests behind `provenance`, so a consumer can pin what it parses. */
  provenance_schema: string;
  capabilities: CoverageCapability[];
  /** Every jurisdiction code any source claims. */
  jurisdictions: string[];
}

export class CoverageError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "CoverageError";
  }
}

export interface CoverageOptions {
  gateway?: string;
  /** Override the fetch implementation (tests, non-global environments). */
  fetch?: typeof fetch;
  retry?: RetryPolicy | false;
}

/** Where unmap works. Takes no key: the endpoint is unauthenticated and unmetered. */
export class Coverage {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: CoverageOptions = {}) {
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.retry = opts.retry;
  }

  /** The whole document. Cached an hour at the edge, so polling it is cheap. */
  async get(opts: { signal?: AbortSignal } = {}): Promise<CoverageDocument> {
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${COVERAGE_PATH}`,
      { signal: opts.signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) {
      const retryAfter = parseRetryAfter(res.headers?.get?.("retry-after") ?? null) ?? undefined;
      throw new CoverageError(res.status, `coverage ${res.status}`, undefined, retryAfter);
    }
    return (await res.json()) as CoverageDocument;
  }

  /**
   * One capability by id, or `undefined` when the document does not describe it.
   *
   *   const transit = await unmap.coverage.capability("transit");
   *   if (!transit?.jurisdictions.includes("CA-ON")) return "not available here yet";
   */
  async capability(id: string, opts: { signal?: AbortSignal } = {}): Promise<CoverageCapability | undefined> {
    const doc = await this.get(opts);
    return doc.capabilities.find((c) => c.id === id);
  }
}
