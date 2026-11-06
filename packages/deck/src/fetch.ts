import { DEFAULT_GATEWAY, UnmapError, parseRetryAfter } from "@unmap/core";
import type { Lifts3dDocument } from "./types";

/** The only document schema this package reads. */
export const LIFTS_3D_SCHEMA = "unmap.ski-lifts-3d.v1";

/**
 * A lifts-3D failure: a non-2xx answer from the gateway (`status` and `code` from it, such as
 * `403 addon_required` for a key without the ski add-on), or a body that is not a
 * `unmap.ski-lifts-3d.v1` document (`code: "schema_mismatch"`).
 *
 * Extends `UnmapError`, so one `instanceof UnmapError` catches it with every other unmap error.
 */
export class Lifts3dError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "Lifts3dError";
  }
}

export interface FetchLifts3dOptions {
  /** An unmap key with the `ski` add-on. It is sent to `gateway` and nowhere else. */
  key: string;
  /** A ski area id from `/ski/areas`, such as `osm-way-123`. */
  areaId: string;
  /** Gateway origin; defaults to `https://api.unmap.dev`. */
  gateway?: string;
  /** A `fetch` to use instead of the global one. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Fetch an area's baked 3D lifts (`GET /ski/areas/{id}/lifts-3d`).
 *
 * The data sits behind the `ski` add-on; the renderers in this package do not. The document's z
 * values are metres above sea level from `terrain_release`, ready for `liftCablesLayer` and
 * `liftModelsLayer`.
 */
export async function fetchLifts3d(opts: FetchLifts3dOptions): Promise<Lifts3dDocument> {
  if (!opts.key) throw new Lifts3dError(400, "fetchLifts3d needs a key");
  if (!opts.areaId) throw new Lifts3dError(400, "fetchLifts3d needs an areaId");
  const base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
  const url = `${base}/ski/areas/${encodeURIComponent(opts.areaId)}/lifts-3d?${new URLSearchParams({ key: opts.key })}`;
  // Bound to globalThis: a bare `fetch` called with another receiver is rejected by browsers.
  const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const res = await fetchImpl(url, { signal: opts.signal, headers: { accept: "application/json" } });

  if (!res.ok) {
    const fallback = `lifts-3d ${res.status}`;
    let body: { error?: unknown; code?: unknown } | undefined;
    try {
      body = (await res.json()) as { error?: unknown; code?: unknown };
    } catch {
      body = undefined;
    }
    const reason = typeof body?.error === "string" ? body.error : undefined;
    const code = typeof body?.code === "string" ? body.code : undefined;
    const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;
    throw new Lifts3dError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Lifts3dError(res.status, "lifts-3d answered with a body that is not JSON", "schema_mismatch");
  }
  // The gateway answers with the ski routes' `{ data, meta }` envelope; the release is meta's
  // data_version. The document callers get back is flat.
  const envelope = body as { data?: Record<string, unknown>; meta?: { data_version?: unknown } } | null;
  const data = envelope && typeof envelope === "object" ? envelope.data : undefined;
  const flat = data ? { ...data, release: envelope?.meta?.data_version } : undefined;
  if (!isLifts3dDocument(flat)) {
    const got = data && "schema" in data ? String(data.schema) : "no schema";
    throw new Lifts3dError(res.status, `lifts-3d answered with ${got}; this client reads ${LIFTS_3D_SCHEMA}`, "schema_mismatch");
  }
  return { schema: flat.schema, release: flat.release, terrain_release: flat.terrain_release, area_id: flat.area_id, lifts: flat.lifts };
}

function isLifts3dDocument(body: unknown): body is Lifts3dDocument {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const doc = body as Record<string, unknown>;
  return doc.schema === LIFTS_3D_SCHEMA && Array.isArray(doc.lifts) && typeof doc.release === "string"
    && typeof doc.area_id === "string" && typeof doc.terrain_release === "string";
}
