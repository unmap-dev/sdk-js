/**
 * Treaty context: `include=treaties` on `/geocode/search` and `/geocode/reverse`.
 *
 * The contract is frozen in `docs/indigenous-context/contract.md`; the decision behind its shape
 * is `docs/decisions/2026-09-22-treaty-context-on-geocode.md`. These types and parsers are shared
 * by the gateway, the civic geocode container and the SDK, like every other request parser here.
 *
 * What the data is, so nothing downstream overstates it: two CIRNAC datasets of the Crown's
 * published treaty representations. A match is a spatial match to a representation, not a
 * determination of rights, title or territory, and `ok` with no matches means "no record in this
 * dataset", never "unceded" and never "no Indigenous rights".
 */

export const INCLUDE_VALUES = ["treaties"] as const;
export type IncludeValue = (typeof INCLUDE_VALUES)[number];

/**
 * Release C values (docs/indigenous-context/community-pilot.md). Refused unless the deployment has
 * switched community context on, which it must not do before a community source is admitted under
 * an agreement with human review (CLAUDE.md rule 6).
 */
export const COMMUNITY_INCLUDE_VALUES = ["territories", "acknowledgements"] as const;
export type CommunityIncludeValue = (typeof COMMUNITY_INCLUDE_VALUES)[number];

export interface IncludeParse {
  treaties: boolean;
  territories: boolean;
  acknowledgements: boolean;
}

export type TreatyPointBasis = "result_point" | "input_point";
export type TreatyCategory = "historic" | "modern";
export type TreatyGeographyKind =
  | "treaty_area"
  | "overall_treaty_area"
  | "settlement_land"
  | "rights_area"
  | "other"
  | "unspecified";
export type TreatyRepresentation = "approximate" | "illustrative" | "unspecified";
export type TreatyLang = "en" | "fr";

export interface TreatyMatch {
  /** `<source_id>:<source_record_id>`, stable across refreshes. */
  id: string;
  /** Registry id of the publishing dataset, e.g. `treaties.cirnac-historic`. */
  source_id: string;
  /** The publisher's own key (CIRNAC `TAG_ID`). */
  source_record_id: string;
  category: TreatyCategory;
  /** In the requested language when the source has it; `name_lang` says which it is. */
  name: string;
  name_lang: TreatyLang;
  names: { en?: string; fr?: string };
  /** The publisher's subtype label ("Numbered Treaty"), same language rule as `name`. */
  subtype?: string;
  subtypes?: { en?: string; fr?: string };
  geography_kind: TreatyGeographyKind;
  representation: TreatyRepresentation;
  /** Publisher dataset page. Always http(s). */
  source_url: string;
}

export interface TreatyContext {
  schema_version: 1;
  /** Null only when no version could be resolved; never null when `status` is `ok`. */
  dataset_version: string | null;
  status: "ok" | "unavailable";
  point: { lng: number; lat: number; basis: TreatyPointBasis };
  coverage: { scope: "Canada"; completeness: "partial" };
  /** Always empty when `status` is `unavailable`. */
  matches: TreatyMatch[];
  notice_code: "source_limitations_apply";
}

/** `include=` on the two endpoints that accept it. Absent or empty means nothing extra. */
export function parseInclude(
  raw: string | undefined,
  options: { community?: boolean } = {},
): IncludeParse | { error: string } {
  const out: IncludeParse = { treaties: false, territories: false, acknowledgements: false };
  const known = options.community ? [...INCLUDE_VALUES, ...COMMUNITY_INCLUDE_VALUES] : [...INCLUDE_VALUES];
  for (const token of (raw ?? "").split(",")) {
    const value = token.trim();
    if (value === "") continue;
    if (value === "treaties") {
      out.treaties = true;
      continue;
    }
    if ((COMMUNITY_INCLUDE_VALUES as readonly string[]).includes(value)) {
      if (!options.community) {
        return { error: `include "${value}" is not available: no community source has been admitted` };
      }
      out[value as CommunityIncludeValue] = true;
      continue;
    }
    return { error: `unknown include "${value}". known: ${known.join(", ")}` };
  }
  return out;
}

const VERSION_SHAPE = /^(\d{4})-(\d{2})-(\d{2})\.[0-9a-f]{12}$/;

/**
 * `YYYY-MM-DD.` plus twelve lowercase hex characters, with a date that exists. Checked before a
 * version reaches SQL or an R2 key, so `../` and friends never get that far.
 */
export function isTreatiesVersion(value: string): boolean {
  const m = VERSION_SHAPE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseTreatiesVersion(
  raw: string | undefined,
  treatiesIncluded: boolean,
): { version: string | undefined } | { error: string } {
  if (raw === undefined) return { version: undefined };
  if (!treatiesIncluded) return { error: "treaties_version requires include=treaties" };
  if (!isTreatiesVersion(raw)) {
    return { error: "treaties_version must be YYYY-MM-DD. followed by 12 lowercase hex characters" };
  }
  return { version: raw };
}

/**
 * The label to show for `lang`, and the language it is actually in. `fr` (and `fr-CA`) prefers
 * French; everything else prefers English. The other language is a fallback that is reported,
 * never presented as a translation. No label at all is `undefined`: nothing is invented.
 */
export function pickTreatyLabel(
  labels: { en?: string; fr?: string },
  lang: string,
): { text: string; lang: TreatyLang } | undefined {
  const preferred: TreatyLang = lang.toLowerCase().split("-")[0] === "fr" ? "fr" : "en";
  const other: TreatyLang = preferred === "fr" ? "en" : "fr";
  for (const l of [preferred, other]) {
    const text = labels[l];
    if (text !== undefined && text.trim() !== "") return { text, lang: l };
  }
  return undefined;
}

/** Historic before modern, then by id; a record delivered twice appears once. */
export function orderTreatyMatches(matches: readonly TreatyMatch[]): TreatyMatch[] {
  const byId = new Map<string, TreatyMatch>();
  for (const m of matches) if (!byId.has(m.id)) byId.set(m.id, m);
  const rank = (c: TreatyCategory) => (c === "historic" ? 0 : 1);
  return [...byId.values()].sort(
    (a, b) => rank(a.category) - rank(b.category) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

const CATEGORIES = new Set<string>(["historic", "modern"]);
const BASES = new Set<string>(["result_point", "input_point"]);
const KINDS = new Set<string>([
  "treaty_area",
  "overall_treaty_area",
  "settlement_land",
  "rights_area",
  "other",
  "unspecified",
]);
const REPRESENTATIONS = new Set<string>(["approximate", "illustrative", "unspecified"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new TypeError(`invalid treaty context: ${message}`);
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function checkLabels(value: unknown, field: string): void {
  if (!isRecord(value)) fail(`${field} must be an object`);
  for (const [k, v] of Object.entries(value)) {
    if ((k !== "en" && k !== "fr") || typeof v !== "string") fail(`${field} may only carry en/fr strings`);
  }
}

function checkMatch(value: unknown, i: number): void {
  const at = `matches[${i}]`;
  if (!isRecord(value)) fail(`${at} must be an object`);
  for (const key of ["id", "source_id", "source_record_id", "name"] as const) {
    if (typeof value[key] !== "string" || value[key] === "") fail(`${at}.${key} must be a non-empty string`);
  }
  if (!CATEGORIES.has(value.category as string)) fail(`${at}.category`);
  if (value.name_lang !== "en" && value.name_lang !== "fr") fail(`${at}.name_lang`);
  checkLabels(value.names, `${at}.names`);
  if (value.subtype !== undefined && typeof value.subtype !== "string") fail(`${at}.subtype`);
  if (value.subtypes !== undefined) checkLabels(value.subtypes, `${at}.subtypes`);
  if (!KINDS.has(value.geography_kind as string)) fail(`${at}.geography_kind`);
  if (!REPRESENTATIONS.has(value.representation as string)) fail(`${at}.representation`);
  if (!isHttpUrl(value.source_url)) fail(`${at}.source_url must be an http(s) URL`);
}

/**
 * Runtime check of a `treaties` object, including the two invariants the type cannot express:
 * `ok` carries a version, and `unavailable` carries no matches. Throws a TypeError otherwise.
 */
export function parseTreatyContext(value: unknown): TreatyContext {
  if (!isRecord(value)) fail("must be an object");
  if (value.schema_version !== 1) fail("schema_version must be 1");
  if (value.status !== "ok" && value.status !== "unavailable") fail("status");
  const version = value.dataset_version;
  if (version !== null && (typeof version !== "string" || !isTreatiesVersion(version))) {
    fail("dataset_version must be a version or null");
  }
  if (value.status === "ok" && version === null) fail("an ok context needs a dataset_version");
  const point = value.point;
  if (!isRecord(point)) fail("point must be an object");
  if (typeof point.lng !== "number" || !Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180) {
    fail("point.lng");
  }
  if (typeof point.lat !== "number" || !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) {
    fail("point.lat");
  }
  if (!BASES.has(point.basis as string)) fail("point.basis");
  const coverage = value.coverage;
  if (!isRecord(coverage) || coverage.scope !== "Canada" || coverage.completeness !== "partial") fail("coverage");
  if (value.notice_code !== "source_limitations_apply") fail("notice_code");
  if (!Array.isArray(value.matches)) fail("matches must be an array");
  if (value.status === "unavailable" && value.matches.length > 0) fail("an unavailable context carries no matches");
  value.matches.forEach(checkMatch);
  return value as unknown as TreatyContext;
}

/**
 * The `treaties` object for a lookup that could not run. Shared so the container and the
 * gateway (which enriches legal-land and energy results) produce byte-identical failures.
 */
export function unavailableTreatyContext(point: {
  lng: number;
  lat: number;
  basis: TreatyPointBasis;
}): TreatyContext {
  return {
    schema_version: 1,
    dataset_version: null,
    status: "unavailable",
    point: { lng: point.lng, lat: point.lat, basis: point.basis },
    coverage: { scope: "Canada", completeness: "partial" },
    matches: [],
    notice_code: "source_limitations_apply",
  };
}
