/**
 * Canadian rural and alternate delivery addresses.
 *
 * A rural route is not a place. `RR 2` names a mail carrier's circuit through a community, and
 * the same number exists in hundreds of communities; the site of the mailbox is not in any open
 * dataset. So this does not geocode the route. It splits the Canada Post delivery terms off the
 * front of a query, hands the rest to civic search, and returns the parsed terms alongside the
 * community that was found. "RR 2 Okotoks" resolves to Okotoks, labelled rural route 2, which is
 * the honest answer: the town is known, the mailbox is not.
 *
 * Recognised, per Canada Post's addressing guide:
 *   RR / R.R. / RURAL ROUTE      a rural route, numbered
 *   SS / SUBURBAN SERVICE        a suburban service route, numbered
 *   MR / MOBILE ROUTE            a mobile route, numbered
 *   GD / GENERAL DELIVERY        counter pickup, never numbered
 *   SITE / COMP(ARTMENT) / BOX   the position within the route
 *   STN / RPO / LCD              the retail outlet the route runs from
 *
 * Deliberately not a locality detector: a query has to carry one of the delivery keywords above
 * for this to fire, so an ordinary civic address is untouched.
 */

export type RuralRouteKind = "rural-route" | "suburban-service" | "mobile-route" | "general-delivery";

export interface RuralRouteQuery {
  /** Trimmed original. */
  raw: string;
  kind: RuralRouteKind;
  /** Route number as written. Absent for general delivery, which is never numbered. */
  number?: string;
  /** Position within the route, when given. */
  site?: string;
  compartment?: string;
  box?: string;
  /** The retail outlet the route runs from, e.g. "MAIN" in "STN MAIN". */
  station?: string;
  /**
   * What is left after the delivery terms are removed: normally the community, and the only
   * part that can actually be geocoded. Empty when the query was delivery terms and nothing
   * else, which cannot be resolved to anywhere.
   */
  remainder: string;
}

const KINDS: { pattern: RegExp; kind: RuralRouteKind; numbered: boolean }[] = [
  { pattern: /\b(?:R\.?\s?R\.?|RURAL\s+ROUTE)\s*#?\s*(\d{1,3})\b/i, kind: "rural-route", numbered: true },
  { pattern: /\b(?:S\.?\s?S\.?|SUBURBAN\s+SERVICE)\s*#?\s*(\d{1,3})\b/i, kind: "suburban-service", numbered: true },
  { pattern: /\b(?:M\.?\s?R\.?|MOBILE\s+ROUTE)\s*#?\s*(\d{1,3})\b/i, kind: "mobile-route", numbered: true },
  { pattern: /\b(?:G\.?\s?D\.?|GENERAL\s+DELIVERY)\b/i, kind: "general-delivery", numbered: false },
];

const PARTS: { pattern: RegExp; field: "site" | "compartment" | "box" | "station" }[] = [
  { pattern: /\bSITE\s*#?\s*([A-Z0-9-]{1,8})\b/i, field: "site" },
  { pattern: /\bCOMP(?:ARTMENT)?\s*#?\s*([A-Z0-9-]{1,8})\b/i, field: "compartment" },
  { pattern: /\b(?:PO\s*)?BOX\s*#?\s*([A-Z0-9-]{1,8})\b/i, field: "box" },
  // One word only. Canada Post does publish two-word station names ("STN ST LAURENT"), but
  // "STN MAIN BRANDON" is ambiguous between a two-word station and a station plus a community,
  // and guessing wrong swallows the only part that can be geocoded. Missing the second word of
  // a rare station name costs a label; stealing the town costs the answer.
  { pattern: /\b(?:STN|STATION|RPO|LCD)\s+([A-Z][A-Z0-9'-]*)\b/i, field: "station" },
];

export function parseRuralRoute(q: string): RuralRouteQuery | null {
  if (typeof q !== "string") return null;
  const raw = q.trim();
  if (raw === "") return null;

  const matched = KINDS.map((k) => ({ ...k, match: k.pattern.exec(raw) })).find((k) => k.match !== null);
  if (!matched?.match) return null;

  // Strip the delivery terms one at a time so the remainder is what a civic corpus can answer.
  let rest = raw.replace(matched.pattern, " ");
  const parsed: RuralRouteQuery = { raw, kind: matched.kind, remainder: "" };
  if (matched.numbered) parsed.number = String(Number(matched.match[1]));

  for (const part of PARTS) {
    const hit = part.pattern.exec(rest);
    if (!hit) continue;
    parsed[part.field] = hit[1]!.trim().toUpperCase();
    rest = rest.replace(part.pattern, " ");
  }

  // Whatever survives is the community. Separators the delivery terms were glued to (commas,
  // stray hyphens) go with them rather than reaching the corpus as noise.
  parsed.remainder = rest.replace(/[,;]+/g, " ").replace(/\s+/g, " ").replace(/^[-\s]+|[-\s]+$/g, "");
  return parsed;
}

/**
 * True when `q` carries Canada Post delivery terms.
 *
 * Note this is NOT a routing signal in the way `looksLikeLegalLand` is: a rural-route query is
 * still answered by civic search, on its remainder. It exists so the caller can strip the terms
 * and label the result, not so it can pick a different backend.
 */
export function looksLikeRuralRoute(q: string): boolean {
  return parseRuralRoute(q) != null;
}
