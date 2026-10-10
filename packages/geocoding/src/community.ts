import { isTreatiesVersion, type TreatyPointBasis } from "./treaties";

/**
 * Release C: territories and acknowledgement resources (docs/indigenous-context/community-pilot.md,
 * community-review-packet.md). Built and tested on synthetic data only. No community source is
 * admitted, so a deployment answers `not_enabled` at best, and refuses these include values
 * unless community context has been switched on.
 *
 * The semantics carried here are the review packet's: a territory match is a source-defined
 * record, never an inference from proximity; `community_ids` are relationships the source states;
 * an acknowledgement resource applies only through a reviewed relationship to a matched territory,
 * never by city name or nearest reserve; exact text appears only where republication is permitted,
 * and is never generated or machine-translated.
 */

/** `not_enabled`: nothing admitted for this collection. Not a successful empty lookup. */
export type CommunityStatus = "ok" | "not_enabled" | "unavailable";

export interface TerritoryMatch {
  /** `<source_id>:<source_record_id>`. */
  id: string;
  source_id: string;
  source_record_id: string;
  name: string;
  /** Language tag of `name` as the source supplied it. */
  name_lang: string;
  /** Only the names and language tags the source supplied. */
  names: Record<string, string>;
  /** Communities the source relates to this record. Never inferred. */
  community_ids: string[];
  representation: "approximate" | "illustrative" | "source_defined";
  source_url: string;
  attribution: string;
}

export interface TerritoryContext {
  schema_version: 1;
  dataset_version: string | null;
  status: CommunityStatus;
  point: { lng: number; lat: number; basis: TreatyPointBasis };
  coverage: { scope: "source_defined"; completeness: "partial" };
  matches: TerritoryMatch[];
  notice_code: "source_limitations_apply";
}

export interface AcknowledgementResource {
  id: string;
  source_id: string;
  title: string;
  /** The approved original. Always present, so a client can link when it cannot show text. */
  url: string;
  /** Language of the resource as approved. Resources are not translated. */
  language: string;
  attribution: string;
  /** The reviewed explanation of where and how the resource applies. */
  applicability: string;
  /** Territory ids the partner linked this resource to. The only way a resource is matched. */
  applies_to: string[];
  reviewed_at: string;
  content_version: string;
  /** Exact approved wording, only where the agreement permits republication. */
  text?: string;
}

export interface AcknowledgementContext {
  schema_version: 1;
  dataset_version: string | null;
  status: CommunityStatus;
  point: { lng: number; lat: number; basis: TreatyPointBasis };
  resources: AcknowledgementResource[];
  notice_code: "source_limitations_apply";
}

/**
 * The name to show for `lang`: the requested primary language when supplied, otherwise the
 * source's own default. Nothing is translated or invented; `undefined` if neither exists.
 */
export function pickCommunityName(
  names: Record<string, string>,
  lang: string,
  defaultLang: string,
): { text: string; lang: string } | undefined {
  const want = lang.toLowerCase().split("-")[0]!;
  for (const [tag, text] of Object.entries(names)) {
    if (tag.toLowerCase().split("-")[0] === want && text.trim() !== "") return { text, lang: tag };
  }
  const fallback = names[defaultLang];
  return fallback !== undefined && fallback.trim() !== "" ? { text: fallback, lang: defaultLang } : undefined;
}

function point(p: { lng: number; lat: number; basis: TreatyPointBasis }) {
  return { lng: p.lng, lat: p.lat, basis: p.basis };
}

export function emptyTerritoryContext(
  p: { lng: number; lat: number; basis: TreatyPointBasis },
  status: Exclude<CommunityStatus, "ok">,
): TerritoryContext {
  return {
    schema_version: 1,
    dataset_version: null,
    status,
    point: point(p),
    coverage: { scope: "source_defined", completeness: "partial" },
    matches: [],
    notice_code: "source_limitations_apply",
  };
}

export function emptyAcknowledgementContext(
  p: { lng: number; lat: number; basis: TreatyPointBasis },
  status: Exclude<CommunityStatus, "ok">,
): AcknowledgementContext {
  return {
    schema_version: 1,
    dataset_version: null,
    status,
    point: point(p),
    resources: [],
    notice_code: "source_limitations_apply",
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  throw new TypeError(`invalid community context: ${message}`);
}

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const { protocol } = new URL(v);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function checkEnvelope(v: Record<string, unknown>, list: string): unknown[] {
  if (v.schema_version !== 1) fail("schema_version must be 1");
  if (v.status !== "ok" && v.status !== "not_enabled" && v.status !== "unavailable") fail("status");
  const version = v.dataset_version;
  if (version !== null && (typeof version !== "string" || !isTreatiesVersion(version))) fail("dataset_version");
  if (v.status === "ok" && version === null) fail("an ok context needs a dataset_version");
  if (v.notice_code !== "source_limitations_apply") fail("notice_code");
  const p = v.point;
  if (!isRecord(p) || typeof p.lng !== "number" || typeof p.lat !== "number" || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) {
    fail("point");
  }
  const items = v[list];
  if (!Array.isArray(items)) fail(`${list} must be an array`);
  if (v.status !== "ok" && items.length > 0) fail(`a ${String(v.status)} context carries no ${list}`);
  return items;
}

export function parseTerritoryContext(value: unknown): TerritoryContext {
  if (!isRecord(value)) fail("must be an object");
  const items = checkEnvelope(value, "matches");
  items.forEach((m, i) => {
    if (!isRecord(m)) fail(`matches[${i}]`);
    for (const k of ["id", "source_id", "source_record_id", "name", "name_lang", "attribution"] as const) {
      if (typeof m[k] !== "string" || m[k] === "") fail(`matches[${i}].${k}`);
    }
    if (!Array.isArray(m.community_ids) || m.community_ids.some((c) => typeof c !== "string")) fail(`matches[${i}].community_ids`);
    if (!isHttpUrl(m.source_url)) fail(`matches[${i}].source_url must be an http(s) URL`);
  });
  return value as unknown as TerritoryContext;
}

export function parseAcknowledgementContext(value: unknown): AcknowledgementContext {
  if (!isRecord(value)) fail("must be an object");
  const items = checkEnvelope(value, "resources");
  items.forEach((r, i) => {
    if (!isRecord(r)) fail(`resources[${i}]`);
    for (const k of ["id", "source_id", "title", "language", "attribution", "applicability", "reviewed_at", "content_version"] as const) {
      if (typeof r[k] !== "string" || r[k] === "") fail(`resources[${i}].${k}`);
    }
    if (!isHttpUrl(r.url)) fail(`resources[${i}].url must be an http(s) URL`);
    if (!Array.isArray(r.applies_to) || r.applies_to.length === 0 || r.applies_to.some((t) => typeof t !== "string")) {
      fail(`resources[${i}].applies_to must name at least one territory`);
    }
    if (r.text !== undefined && typeof r.text !== "string") fail(`resources[${i}].text`);
  });
  return value as unknown as AcknowledgementContext;
}
