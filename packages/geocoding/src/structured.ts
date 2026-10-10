import { parseRegion, REGION_CODES } from "./regions";

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
 *   - `country` is validated, not matched: the corpus is Canada only.
 *
 * The alternative — joining the fields into one string and running the free-text engine — is
 * what this exists instead of. It would make `region` a scoring token that any row could match
 * by coincidence, which is how "Kelowna, BC" used to return the province of British Columbia.
 */
export interface StructuredQuery {
  /** Street line: civic number and street name, as the caller would write it on an envelope. */
  address?: string;
  city?: string;
  /** Two-letter code, normalised from any accepted spelling ("Québec" and "qc" both give "QC"). */
  region?: string;
  /** Six characters, no space, uppercase ("M5H2N2"). */
  postalcode?: string;
  /** Always "CA". Present so the field can be supplied and validated, not so it can vary. */
  country?: string;
}

export interface StructuredOptions extends StructuredQuery {
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

const POSTCODE = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;

export type StructuredParseResult = { query: StructuredQuery } | { error: string };

/** Normalise and validate raw structured input. Returns the cleaned query or one error string. */
export function parseStructuredQuery(raw: Partial<Record<string, string | undefined>>): StructuredParseResult {
  const trim = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? undefined : t;
  };

  const country = trim(raw.country);
  if (country && !/^(ca|can|canada)$/i.test(country)) {
    return { error: `country must be CA: unmap covers Canada only (got "${country}")` };
  }

  let region: string | undefined;
  const rawRegion = trim(raw.region);
  if (rawRegion) {
    region = parseRegion(rawRegion);
    if (!region) {
      return { error: `unknown region "${rawRegion}". Use a province or territory code: ${REGION_CODES.join(", ")}` };
    }
  }

  let postalcode: string | undefined;
  const rawPostal = trim(raw.postalcode);
  if (rawPostal) {
    postalcode = rawPostal.replace(/\s+/g, "").toUpperCase();
    if (!POSTCODE.test(postalcode)) {
      return { error: `postalcode must be a Canadian postal code such as M5H 2N2 (got "${rawPostal}")` };
    }
  }

  const query: StructuredQuery = {
    ...(trim(raw.address) ? { address: trim(raw.address) } : {}),
    ...(trim(raw.city) ? { city: trim(raw.city) } : {}),
    ...(region ? { region } : {}),
    ...(postalcode ? { postalcode } : {}),
    country: "CA",
  };

  if (!ANCHOR_FIELDS.some((f) => query[f] != null)) {
    return {
      error: `structured search needs at least one of ${ANCHOR_FIELDS.join(", ")}. ` +
        `region and country narrow a search; they cannot be one on their own.`,
    };
  }

  return { query };
}
