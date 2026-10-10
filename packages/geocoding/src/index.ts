import { DEFAULT_GATEWAY, UnmapError, fetchWithRetry, parseRetryAfter, type RetryPolicy } from "@unmap/core";
import type { LegalLandDetails } from "./legal-land";
import type { IdentifyOptions, IdentifyResponse } from "./identify";
import type { QueryOptions, QueryResponse } from "./query";
import type { StructuredOptions } from "./structured";
import type { IncludeValue, TreatyContext } from "./treaties";

export {
  looksLikeLegalLand,
  parseLegalLand,
  toLegalLandDetails,
  type LegalLandComponents,
  type LegalLandDetails,
  type LegalLandLayerSystem,
  type LegalLandParse,
  type LegalLandSystem,
  type LegalLandUnit,
} from "./legal-land";

export {
  ENERGY_SEARCH_LAYERS,
  energySearchRequested,
  isEnergySearchSource,
  looksLikeEnergyQuery,
  parseEnergyQuery,
  parseEnergySearchLayers,
  type EnergyDetails,
  type EnergyQuery,
  type EnergyQueryKind,
  type EnergySearchLayer,
} from "./energy";

export {
  DEFAULT_IDENTIFY_LAYERS,
  ENERGY_IDENTIFY_LAYER_IDS,
  IDENTIFY_LAYER_IDS,
  LAND_IDENTIFY_LAYER_IDS,
  MINING_IDENTIFY_LAYER_IDS,
  isEnergyIdentifyLayer,
  isIdentifyLayer,
  isLandIdentifyLayer,
  knownIdentifyLayers,
  parseIdentifyAt,
  parseIdentifyLayers,
  type IdentifyLayerId,
  type IdentifyOptions,
  type IdentifyResponse,
  type IdentifyResult,
} from "./identify";

export {
  CsvParser,
  alignRow,
  encodeField,
  encodeRow,
  escapeForSpreadsheet,
  looksLikeFormula,
  type CsvProblem,
  type CsvRecord,
} from "./batch/csv";

export {
  AMBIGUOUS_SCORE_RATIO,
  OUTPUT_COLUMNS,
  OUTPUT_PREFIX,
  classify,
  outputValues,
  resolveOutputHeader,
  type OutputColumn,
  type ReviewReason,
  type RowStatus,
} from "./batch/output";

export {
  CIVIC_SEARCH_LAYERS,
  knownSearchLayers,
  parseFocus,
  parseSearchLayers,
  type CivicSearchLayer,
  type FocusParse,
  type SearchLayersParse,
} from "./search-layers";

export {
  emptyAcknowledgementContext,
  emptyTerritoryContext,
  parseAcknowledgementContext,
  parseTerritoryContext,
  pickCommunityName,
  type AcknowledgementContext,
  type AcknowledgementResource,
  type CommunityStatus,
  type TerritoryContext,
  type TerritoryMatch,
} from "./community";

export {
  createTreatyOverlay,
  treatyLayerIds,
  type TreatyLookupClient,
  type TreatyMapLike,
  type TreatyOverlayController,
  type TreatyOverlayOptions,
  type TreatySelection,
} from "./treaty-overlay";

export {
  COMMUNITY_INCLUDE_VALUES,
  INCLUDE_VALUES,
  isTreatiesVersion,
  orderTreatyMatches,
  parseInclude,
  parseTreatiesVersion,
  parseTreatyContext,
  pickTreatyLabel,
  unavailableTreatyContext,
  type CommunityIncludeValue,
  type IncludeParse,
  type IncludeValue,
  type TreatyCategory,
  type TreatyContext,
  type TreatyGeographyKind,
  type TreatyLang,
  type TreatyMatch,
  type TreatyPointBasis,
  type TreatyRepresentation,
} from "./treaties";

export {
  REGIONS,
  REGION_CODES,
  REGION_KEYS,
  parseRegion,
  regionForms,
} from "./regions";

export {
  STRUCTURED_FIELDS,
  parseStructuredQuery,
  type StructuredOptions,
  type StructuredParseResult,
  type StructuredQuery,
} from "./structured";

export {
  looksLikeParcel,
  parseParcel,
  type ParcelQuery,
} from "./parcel";

export {
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT,
  QUERY_LAYER_IDS,
  knownQueryLayers,
  parseQueryBbox,
  parseQueryLayer,
  parseQueryLimit,
  type QueryBbox,
  type QueryLayerId,
  type QueryOptions,
  type QueryResponse,
} from "./query";

/** Largest `queries` array `POST /geocode/batch` accepts. Payload size, not pool size. */
export const GEOCODE_BATCH_MAX = 100;

export interface GeocoderOptions {
  key: string;
  gateway?: string;
  /** Override the fetch implementation (tests, non-global environments). */
  fetch?: typeof fetch;
  /**
   * Retry policy for `429`, `502`, `503` and transport failures. `false` disables it.
   *
   * On by default. `Retry-After` is on a `429` other than `billing_required`, and on a container
   * `503`. A `502` has none. The client that reads the header is better placed to honour it than
   * every caller re-deriving the same loop, and it backs off itself when the header is absent.
   * A wait longer than `maxDelayMs` (10 s) is not slept through; the error carries
   * `retryAfterSeconds` instead. See `RetryPolicy` in `@unmap/core`.
   */
  retry?: RetryPolicy | false;
}

export type GeocodeLayer =
  | "address"
  | "street"
  | "locality"
  | "region"
  | "poi"
  | "legal_land"
  | "well"
  | "facility"
  | "parcel";

/**
 * Which dataset the returned record came from. Conflation
 * (`pipeline/geocoding/conflate.sql`) keeps one survivor per place and deletes the rest, so
 * this is the SURVIVING record's source, not every dataset that agreed on the place. See
 * `docs/services/geocoding-sources.md`.
 */
export type GeocodeSource =
  | "osm"
  | "openaddresses"
  | "statcan_nar"
  | "nrcan_cgndb"
  | "wof"
  | "geonames";

/**
 * How well the result answers what was asked, as a category — never a probability, and never
 * derived from `score` (which stays raw BM25 relevance).
 *
 * - `exact` — every component the query supplied and the corpus supports was matched.
 * - `partial` — something supplied did not match, or could not be verified.
 * - `fallback` — the result is COARSER than the query asked for: a civic number was requested
 *   and the result carries none. A street or locality standing in for an address is always
 *   this, never `exact`.
 * - `unknown` — input-match diagnostics do not apply (reverse, nearby, autocomplete).
 */
export type GeocodeMatchType = "exact" | "partial" | "fallback" | "unknown";

/**
 * Positional resolution the SOURCE supports, separate from how well the input matched.
 *
 * `point` means a discrete point record in the source dataset — an address point or a POI. It
 * is **not** a rooftop-accuracy claim, and it never means interpolated: the engine performs no
 * interpolation. `locality` and `region` are centroids.
 */
export type GeocodePrecision = "point" | "street" | "locality" | "region" | "unknown";

/** Stable reason codes explaining a non-`exact` `match_type`. Additive; never renamed. */
export type GeocodeMatchReason =
  | "housenumber_not_matched"
  | "housenumber_differs"
  | "unit_not_verified"
  | "unit_differs"
  | "postalcode_not_verified"
  | "postalcode_differs"
  | "region_not_verified"
  | "region_differs"
  | "terms_unmatched"
  | "fuzzy_match";

export interface GeocodeResult {
  id: string;
  name: string;
  layer: GeocodeLayer;
  lng: number;
  lat: number;
  score?: number;
  /** Originating dataset of the returned record. */
  source?: GeocodeSource | string;
  /** That dataset's own identifier for the record, when it published one. */
  source_id?: string;
  /** How well the result answers the query. `unknown` where input matching does not apply. */
  match_type?: GeocodeMatchType;
  /** Positional resolution the source supports. Not an accuracy figure. */
  precision?: GeocodePrecision;
  /** Why `match_type` is not `exact`. Empty or absent when it is. */
  match_reasons?: GeocodeMatchReason[];
  /** Canonical category id (e.g. "health.pharmacy") when the feature carries one. */
  category?: string;
  /** Spheroidal metres from the query anchor; only `/geocode/nearby` results carry it. */
  distance?: number;
  names?: Record<string, string>;
  address?: {
    housenumber?: string;
    street?: string;
    city?: string;
    region?: string;
    postcode?: string;
    country?: string;
    /** Unit/suite, where the source published one. Most of the corpus does not. */
    unit?: string;
  };
  /** Structured legal-land parse; only `layer: "legal_land"` results carry it. */
  legal_land?: LegalLandDetails;
  /** Well / facility extras; only `layer: "well" | "facility"` results carry them. */
  uwi?: string;
  licence?: string;
  operator?: string;
  status?: string;
  /** ParcelMap BC PID; only `layer: "parcel"` results carry it. */
  pid?: string;
  /** Survey-cell bounds `[minLng, minLat, maxLng, maxLat]` when the lookup row has a geom. */
  bbox?: [number, number, number, number];
  /** Survey polygon when `?geometry=true` and the lookup row has one. */
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  /**
   * Treaty context for this result, only with `include=treaties`. On search it describes the
   * result's own point; on reverse, the coordinate that was sent.
   */
  treaties?: TreatyContext;
}

export interface SearchOptions {
  limit?: number;
  lang?: string;
  /**
   * [minLng, minLat, maxLng, maxLat] hard filter. Excludes; see `focus` to merely prefer.
   * A corner outside WGS84 is status 400, code `bad_request`. A box outside Canada stays a filter.
   */
  bbox?: [number, number, number, number];
  /** [lng, lat] soft proximity preference. Moves ranking toward the point, excludes nothing. */
  focus?: [number, number];
  /** Include the survey polygon on a legal-land hit when the table has one. */
  geometry?: boolean;
  /**
   * Which result types may come back. Civic values (`address`, `street`, `locality`, `region`,
   * `poi`) filter within the civic corpus; energy values (`well`, `facility`) select the energy
   * corpus instead and need the energy add-on. The two sets cannot be mixed.
   */
  layers?: string;
  /** Province or territory, any accepted spelling. Excludes rows in another province. */
  region?: string;
  signal?: AbortSignal;
}

/**
 * Treaty context (`include=treaties`), on `search` and `reverse` only. See TreatyContext: a match
 * is to the Crown's published representation, and an empty `ok` is not a statement about rights.
 */
export interface TreatyOptions {
  /** `["treaties"]` adds `treaties` to every result. Omitted, responses are unchanged. */
  include?: IncludeValue[];
  /** Pin the treaty dataset version (e.g. the one a map overlay feature carries). */
  treatiesVersion?: string;
}

export interface ReverseOptions extends TreatyOptions {
  lang?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface NearbyOptions {
  /** [lng, lat] anchor to sort by distance from. Exactly one of `near` or `bbox`. */
  near?: [number, number];
  /** [minLng, minLat, maxLng, maxLat]; the API anchors at its centre. */
  bbox?: [number, number, number, number];
  /** Search radius in metres (API default 5000, clamped to [50, 50000]). */
  radius?: number;
  limit?: number;
  lang?: string;
  signal?: AbortSignal;
}

/**
 * A geocoding failure.
 *
 * Extends `UnmapError`, so `catch (e) { if (e instanceof UnmapError) }` catches this alongside
 * every other unmap client's errors. `status` and `code` carry the HTTP status and the
 * gateway's error code, and `retryAfterSeconds` comes from the `Retry-After` header.
 */
export class GeocoderError extends UnmapError {
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(status, message, code, retryAfterSeconds);
    this.name = "GeocoderError";
  }
}

/**
 * The gateway answers every error with a JSON body whose `error` says what went wrong
 * ("mode must be one of auto, car, bicycle, pedestrian, truck", "q required"). Put that in the
 * message so a caller who logs the thrown error reads the reason, not just the status.
 */
async function errorFrom(
  res: { status: number; headers?: Headers; json(): Promise<unknown> },
  path: string,
): Promise<GeocoderError> {
  const fallback = `geocode ${res.status} on ${path}`;
  let body: { error?: unknown; code?: unknown } | undefined;
  try {
    body = (await res.json()) as { error?: unknown; code?: unknown };
  } catch {
    body = undefined;
  }
  const reason = typeof body?.error === "string" ? body.error : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const retryAfter = parseRetryAfter(res.headers?.get("retry-after") ?? null) ?? undefined;
  return new GeocoderError(res.status, reason ? `${reason} (${fallback})` : fallback, code, retryAfter);
}

/** Typed client for the unmap geocoding API (gateway `/geocode/*`). */
export class Geocoder {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryPolicy | false | undefined;

  constructor(opts: GeocoderOptions) {
    this.key = opts.key;
    this.retry = opts.retry;
    this.base = (opts.gateway ?? DEFAULT_GATEWAY).replace(/\/+$/, "");
    // Bound to globalThis: stored on an instance and called as `this.fetchImpl(...)`, a bare
    // `fetch` reference is invoked with the Geocoder as its receiver, and browsers reject that
    // with "Illegal invocation". Node is lenient, so this only ever surfaces in the browser.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Full-text search. */
  search(q: string, opts: SearchOptions & TreatyOptions = {}): Promise<GeocodeResult[]> {
    return this.query("/geocode/search", { q, ...toParams(opts) }, opts.signal);
  }

  /**
   * Many searches in one or more `POST /geocode/batch` calls, chunked at
   * {@link GEOCODE_BATCH_MAX}. Results stay aligned to `queries`.
   */
  async batch(queries: string[], opts: SearchOptions = {}): Promise<GeocodeResult[][]> {
    if (queries.length === 0) return [];
    const out: GeocodeResult[][] = [];
    for (let i = 0; i < queries.length; i += GEOCODE_BATCH_MAX) {
      const chunk = queries.slice(i, i + GEOCODE_BATCH_MAX);
      const body = (await this.postJson(
        "/geocode/batch",
        {
          queries: chunk,
          ...toBatchBody(opts),
        },
        opts.signal,
      )) as GeocodeResult[][];
      if (!Array.isArray(body)) return out.concat(chunk.map(() => []));
      out.push(...body);
    }
    return out;
  }

  /** Type-ahead suggestions for partial input. */
  autocomplete(q: string, opts: SearchOptions = {}): Promise<GeocodeResult[]> {
    return this.query("/geocode/autocomplete", { q, ...toParams(opts) }, opts.signal);
  }

  /**
   * Forward geocoding from address components rather than one string.
   *
   * `address` and `city` decide which rows are candidates and which wins. `region` and
   * `postalcode` narrow: they drop rows that contradict them and keep rows that are silent
   * about them, which come back with `region_not_verified` / `postalcode_not_verified` in
   * `match_reasons`. Needs at least one of `address`, `city` or `postalcode`.
   */
  structured(opts: StructuredOptions): Promise<GeocodeResult[]> {
    return this.query(
      "/geocode/structured",
      {
        address: opts.address,
        city: opts.city,
        region: opts.region,
        postalcode: opts.postalcode,
        country: opts.country,
        limit: opts.limit != null ? String(opts.limit) : undefined,
        lang: opts.lang,
        bbox: opts.bbox ? opts.bbox.join(",") : undefined,
        focus: opts.focus ? opts.focus.join(",") : undefined,
        layers: opts.layers,
      },
      opts.signal,
    );
  }

  /**
   * Category search: POIs of a kind near a point, sorted by distance (metres, in each
   * result's `distance`). `category` takes canonical taxonomy ids ("health.pharmacy") or
   * plain words in English or French ("pharmacy", "pharmacie") — the gateway resolves
   * aliases, so this client passes the value through untouched. An anchor outside Canada rejects
   * with status 422 and code `outside_coverage`; the corpus is not queried. A longitude or
   * latitude outside WGS84, including a bbox corner, rejects with status 400 and code `bad_request`.
   */
  nearby(category: string | string[], opts: NearbyOptions = {}): Promise<GeocodeResult[]> {
    return this.query(
      "/geocode/nearby",
      {
        category: Array.isArray(category) ? category.join(",") : category,
        near: opts.near ? opts.near.join(",") : undefined,
        bbox: opts.bbox ? opts.bbox.join(",") : undefined,
        radius: opts.radius != null ? String(opts.radius) : undefined,
        limit: opts.limit != null ? String(opts.limit) : undefined,
        lang: opts.lang,
      },
      opts.signal,
    );
  }

  /**
   * Reverse geocode a coordinate. A point outside Canada rejects with status 422 and code
   * `outside_coverage`. A longitude or latitude outside WGS84 rejects with status 400 and code
   * `bad_request`.
   */
  reverse(lng: number, lat: number, opts: ReverseOptions = {}): Promise<GeocodeResult[]> {
    return this.query(
      "/geocode/reverse",
      {
        near: `${lng},${lat}`,
        lang: opts.lang,
        limit: opts.limit != null ? String(opts.limit) : undefined,
        ...treatyParams(opts),
      },
      opts.signal,
    );
  }

  /**
   * Which catalog features contain a point. Default layer is `municipalities`
   * (core). `survey.dls` / `survey.nts` need the `legal-land` add-on.
   * `energy.*` need the `energy` add-on. `mining.*` need the `mining` add-on
   * and identify via Land extra tables. Empty until the matching PostGIS table
   * is loaded. No mining search grammar — claim numbers stay `energy.mineral-tenure`.
   */
  identify(opts: IdentifyOptions): Promise<IdentifyResponse> {
    return this.requestJson(
      "/identify",
      {
        at: opts.at.join(","),
        layers: opts.layers?.length ? opts.layers.join(",") : undefined,
        geometry: opts.geometry ? "true" : undefined,
      },
      opts.signal,
    ) as Promise<IdentifyResponse>;
  }

  /**
   * Features of one catalog layer that intersect a bbox. Same PostGIS tables as
   * `identify`. Tile-only catalog ids are a 501. Survey layers need `legal-land`;
   * `energy.*` need `energy`; `survey.parcels` needs `agriculture`; mining
   * layers need `mining`. Empty until the matching table is loaded.
   */
  queryLayer(opts: QueryOptions): Promise<QueryResponse> {
    return this.requestJson(
      "/data/query",
      {
        layer: opts.layer,
        bbox: opts.bbox.join(","),
        limit: opts.limit != null ? String(opts.limit) : undefined,
        geometry: opts.geometry ? "true" : undefined,
      },
      opts.signal,
    ) as Promise<QueryResponse>;
  }

  private async postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const q = new URLSearchParams({ key: this.key });
    const res = await this.fetchImpl(`${this.base}${path}?${q}`, {
      method: "POST",
      signal,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await errorFrom(res, path);
    return res.json();
  }

  private async requestJson(
    path: string,
    params: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const q = new URLSearchParams({ key: this.key });
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") q.set(k, v);
    const res = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}${path}?${q}`,
      { signal, headers: { accept: "application/json" } },
      this.retry,
    );
    if (!res.ok) throw await errorFrom(res, path);
    return res.json();
  }

  private async query(
    path: string,
    params: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<GeocodeResult[]> {
    const body = (await this.requestJson(path, params, signal)) as
      | { results?: GeocodeResult[] }
      | GeocodeResult[];
    return Array.isArray(body) ? body : (body.results ?? []);
  }
}

function toBatchBody(o: SearchOptions): Record<string, unknown> {
  return {
    ...(o.limit != null ? { limit: o.limit } : {}),
    ...(o.lang ? { lang: o.lang } : {}),
    ...(o.bbox ? { bbox: o.bbox.join(",") } : {}),
    ...(o.focus ? { focus: o.focus.join(",") } : {}),
    ...(o.region ? { region: o.region } : {}),
    ...(o.layers ? { layers: o.layers } : {}),
  };
}

function treatyParams(o: TreatyOptions): Record<string, string | undefined> {
  const include = o.include && o.include.length > 0 ? [...new Set(o.include)].join(",") : undefined;
  return { include, treaties_version: o.treatiesVersion };
}

function toParams(o: SearchOptions & TreatyOptions): Record<string, string | undefined> {
  return {
    limit: o.limit != null ? String(o.limit) : undefined,
    lang: o.lang,
    bbox: o.bbox ? o.bbox.join(",") : undefined,
    focus: o.focus ? o.focus.join(",") : undefined,
    region: o.region,
    geometry: o.geometry ? "true" : undefined,
    layers: o.layers,
    ...treatyParams(o),
  };
}

export {
  looksLikeRuralRoute,
  parseRuralRoute,
  type RuralRouteKind,
  type RuralRouteQuery,
} from "./rural-route";

export {
  Places,
  PlacesError,
  type Place,
  type PlacesResponse,
  type PlacesOptions,
  type PlaceSearchOptions,
  type PlaceNearbyOptions,
} from "./places";

// The shared error type and retry policy, re-exported so a caller who installed only this
// package can `catch (e) { if (e instanceof UnmapError) }` without adding @unmap/core.
export { UnmapError, parseRetryAfter, type RetryPolicy } from "@unmap/core";
