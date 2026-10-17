import { parseRegion, REGION_CODES, REGIONS } from "./regions";

/**
 * The countries the geocoding contract can name: Canada, the United States and Mexico.
 *
 * Naming a country is not the same as covering it. This module only says what a request may
 * ask for and how its subdivision and postal code are read in that country. Which countries
 * each capability has actually released is the gateway's answer (`apps/gateway/src/service-area.ts`),
 * because it changes with a data release and a client bundle must not carry a stale copy.
 *
 * The one trap this exists to close: `CA` as a country is Canada, and `CA` as a US subdivision
 * is California. A subdivision is therefore only ever read inside a country, never on its own.
 */
export const COUNTRY_CODES = ["CA", "US", "MX"] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/**
 * The country a request means when it names none. Every client written before countries existed
 * meant Canada, and still gets Canada.
 */
export const DEFAULT_COUNTRY: CountryCode = "CA";

/** Every accepted spelling of each country, lowercase and unaccented: ISO alpha-2, alpha-3, and the en/fr/es names. */
const COUNTRY_NAMES: Record<string, CountryCode> = {
  ca: "CA", can: "CA", canada: "CA",
  us: "US", usa: "US", "u.s.": "US", "u.s.a.": "US", "united states": "US",
  "united states of america": "US", "etats-unis": "US", "etats-unis d'amerique": "US",
  "estados unidos": "US", "estados unidos de america": "US", eeuu: "US", "ee. uu.": "US", "ee.uu.": "US",
  mx: "MX", mex: "MX", mexico: "MX", mexique: "MX", "estados unidos mexicanos": "MX",
};

function fold(raw: string): string {
  return raw.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");
}

/** Resolve any accepted spelling to its ISO code. Undefined when it names no supported country. */
export function parseCountry(raw: string | undefined | null): CountryCode | undefined {
  if (!raw) return undefined;
  return COUNTRY_NAMES[fold(raw)];
}

export type CountryListParse = { countries?: CountryCode[] } | { error: string };

/**
 * The `country` request parameter: one country or a comma-separated list. Absent or blank gives
 * no list, which the caller reads as "every released country". Duplicates collapse, order is
 * kept, and one unknown entry rejects the whole value rather than silently dropping it.
 */
export function parseCountryList(raw: string | undefined | null): CountryListParse {
  if (raw == null || raw.trim() === "") return {};
  const out: CountryCode[] = [];
  for (const piece of raw.split(",")) {
    if (piece.trim() === "") return { error: `country must be a comma-separated list of ${COUNTRY_CODES.join(", ")}` };
    const code = parseCountry(piece);
    if (!code) {
      return { error: `unknown country "${piece.trim()}". Use ${COUNTRY_CODES.join(", ")}` };
    }
    if (!out.includes(code)) out.push(code);
  }
  return { countries: out };
}

/**
 * US states and the District of Columbia, by USPS code. English names only: the corpus and every
 * US source we would load spell them in English.
 */
const US: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado",
  CT: "connecticut", DE: "delaware", DC: "district of columbia", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas",
  KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts",
  MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana",
  NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey", NM: "new mexico",
  NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma",
  OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west virginia", WI: "wisconsin", WY: "wyoming",
};

/** Extra US spellings that are not a state's own name. */
const US_ALIASES: Record<string, string> = {
  "d.c.": "DC", "washington dc": "DC", "washington d.c.": "DC", "washington, d.c.": "DC",
};

/**
 * Mexico's 32 federal entities, by ISO 3166-2:MX code, with the Spanish names INEGI publishes
 * (folded, so "Nuevo León" and "nuevo leon" both match). "México" alone is the State of Mexico,
 * as ISO and INEGI both read it; Mexico City is CMX.
 */
const MX: Record<string, readonly string[]> = {
  AGU: ["aguascalientes"], BCN: ["baja california"], BCS: ["baja california sur"],
  CAM: ["campeche"], CHP: ["chiapas"], CHH: ["chihuahua"],
  CMX: ["ciudad de mexico", "cdmx", "mexico city"], COA: ["coahuila", "coahuila de zaragoza"],
  COL: ["colima"], DUR: ["durango"], GUA: ["guanajuato"], GRO: ["guerrero"], HID: ["hidalgo"],
  JAL: ["jalisco"], MEX: ["mexico", "estado de mexico", "state of mexico"],
  MIC: ["michoacan", "michoacan de ocampo"], MOR: ["morelos"], NAY: ["nayarit"],
  NLE: ["nuevo leon"], OAX: ["oaxaca"], PUE: ["puebla"], QUE: ["queretaro"],
  ROO: ["quintana roo"], SLP: ["san luis potosi"], SIN: ["sinaloa"], SON: ["sonora"],
  TAB: ["tabasco"], TAM: ["tamaulipas"], TLA: ["tlaxcala"],
  VER: ["veracruz", "veracruz de ignacio de la llave"], YUC: ["yucatan"], ZAC: ["zacatecas"],
};

function usLookup(): Record<string, string> {
  const out: Record<string, string> = { ...US_ALIASES };
  for (const [code, name] of Object.entries(US)) {
    out[code.toLowerCase()] = code;
    out[name] = code;
  }
  return out;
}

function mxLookup(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [code, names] of Object.entries(MX)) {
    out[code.toLowerCase()] = code;
    for (const name of names) out[name] = code;
  }
  return out;
}

const US_LOOKUP = usLookup();
const MX_LOOKUP = mxLookup();

const SUBDIVISION_CODES: Record<CountryCode, readonly string[]> = {
  CA: REGION_CODES,
  US: Object.keys(US).sort(),
  MX: Object.keys(MX).sort(),
};

/** The subdivision codes of one country, for validation messages. */
export function subdivisionCodes(country: CountryCode): readonly string[] {
  return SUBDIVISION_CODES[country];
}

/**
 * Resolve a subdivision spelling inside one country. `CA` gives undefined in Canada (it is not a
 * province) and `CA` (California) in the United States. Canada keeps its own resolver, which
 * already knows the French names and the dotted abbreviations.
 */
export function parseSubdivision(country: CountryCode, raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  if (country === "CA") return parseRegion(raw);
  const key = fold(raw);
  return (country === "US" ? US_LOOKUP : MX_LOOKUP)[key];
}

/**
 * Every spelling the corpus may hold for one subdivision, uppercased, for the SQL filter. Same
 * reason as `regionForms`: the loaders pass the source's own `region` value through.
 */
export function subdivisionForms(country: CountryCode, code: string): string[] {
  const forms = new Set<string>([code.toUpperCase()]);
  if (country === "CA") {
    for (const [k, v] of Object.entries(REGIONS)) if (v === code) forms.add(k.toUpperCase());
  } else if (country === "US") {
    const name = US[code];
    if (name) forms.add(name.toUpperCase());
  } else {
    for (const name of MX[code] ?? []) forms.add(name.toUpperCase());
  }
  return [...forms];
}

const CA_POSTCODE = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
const US_ZIP = /^(\d{5})(?:-?(\d{4}))?$/;
const MX_CP = /^\d{5}$/;

export type PostalParse = { postalcode: string } | { error: string };

/**
 * Normalise and check a postal code's syntax for one country. Codes are strings throughout, so a
 * leading zero ("02134", "01000") survives. Syntax only: a well-formed code is not a claim that
 * the code exists or that mail is delivered to it.
 *
 *   - CA: six characters, no space, uppercase ("M5H2N2").
 *   - US: five-digit ZIP ("02134") or ZIP+4 with its hyphen ("02134-1234").
 *   - MX: five-digit código postal ("01000").
 */
export function parsePostalCode(country: CountryCode, raw: string): PostalParse {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (country === "CA") {
    return CA_POSTCODE.test(compact)
      ? { postalcode: compact }
      : { error: `postalcode must be a Canadian postal code such as M5H 2N2 (got "${raw}")` };
  }
  if (country === "US") {
    const m = US_ZIP.exec(compact);
    return m
      ? { postalcode: m[2] ? `${m[1]}-${m[2]}` : m[1]! }
      : { error: `postalcode must be a US ZIP code such as 02134 or 02134-1234 (got "${raw}")` };
  }
  return MX_CP.test(compact)
    ? { postalcode: compact }
    : { error: `postalcode must be a five-digit Mexican postal code such as 01000 (got "${raw}")` };
}
