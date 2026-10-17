import {
  DEFAULT_COUNTRY,
  parseCountry,
  parsePostalCode,
  parseSubdivision,
  subdivisionCodes,
  COUNTRY_CODES,
  type CountryCode,
} from "./countries";

/**
 * Structured forward geocoding: the caller hands over the components of an address instead of
 * one string, and the engine keeps them apart all the way through.
 *
 * The distinction that matters, and the one the docs state plainly: some fields CONSTRAIN the
 * result set and some only RANK it.
 *
 *   - `address` and `city` are retrieval and ranking. They decide which rows are candidates and
 *     which candidate wins.
 *   - `region` and `postalcode` constrain, under one rule: **a supplied component excludes
 *     records that contradict it, and never excludes records that are silent about it.** A row
 *     in Ontario is out when you asked for Alberta; a row with no province at all stays in and
 *     comes back with `region_not_verified` in its `match_reasons`.
 *   - `country` scopes everything else and constrains outright: a row in another country is never
 *     a candidate. It also decides how `region` and `postalcode` are read, so `region=CA` is
 *     California under `country=US` and an error under the default, Canada.
 *
 * The alternative — joining the fields into one string and running the free-text engine — is
 * what this exists instead of. It would make `region` a scoring token that any row could match
 * by coincidence, which is how "Kelowna, BC" used to return the province of British Columbia.
 */
export interface StructuredQuery {
  /** Street line: civic number and street name, as the caller would write it on an envelope. */
  address?: string;
  city?: string;
  /**
   * The subdivision's code inside `country`, normalised from any accepted spelling ("Québec" and
   * "qc" both give "QC"; "California" under `country=US` gives "CA").
   */
  region?: string;
  /** The country's own syntax, normalised: "M5H2N2", "02134" or "02134-1234", "01000". */
  postalcode?: string;
  /** ISO code. Omitted on input, it is Canada, which every earlier client meant. */
  country?: CountryCode;
}

export interface StructuredOptions extends Omit<StructuredQuery, "country"> {
  /**
   * ISO code or name ("US", "México"). Omitted, Canada. `region` and `postalcode` are read in
   * this country's rules. A country geocoding has not released rejects with status 422 and code
   * `outside_coverage`.
   */
  country?: string;
  limit?: number;
  lang?: string;
  /** [minLng, minLat, maxLng, maxLat] hard filter, same semantics as `search`. */
  bbox?: [number, number, number, number];
  /** [lng, lat] soft proximity preference. Moves ranking toward the point, excludes nothing. */
  focus?: [number, number];
  /** Civic result types to allow (`address`, `street`, `locality`, `region`, `poi`). */
  layers?: string;
  signal?: AbortSignal;
}

/** The query fields, in the order the docs and the CLI list them. */
export const STRUCTURED_FIELDS = ["address", "city", "region", "postalcode", "country"] as const;

/**
 * The fields that can start a search on their own. `region` is deliberately not one of them: a
 * province with no other component is not a geocode, it is a request for four million rows, and
 * answering it with an arbitrary ranked slice would be worse than saying so.
 */
const ANCHOR_FIELDS = ["address", "city", "postalcode"] as const;

export type StructuredParseResult = { query: StructuredQuery } | { error: string };

/** Normalise and validate raw structured input. Returns the cleaned query or one error string. */
export function parseStructuredQuery(raw: Partial<Record<string, string | undefined>>): StructuredParseResult {
  const trim = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? undefined : t;
  };

  const rawCountry = trim(raw.country);
  let country: CountryCode = DEFAULT_COUNTRY;
  if (rawCountry) {
    const parsed = parseCountry(rawCountry);
    if (!parsed) return { error: `unknown country "${rawCountry}". Use ${COUNTRY_CODES.join(", ")}` };
    country = parsed;
  }

  let region: string | undefined;
  const rawRegion = trim(raw.region);
  if (rawRegion) {
    region = parseSubdivision(country, rawRegion);
    if (!region) {
      const kind = country === "CA" ? "a province or territory" : "a state";
      return {
        error: `unknown region "${rawRegion}" in ${country}. Use ${kind} code: ${subdivisionCodes(country).join(", ")}`,
      };
    }
  }

  let postalcode: string | undefined;
  const rawPostal = trim(raw.postalcode);
  if (rawPostal) {
    const parsed = parsePostalCode(country, rawPostal);
    if ("error" in parsed) return parsed;
    postalcode = parsed.postalcode;
  }

  const query: StructuredQuery = {
    ...(trim(raw.address) ? { address: trim(raw.address) } : {}),
    ...(trim(raw.city) ? { city: trim(raw.city) } : {}),
    ...(region ? { region } : {}),
    ...(postalcode ? { postalcode } : {}),
    country,
  };

  if (!ANCHOR_FIELDS.some((f) => query[f] != null)) {
    return {
      error: `structured search needs at least one of ${ANCHOR_FIELDS.join(", ")}. ` +
        `region and country narrow a search; they cannot be one on their own.`,
    };
  }

  return { query };
}
