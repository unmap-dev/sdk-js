/**
 * Canada's provinces and territories, every spelling a query or a corpus row may use.
 *
 * Shared rather than duplicated: the geocode container reads it to strip a "… , AB" tail off a
 * free-text query (`apps/geocode/src/query-tail.ts`), and the gateway reads it to normalise the
 * `region` field of a structured search. Two copies would drift, and a province the gateway
 * accepts but the container cannot match is a silently empty result.
 *
 * Abbreviations may or may not carry a period ("Ont", "Ont.", "Sask", "N.W.T.", "B.C."); the
 * dotted spellings are generated below rather than hand-listed. Bare "que" and "man" are
 * deliberately absent — both are ordinary words (French words ending in "que"; the Isle of Man) —
 * only their dotted forms ("que.", "qué.") count as an abbreviation.
 */
const BASE: Record<string, string> = {
  ab: "AB", alberta: "AB", alta: "AB",
  bc: "BC", "british columbia": "BC", "colombie-britannique": "BC",
  mb: "MB", manitoba: "MB",
  nb: "NB", "new brunswick": "NB", "nouveau-brunswick": "NB",
  nl: "NL", "newfoundland and labrador": "NL", newfoundland: "NL", "terre-neuve-et-labrador": "NL", nfld: "NL",
  ns: "NS", "nova scotia": "NS", "nouvelle-écosse": "NS", "nouvelle-ecosse": "NS",
  nt: "NT", "northwest territories": "NT", "territoires du nord-ouest": "NT", nwt: "NT",
  nu: "NU", nunavut: "NU",
  on: "ON", ontario: "ON", ont: "ON",
  pe: "PE", pei: "PE", "prince edward island": "PE", "île-du-prince-édouard": "PE",
  qc: "QC", pq: "QC", quebec: "QC", québec: "QC", "que.": "QC", "qué.": "QC",
  sk: "SK", saskatchewan: "SK", sask: "SK",
  yt: "YT", yukon: "YT",
};

// Dotted spellings of every abbreviation: "b.c.", "n.w.t.", "ont.", "sask.", "alta.", "nfld.".
// Generated, not hand-listed, so a new abbreviation gets its dotted form for free.
for (const [k, v] of Object.entries(BASE)) {
  if (/^[a-z]{2}$/.test(k)) BASE[k[0] + "." + k[1] + "."] = v;
  else if (k === "nwt" || k === "pei") BASE[k.split("").join(".") + "."] = v;
  else if (/^[a-z]{3,4}$/.test(k)) BASE[k + "."] = v;
}

/** Every recognised spelling, lowercase, mapped to its two-letter code. */
export const REGIONS: Readonly<Record<string, string>> = BASE;

/**
 * Spellings sorted longest first, so "newfoundland and labrador" is tried before
 * "newfoundland". Computed after the dotted-form loop, so generated keys sort with the rest.
 */
export const REGION_KEYS: readonly string[] = Object.keys(BASE).sort((a, b) => b.length - a.length);

/** The thirteen codes, for validation messages. */
export const REGION_CODES: readonly string[] = [...new Set(Object.values(BASE))].sort();

/**
 * Resolve any accepted spelling to its two-letter code. Accent- and case-insensitive, so
 * "Québec", "quebec" and "QC" all give "QC". Undefined when nothing matches.
 */
export function parseRegion(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (REGIONS[key]) return REGIONS[key];
  const unaccented = key.normalize("NFD").replace(/\p{M}/gu, "");
  for (const [k, v] of Object.entries(REGIONS)) {
    if (k.normalize("NFD").replace(/\p{M}/gu, "") === unaccented) return v;
  }
  return undefined;
}

/**
 * Every spelling the corpus may hold for a region code, uppercased: the code itself plus each
 * name that maps to it. The loaders do not normalise `region` (OpenAddresses passes the source
 * value through, so `ONTARIO` and `ON` both occur), so a filter or boost must match all of them.
 */
export function regionForms(code: string): string[] {
  const forms = new Set<string>([code.toUpperCase()]);
  for (const [k, v] of Object.entries(REGIONS)) if (v === code) forms.add(k.toUpperCase());
  return [...forms];
}
