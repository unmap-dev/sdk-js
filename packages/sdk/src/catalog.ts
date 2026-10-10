import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";

/**
 * Clients for the named Canadian layer catalog (`/layers`) and for tenant overlays (`/byod`).
 *
 * Both existed as endpoints with no client until the SDK parity audit
 * (`apps/gateway/test/sdk-parity.test.ts`) went looking and found them. They were the two entries
 * in that audit's `KNOWN_GAPS`; this closes both.
 *
 * ## Why these are the two that mattered
 *
 * `@unmap/maps` already consumes layer and overlay **tiles** through a style document, which is
 * why the gap was easy to miss: maps work. What had no client was everything *around* the tiles.
 * Nothing could ask what layers exist, what a layer's licence says, or which add-on it needs, and
 * nothing could upload an overlay without hand-rolling a multipart request.
 */

// ---------------------------------------------------------------------------------------------
// The named layer catalog
// ---------------------------------------------------------------------------------------------

export interface LayerArchive {
  id: string;
  minzoom: number;
  maxzoom: number;
}

/**
 * The capability a gated layer's tiles need. These are capability ids (`legalLand`), not the
 * `addon-*` SKUs a customer buys (`addon-legal-land`).
 */
export type LayerCapability = "legalLand" | "energy" | "agriculture" | "remote" | "mining";

/**
 * One catalog layer.
 *
 * `licence`, `attribution` and `known_gaps` are the reason to read this rather than hard-code a
 * layer id: they are the governance record, and a caller displaying a layer has to display its
 * attribution.
 */
export interface Layer {
  id: string;
  display_name: { en: string; fr: string };
  namespace?: "core" | "survey" | "energy" | "agriculture" | "remote" | "mining";
  /** ISO 3166 codes where coverage is VERIFIED. `coverage` carries the prose, including gaps. */
  jurisdiction?: string[];
  source?: string;
  source_url?: string;
  licence: string;
  attribution: string;
  coverage: string;
  resolution?: string;
  updated_at?: string;
  source_updated_at?: string;
  ingestion_version?: string;
  schema_version?: string;
  freshness_policy?: string;
  known_gaps?: string;
  /**
   * The capability this layer's tiles need, or null when it is core. Reading the catalog is never
   * gated; the tiles are, and answer `403` `addon_required` on a key without the add-on.
   */
  addon?: LayerCapability | null;
  archives?: LayerArchive[];
  /** Vector source-layer name inside the archive. */
  source_layer?: string;
  /** Every source-layer, present only when the archive stacks more than one (survey grids). */
  source_layers?: string[];
}

// ---------------------------------------------------------------------------------------------
// Tenant overlays (BYOD)
// ---------------------------------------------------------------------------------------------

export interface ByodOverlay {
  /** `ovl_` plus twelve hex characters. */
  id: string;
  name: string;
  kind: "geojson" | "pmtiles";
  bytes: number;
  createdAt: string;
  url: string;
  /** The `byod:<id>` token to pass to `overlays`. This is the field you actually want. */
  overlay: string;
}

export interface ByodList {
  overlays: ByodOverlay[];
  /** The caps, from the server rather than from a constant here that could drift. */
  limits: { maxFiles: number; maxBytes: number; kinds: string[] };
}

export interface CatalogOptions {
  key: string;
  gateway?: string;
  fetch?: typeof fetch;
  /**
   * Retry policy for reads (`429`, `502`, `503` and transport failures). `false` disables it.
   * Uploads and deletes are never retried. See `RetryPolicy` in `@unmap/core`.
   */
  retry?: RetryPolicy | false;
}

/**
 * A layer-catalog or overlay failure.
 *
 * Extends `UnmapError`, so `catch (e) { if (e instanceof UnmapError) }` catches it alongside every
 * other unmap client's errors. `code` is the gateway's: `not_found` for an unknown layer or
 * overlay id, `bad_request` for an upload the server refused (wrong type, over the size cap, or
 * over the overlay count).
 */
export class CatalogError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "CatalogError";
  }
}

async function errorFrom(res: Response, path: string): Promise<CatalogError> {
  const fallback = `catalog ${res.status} on ${path}`;
  let body: { error?: unknown; code?: unknown } | undefined;
  try {
    body = (await res.json()) as { error?: unknown; code?: unknown };
  } catch {
    body = undefined;
  }
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get?.("retry-after") ?? null) ?? undefined;
  return new CatalogError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter);
}

/** The pieces both clients share: the key, the base URL, fetch, and the read path. */
abstract class KeyedClient {
  protected readonly key: string;
  protected readonly base: string;
  protected readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: CatalogOptions) {
    this.key = opts.key;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.retry = opts.retry;
  }

  protected url(path: string, values?: Record<string, string | undefined>): string {
    const query = new URLSearchParams({ key: this.key });
    for (const [name, value] of Object.entries(values ?? {})) {
      if (value !== undefined) query.set(name, value);
    }
    return `${this.base}${path}?${query}`;
  }

  /** A GET, retried per the policy. Throws `CatalogError` on a non-2xx. */
  protected async read(path: string, init: RequestInit, values?: Record<string, string | undefined>): Promise<Response> {
    const res = await fetchWithRetry(this.fetchImpl, this.url(path, values), init, this.retry);
    if (!res.ok) throw await errorFrom(res, path);
    return res;
  }
}

/**
 * The named Canadian layer catalog.
 *
 *   const layers = await unmap.layers.list({ jurisdiction: "CA-AB" });
 *   const parcels = await unmap.layers.get("survey.dls");
 *   console.log(parcels.attribution, parcels.known_gaps);
 *
 * A retired or misspelled id is a plain `404` `not_found`, the same as one that never existed:
 * the gateway keeps no aliases for renamed layers.
 */
export class Catalog extends KeyedClient {
  /**
   * Every catalog layer, or only those with verified coverage in `jurisdiction`.
   *
   * A country code matches its own subdivisions (`CA` includes `CA-AB`). An unknown code is an
   * empty list, not an error: the catalog has nothing there.
   */
  async list(opts: { jurisdiction?: string; signal?: AbortSignal } = {}): Promise<Layer[]> {
    const res = await this.read(
      "/layers",
      { signal: opts.signal, headers: { accept: "application/json" } },
      { jurisdiction: opts.jurisdiction },
    );
    const body = (await res.json()) as { layers?: Layer[] } | Layer[];
    return Array.isArray(body) ? body : (body.layers ?? []);
  }

  /** One layer by id. Throws `CatalogError` 404 `not_found` when it does not exist. */
  async get(id: string, opts: { signal?: AbortSignal } = {}): Promise<Layer> {
    const res = await this.read(`/layers/${encodeURIComponent(id)}`, {
      signal: opts.signal,
      headers: { accept: "application/json" },
    });
    return (await res.json()) as Layer;
  }
}

/**
 * Tenant overlays: your own GeoJSON or PMTiles, stored against your key.
 *
 *   const { overlay } = await unmap.byod.upload(file, { name: "Service areas" });
 *   const map = new Unmap({ key, container: "#map", overlays: [overlay] });
 *
 * The `overlay` field on the result is the `byod:<id>` token: that is what `overlays` takes, not
 * the bare id, and returning the whole record rather than just the id is what makes that hard to
 * get wrong.
 *
 * Hard caps are the server's (10 overlays, 5 MiB each) and are reported by `list()` rather than
 * duplicated here, so a change on the server cannot leave a stale constant in the client.
 */
export class Byod extends KeyedClient {
  /** Overlays on this tenant, plus the server's current limits. */
  async list(opts: { signal?: AbortSignal } = {}): Promise<ByodList> {
    const res = await this.read("/byod", { signal: opts.signal, headers: { accept: "application/json" } });
    return (await res.json()) as ByodList;
  }

  /** One overlay's metadata. */
  async get(id: string, opts: { signal?: AbortSignal } = {}): Promise<ByodOverlay> {
    const res = await this.read(`/byod/${encodeURIComponent(id)}`, {
      signal: opts.signal,
      headers: { accept: "application/json" },
    });
    return (await res.json()) as ByodOverlay;
  }

  /**
   * Upload an overlay.
   *
   * Accepts a `Blob`/`File`, a `GeoJSON` object, or raw bytes. The content type is chosen from
   * what was passed rather than asked for: a plain object is GeoJSON, and anything binary is
   * PMTiles unless the caller says otherwise. Getting that wrong is a 400 from the server, so
   * inferring it here removes the most likely way to fail this call.
   *
   * Never retried: an upload mints a new overlay id and carries no idempotency key, so a retry
   * after a lost response would spend a second of the ten slots on a duplicate.
   */
  async upload(
    body: Blob | ArrayBuffer | Uint8Array | Record<string, unknown>,
    opts: { name?: string; kind?: "geojson" | "pmtiles"; signal?: AbortSignal } = {},
  ): Promise<ByodOverlay> {
    let payload: BodyInit;
    let contentType: string | undefined;
    let name: string | undefined;

    if (typeof Blob !== "undefined" && body instanceof Blob) {
      // A File carries its own name, which is a better default than anything we could invent.
      const form = new FormData();
      form.append("file", body);
      if (opts.name) form.append("name", opts.name);
      payload = form;
      // Deliberately unset: the runtime has to add the multipart boundary, and setting
      // content-type by hand produces a request the server cannot parse.
      contentType = undefined;
    } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      payload = body as BodyInit;
      contentType = opts.kind === "geojson" ? "application/geo+json" : "application/vnd.pmtiles";
      name = opts.name;
    } else {
      payload = JSON.stringify(body);
      contentType = "application/geo+json";
      name = opts.name;
    }

    const res = await this.fetchImpl(this.url("/byod", { name }), {
      method: "POST",
      signal: opts.signal,
      headers: contentType ? { "content-type": contentType } : undefined,
      body: payload,
    });
    if (!res.ok) throw await errorFrom(res, "/byod");
    return (await res.json()) as ByodOverlay;
  }

  /**
   * Delete an overlay.
   *
   * Never retried: a retry after a delete whose response was lost answers `404`, which would
   * report a failure for a delete that succeeded.
   */
  async delete(id: string, opts: { signal?: AbortSignal } = {}): Promise<void> {
    const path = `/byod/${encodeURIComponent(id)}`;
    const res = await this.fetchImpl(this.url(path), { method: "DELETE", signal: opts.signal });
    if (!res.ok) throw await errorFrom(res, path);
  }

  /** The stored bytes. GeoJSON parses; PMTiles is binary and belongs to MapLibre. */
  async data(id: string, opts: { signal?: AbortSignal } = {}): Promise<Response> {
    // The raw Response, not a parsed body: one of the two kinds is a binary archive that a caller
    // streams rather than reads, and guessing which they wanted would be worse than handing it over.
    return this.read(`/byod/${encodeURIComponent(id)}/data`, { signal: opts.signal });
  }
}
