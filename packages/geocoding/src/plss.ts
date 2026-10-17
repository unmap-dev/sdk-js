/**
 * US Public Land Survey System (PLSS) legal descriptions.
 *
 * A different survey system from the Dominion Land Survey, not a dialect of it: PLSS townships
 * are numbered North or South of a base line and ranges East or West of a principal meridian,
 * there are about forty meridians, sections are numbered boustrophedon from the north-east
 * corner, and the irregular cells along the north and west edges are government lots rather than
 * aliquot parts. So it has its own parser, its own `system` (`PLSS` / `plss`) and its own table.
 *
 * This module only parses. A parse is a structured candidate, never a coordinate: the Land
 * container answers from BLM CadNSDI rows, and a parse with no row is `[]`.
 *
 * The meridian is part of the identity. "T2N R3W" exists under most of the meridians below, so a
 * township and range with no meridian and no state is ambiguous and says so (`disambiguation`)
 * instead of picking one. The state-to-meridian table is what BLM's own national CadNSDI
 * township layer reports (distinct STATEABBR / PRINMERCD / PRINMER, read 2026-10-16), keeping a
 * pair only where PRINMER names the meridian its code stands for; rows whose PRINMER was null,
 * the bare code, or another meridian's name were left out as source noise.
 */

export interface PlssMeridian {
  /** BLM principal meridian code (CadNSDI PRINMERCD), two digits. */
  code: string;
  /** Name used in canonical descriptions. */
  name: string;
  /** States whose CadNSDI townships carry this code. */
  states: readonly string[];
}

/** BLM principal meridian codes. Codes 35, 42 and 43 do not appear in the national service. */
export const PLSS_MERIDIANS: readonly PlssMeridian[] = [
  { code: "01", name: "First Principal Meridian", states: ["IN", "OH"] },
  { code: "02", name: "Second Principal Meridian", states: ["IL", "IN"] },
  { code: "03", name: "Third Principal Meridian", states: ["IL"] },
  { code: "04", name: "Fourth Principal Meridian", states: ["IL"] },
  { code: "05", name: "Fifth Principal Meridian", states: ["AR", "IA", "KS", "MN", "MO", "ND", "SD"] },
  { code: "06", name: "Sixth Principal Meridian", states: ["CO", "KS", "NE", "SD", "WY"] },
  { code: "07", name: "Black Hills Meridian", states: ["SD"] },
  { code: "08", name: "Boise Meridian", states: ["ID"] },
  { code: "09", name: "Chickasaw Meridian", states: ["AR", "MS"] },
  { code: "10", name: "Choctaw Meridian", states: ["AR", "MS"] },
  { code: "11", name: "Cimarron Meridian", states: ["OK"] },
  { code: "12", name: "Copper River Meridian", states: ["AK"] },
  { code: "13", name: "Fairbanks Meridian", states: ["AK"] },
  { code: "14", name: "Gila and Salt River Meridian", states: ["AZ", "CA"] },
  { code: "15", name: "Humboldt Meridian", states: ["CA"] },
  { code: "16", name: "Huntsville Meridian", states: ["AL"] },
  { code: "17", name: "Indian Meridian", states: ["OK"] },
  { code: "18", name: "Louisiana Meridian", states: ["LA"] },
  { code: "19", name: "Michigan Meridian", states: ["MI", "OH"] },
  { code: "20", name: "Principal Meridian Montana", states: ["MT"] },
  { code: "21", name: "Mount Diablo Meridian", states: ["CA", "NV"] },
  { code: "22", name: "Navajo Meridian", states: ["AZ"] },
  { code: "23", name: "New Mexico Principal Meridian", states: ["CO", "NM"] },
  { code: "24", name: "St. Helena Meridian", states: ["LA"] },
  { code: "25", name: "St. Stephens Meridian", states: ["AL", "MS"] },
  { code: "26", name: "Salt Lake Meridian", states: ["UT"] },
  { code: "27", name: "San Bernardino Meridian", states: ["AZ", "CA"] },
  { code: "28", name: "Seward Meridian", states: ["AK"] },
  { code: "29", name: "Tallahassee Meridian", states: ["AL", "FL"] },
  { code: "30", name: "Uintah Special Meridian", states: ["UT"] },
  { code: "31", name: "Ute Meridian", states: ["CO"] },
  { code: "32", name: "Washington Meridian", states: ["MS"] },
  { code: "33", name: "Willamette Meridian", states: ["OR", "WA"] },
  { code: "34", name: "Wind River Meridian", states: ["WY"] },
  { code: "36", name: "Between the Miamis", states: ["OH"] },
  { code: "37", name: "Muskingum River Survey", states: ["OH"] },
  { code: "38", name: "Ohio River Base", states: ["OH"] },
  { code: "39", name: "First Scioto River Base", states: ["OH"] },
  { code: "40", name: "Second Scioto River Base", states: ["OH"] },
  { code: "41", name: "Third Scioto River Base", states: ["OH"] },
  { code: "44", name: "Kateel River Meridian", states: ["AK"] },
  { code: "45", name: "Umiat Meridian", states: ["AK"] },
  { code: "46", name: "Fourth Principal Meridian Extended", states: ["MN", "WI"] },
  { code: "47", name: "West of the Great Miami River", states: ["OH"] },
  { code: "48", name: "US Military Survey", states: ["OH"] },
];

const MERIDIAN_BY_CODE: ReadonlyMap<string, PlssMeridian> = new Map(PLSS_MERIDIANS.map((m) => [m.code, m]));

export function plssMeridian(code: string): PlssMeridian | undefined {
  return MERIDIAN_BY_CODE.get(code);
}

/** States with PLSS townships in CadNSDI, by USPS code. */
export const PLSS_STATE_NAMES: Readonly<Record<string, string>> = {
  AK: "Alaska", AL: "Alabama", AR: "Arkansas", AZ: "Arizona", CA: "California", CO: "Colorado",
  FL: "Florida", IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana", KS: "Kansas",
  LA: "Louisiana", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi",
  MT: "Montana", ND: "North Dakota", NE: "Nebraska", NM: "New Mexico", NV: "Nevada", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", SD: "South Dakota", UT: "Utah", WA: "Washington",
  WI: "Wisconsin", WY: "Wyoming",
};

/**
 * States and districts that never used the PLSS. Naming one is a clear refusal, not a guess:
 * Texas describes land by abstract, block and survey, and the rest by metes and bounds or a
 * state system. None of them is parsed as PLSS, and none is silently folded into it.
 */
export const NON_PLSS_STATE_NAMES: Readonly<Record<string, string>> = {
  CT: "Connecticut", DC: "District of Columbia", DE: "Delaware", GA: "Georgia", HI: "Hawaii",
  KY: "Kentucky", MA: "Massachusetts", MD: "Maryland", ME: "Maine", NC: "North Carolina",
  NH: "New Hampshire", NJ: "New Jersey", NY: "New York", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", TN: "Tennessee", TX: "Texas", VA: "Virginia", VT: "Vermont",
  WV: "West Virginia",
};

export function plssMeridiansForState(state: string): PlssMeridian[] {
  return PLSS_MERIDIANS.filter((m) => m.states.includes(state));
}

/** Why a PLSS parse cannot be looked up as written. */
export type PlssDisambiguationReason =
  | "meridian_required"
  | "state_has_several_meridians"
  | "meridian_not_in_state"
  | "state_required"
  | "conflicting_context"
  | "not_plss_state";

export interface PlssDisambiguation {
  reason: PlssDisambiguationReason;
  message: string;
  /** Meridians the description could belong to. Empty when no PLSS meridian applies. */
  candidates: readonly PlssMeridian[];
}

export type PlssUnit = "twp" | "sec" | "aliquot" | "lot";

export interface PlssComponents {
  state?: string;
  meridian?: string;
  meridianName?: string;
  township: string;
  townshipDir: "N" | "S";
  range: string;
  rangeDir: "E" | "W";
  section?: string;
  /** BLM-style aliquot label, smallest part first: `NWSE`, `N2NE`, `NE`. */
  aliquot?: string;
  /** Government lot number. */
  lot?: string;
  county?: string;
}

export interface PlssParse {
  unit: PlssUnit;
  canonical: string;
  components: PlssComponents;
  disambiguation?: PlssDisambiguation;
}

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

const ORDINALS: Record<string, [string, string]> = {
  "01": ["1ST", "FIRST"],
  "02": ["2ND", "SECOND"],
  "03": ["3RD", "THIRD"],
  "04": ["4TH", "FOURTH"],
  "05": ["5TH", "FIFTH"],
  "06": ["6TH", "SIXTH"],
};

/** Phrase (normalised, single-spaced) to meridian code. Built once; asserted collision-free in tests. */
function meridianPhrases(): Map<string, string> {
  const out = new Map<string, string>();
  const add = (phrase: string, code: string) => {
    const key = phrase.replace(/\s+/g, " ").trim();
    const existing = out.get(key);
    if (existing && existing !== code) throw new Error(`meridian phrase "${key}" maps to ${existing} and ${code}`);
    out.set(key, code);
  };
  for (const m of PLSS_MERIDIANS) {
    const name = m.name.toUpperCase().replace(/\./g, "");
    add(name, m.code);
    const bare = name.replace(/ (PRINCIPAL |SPECIAL )?MERIDIAN$/, "");
    if (bare !== name) {
      add(`${bare} MERIDIAN`, m.code);
      add(`${bare} PRINCIPAL MERIDIAN`, m.code);
      add(`${bare} PM`, m.code);
    }
  }
  for (const [code, [num, word]] of Object.entries(ORDINALS)) {
    for (const lead of [num, word]) {
      add(`${lead} PRINCIPAL MERIDIAN`, code);
      add(`${lead} PM`, code);
      add(`${lead} MERIDIAN`, code);
    }
    add(`${num.replace(/\D/g, "")}PM`, code);
  }
  // Montana: BLM's own PRINMER is "Montana Meridian", the legal name "Principal Meridian,
  // Montana", and the abbreviations in the deeds are PMM and MPM.
  // `P.M.M.` loses its dots in normalise() and arrives as "P M M".
  for (const phrase of ["PMM", "P M M", "MPM", "M P M", "PM MONTANA", "PRINCIPAL MERIDIAN MONTANA", "MONTANA PRINCIPAL MERIDIAN", "MONTANA MERIDIAN"]) {
    add(phrase, "20");
  }
  // Abbreviations in common use whose letters name exactly one meridian.
  const abbreviations: Record<string, string> = {
    BHM: "07", BM: "08", GSRM: "14", "G SRM": "14", "G AND SRM": "14", HM: "15", MDM: "21", MDBM: "21",
    NMPM: "23", SBM: "27", SBBM: "27", SLM: "26", WM: "33", WRM: "34", "4TH PM EXTENDED": "46",
  };
  for (const [phrase, code] of Object.entries(abbreviations)) add(phrase, code);
  return out;
}

const MERIDIAN_PHRASES = meridianPhrases();

function statePhrases(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [code, name] of [...Object.entries(PLSS_STATE_NAMES), ...Object.entries(NON_PLSS_STATE_NAMES)]) {
    out.set(code, code);
    out.set(name.toUpperCase(), code);
  }
  out.set("MONT", "MT");
  return out;
}

const STATE_PHRASES = statePhrases();
const MAX_PHRASE_WORDS = Math.max(
  ...[...MERIDIAN_PHRASES.keys(), ...STATE_PHRASES.keys()].map((p) => p.split(" ").length),
);

const FILLER = new Set(["OF", "THE", "IN"]);

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

const DIR = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", N: "N", S: "S", E: "E", W: "W" } as const;

const TOWNSHIP = /\b(?:TOWNSHIP|TWP|TWN|T)\s*0*(\d{1,3})\s*(NORTH|SOUTH|N|S)\b/;
const RANGE = /\b(?:RANGE|RGE|RNG|R)\s*0*(\d{1,3})\s*(EAST|WEST|E|W)\b/;
/** `(?!\s*\/)` keeps the `S1` of an `S1/2` aliquot from reading as Section 1. */
const SECTION = /\b(?:SECTION|SECT|SEC|S)\s*0*(\d{1,2})\b(?!\s*\/)/;
const LOT = /\b(?:(?:GOVERNMENT|GOVT|GOV)\s+)?LOT\s+0*(\d{1,3})\b/;
/** A `Gallatin County` written before the aliquot parts. A county after the township is read by classifyTail. */
const LEADING_COUNTY = /^((?:[A-Z][A-Z'-]*\s+){1,3})COUNTY\b\s*/;
const EXPLICIT_PART = String.raw`(?:(?:NE|NW|SE|SW)\s*(?:1\/4|\/4)|[NSEW]\s*(?:1\/2|\/2))`;
/** An aliquot run written after the section must carry its fraction marks, or a trailing `NE` would be a quarter instead of Nebraska. */
const EXPLICIT_ALIQUOT_RUN = new RegExp(`^${EXPLICIT_PART}(?:\\s*(?:OF\\s+)?(?:THE\\s+)?${EXPLICIT_PART})*`);
/**
 * Section-township-range shorthand with the directions attached: `12-2N-3W`, or `2N-3W`.
 *
 * It looks exactly like a US street-grid address (`300 S-200 E`, `5 S-3 W`), so it is held to
 * PLSS bounds (SHORTHAND_MAX_*) and, without a section, only counts when a meridian or state
 * follows. Otherwise the query stays civic.
 */
const SHORTHAND =/(?:^|\s)(?:0*(\d{1,2})\s*-\s*)?0*(\d{1,3})\s*([NS])\s*-\s*0*(\d{1,3})\s*([EW])(?=\s|$)/;

/** Highest township number in CadNSDI nationally is 168 (read 2026-10-16). */
const SHORTHAND_MAX_TOWNSHIP = 170;
/** Ranges in the ordinary rectangular surveys stay under this; the shorthand claims no more. */
const SHORTHAND_MAX_RANGE = 110;

/**
 * Two-letter state codes that are also ordinary words. One of these is a state only when it is
 * the last word: "Sec 12 T2N R3W in Montana" is Montana, "Sec 12 T2N R3W, IN" is Indiana.
 */
const WORDLIKE_STATE_CODES = new Set(["IN", "OR", "ME", "OH", "OK", "HI"]);

/**
 * A meridian named in a state it does not reach, that has a sibling which does. The deeds call
 * the Fourth Principal Meridian Extended (Wisconsin, Minnesota) the Fourth Principal Meridian.
 */
const MERIDIAN_IN_STATE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "04": { WI: "46", MN: "46" },
};

const QUARTER_PART = /(NE|NW|SE|SW)(?:\s*1\/4|\/4)?/y;
const HALF_PART = /([NSEW])(?:\s*1\/2|\/2|2)/y;
const QUARTER_PART_EXPLICIT = /(NE|NW|SE|SW)(?:\s*1\/4|\/4)/y;
const HALF_PART_EXPLICIT = /([NSEW])(?:\s*1\/2|\/2)/y;

function normalise(q: string): string {
  return q
    .toUpperCase()
    .replace(/¼/g, " 1/4 ")
    .replace(/½/g, " 1/2 ")
    .replace(/&/g, " AND ")
    .replace(/[.,:;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Span {
  start: number;
  end: number;
}

/** Find `re` in `text`, blank the span so later patterns cannot match inside it, return the match. */
function take(text: { value: string }, re: RegExp, spans: Span[]): RegExpExecArray | null {
  const match = re.exec(text.value);
  if (!match) return null;
  const start = match.index + (match[0].length - match[0].trimStart().length);
  const end = match.index + match[0].length;
  text.value = text.value.slice(0, start) + "|".repeat(end - start) + text.value.slice(end);
  spans.push({ start, end });
  return match;
}

/** Parse a run of aliquot parts. `explicit` requires 1/4 or 1/2 markers on every part. */
function parseAliquot(raw: string, explicit: boolean): string | null {
  const text = raw.replace(/\b(OF|THE)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const parts: string[] = [];
  let at = 0;
  const quarter = explicit ? QUARTER_PART_EXPLICIT : QUARTER_PART;
  const half = explicit ? HALF_PART_EXPLICIT : HALF_PART;
  while (at < text.length) {
    if (text[at] === " ") {
      at++;
      continue;
    }
    quarter.lastIndex = at;
    const q = quarter.exec(text);
    if (q) {
      parts.push(q[1]!);
      at = quarter.lastIndex;
      continue;
    }
    half.lastIndex = at;
    const h = half.exec(text);
    if (h) {
      parts.push(`${h[1]}2`);
      at = half.lastIndex;
      continue;
    }
    return null;
  }
  if (parts.length === 0 || parts.length > 4) return null;
  return parts.join("");
}

/**
 * Greedy longest-phrase match of meridian and state names after the township and range. Up to
 * three words immediately before `COUNTY` are the county. Any other unknown word fails the
 * parse, which is what keeps a civic query that happens to contain "T2N R3W" out of here.
 */
function classifyTail(words: string[]): { meridians: string[]; states: string[]; county?: string } | null {
  const meridians: string[] = [];
  const states: string[] = [];
  let county: string | undefined;
  let pending: string[] = [];
  let lastState: string | undefined;
  let i = 0;
  while (i < words.length) {
    const word = words[i]!;
    if (word === "COUNTY") {
      if (county) return null;
      if (pending.length > 0) {
        county = pending.join(" ");
        pending = [];
      } else if (lastState && PLSS_STATE_NAMES[lastState]) {
        // "Washington County": a county that shares a state's name.
        states.pop();
        county = PLSS_STATE_NAMES[lastState]!.toUpperCase();
      } else {
        return null;
      }
      lastState = undefined;
      i++;
      continue;
    }
    let matched = false;
    for (let n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(" ");
      const meridian = MERIDIAN_PHRASES.get(phrase);
      const wordlike = n === 1 && WORDLIKE_STATE_CODES.has(phrase) && i < words.length - 1;
      const state = meridian || wordlike ? undefined : STATE_PHRASES.get(phrase);
      if (!meridian && !state) continue;
      if (pending.length > 0) return null;
      if (meridian) meridians.push(meridian);
      if (state) states.push(state);
      lastState = state;
      i += n;
      matched = true;
      break;
    }
    if (matched) continue;
    lastState = undefined;
    // A word-like state code that is not last ("in", "or") reads as the word, not the state.
    if ((FILLER.has(word) || WORDLIKE_STATE_CODES.has(word)) && pending.length === 0) {
      i++;
      continue;
    }
    if (pending.length >= 3 || !/^[A-Z][A-Z'-]*$/.test(word)) return null;
    pending.push(word);
    i++;
  }
  if (pending.length > 0) return null;
  return { meridians: [...new Set(meridians)], states: [...new Set(states)], ...(county ? { county } : {}) };
}

function aliquotWords(label: string): string {
  const parts = label.match(/NE|NW|SE|SW|[NSEW]2/g) ?? [];
  return parts.map((p) => (p.endsWith("2") ? `${p[0]}1/2` : `${p}1/4`)).join(" ");
}

function stateName(code: string): string {
  return PLSS_STATE_NAMES[code] ?? NON_PLSS_STATE_NAMES[code] ?? code;
}

function resolve(
  meridians: string[],
  states: string[],
): { meridian?: PlssMeridian; state?: string; disambiguation?: PlssDisambiguation } {
  if (meridians.length > 1 || states.length > 1) {
    return {
      disambiguation: {
        reason: "conflicting_context",
        message: "the description names more than one meridian or state: keep one.",
        candidates: PLSS_MERIDIANS.filter((m) => meridians.includes(m.code)),
      },
    };
  }
  const state = states[0];
  const code = meridians[0];
  if (state && NON_PLSS_STATE_NAMES[state]) {
    const message =
      state === "TX"
        ? "Texas has no Public Land Survey System: its land is described by abstract, block and survey, which is not covered here."
        : `${stateName(state)} has no Public Land Survey System: its land is described by metes and bounds or a state system, which is not covered here.`;
    return { state, disambiguation: { reason: "not_plss_state", message, candidates: [] } };
  }
  if (code) {
    let meridian = MERIDIAN_BY_CODE.get(code)!;
    const sibling = state ? MERIDIAN_IN_STATE[code]?.[state] : undefined;
    if (sibling) meridian = MERIDIAN_BY_CODE.get(sibling)!;
    if (state && !meridian.states.includes(state)) {
      return {
        state,
        disambiguation: {
          reason: "meridian_not_in_state",
          message: `the ${meridian.name} has no townships in ${stateName(state)}: check the meridian or the state.`,
          candidates: plssMeridiansForState(state),
        },
      };
    }
    // A single-state meridian names its state: the Principal Meridian Montana is only Montana.
    const implied = state ?? (meridian.states.length === 1 ? meridian.states[0] : undefined);
    if (!implied) {
      // CadNSDI splits a township at a state line, so a meridian that spans states needs one.
      return {
        disambiguation: {
          reason: "state_required",
          message: `the ${meridian.name} runs through ${meridian.states.map(stateName).join(", ")}: add the state.`,
          candidates: [meridian],
        },
      };
    }
    return { meridian, state: implied };
  }
  if (state) {
    const candidates = plssMeridiansForState(state);
    if (candidates.length === 1) return { meridian: candidates[0]!, state };
    return {
      state,
      disambiguation: {
        reason: "state_has_several_meridians",
        message: `${stateName(state)} has ${candidates.length} principal meridians: add the meridian, e.g. "${candidates[0]!.name}".`,
        candidates,
      },
    };
  }
  return {
    disambiguation: {
      reason: "meridian_required",
      message:
        'a township and range repeat under every principal meridian: add the state or the meridian, e.g. "T2N R3W, Montana" or "T2N R3W PMM".',
      candidates: PLSS_MERIDIANS,
    },
  };
}

/**
 * Parse a PLSS description, or null when `q` is not one.
 *
 * Requires an explicit township with N/S and range with E/W (`T2N R3W`, `Township 2 North,
 * Range 3 West`, or the attached shorthand `12-2N-3W`), which no Canadian survey description
 * carries, so this cannot capture a DLS, NTS, FPS, Ontario or river-lot string. Every other word
 * must be a section, an aliquot part, a government lot, a county, a meridian or a state;
 * anything else makes it a civic query.
 */
export function parsePlss(q: string): PlssParse | null {
  if (typeof q !== "string") return null;
  const normalised = normalise(q);
  if (!normalised || normalised.length > 200) return null;
  const text = { value: normalised };
  const spans: Span[] = [];

  let township: string | undefined;
  let townshipDir: "N" | "S" | undefined;
  let range: string | undefined;
  let rangeDir: "E" | "W" | undefined;
  let section: string | undefined;
  let shorthand = false;

  const t = take(text, TOWNSHIP, spans);
  const r = take(text, RANGE, spans);
  if (t && r) {
    township = t[1]!;
    townshipDir = DIR[t[2] as keyof typeof DIR] as "N" | "S";
    range = r[1]!;
    rangeDir = DIR[r[2] as keyof typeof DIR] as "E" | "W";
  } else if (!t && !r) {
    const s = take(text, SHORTHAND, spans);
    if (!s) return null;
    if (s[1]) section = s[1];
    township = s[2]!;
    townshipDir = s[3] as "N" | "S";
    range = s[4]!;
    rangeDir = s[5] as "E" | "W";
    if (Number(township) > SHORTHAND_MAX_TOWNSHIP || Number(range) > SHORTHAND_MAX_RANGE) return null;
    shorthand = true;
  } else {
    return null;
  }
  if (Number(township) < 1 || Number(range) < 1) return null;

  const lot = take(text, LOT, spans);
  if (!section) {
    const s = take(text, SECTION, spans);
    if (s) section = s[1]!;
  }
  if (section && (Number(section) < 1 || Number(section) > 36)) return null;

  // Split what is left into the run before the first recognised term (where aliquot parts are
  // written) and everything after it (meridian, state, filler).
  const first = Math.min(...spans.map((s) => s.start));
  const prefix = text.value.slice(0, first).replace(/\|/g, " ").trim();
  const rest = text.value.slice(first).replace(/\|+/g, " ").trim();

  let aliquot: string | undefined;
  let head = prefix;
  let leadingCounty: string | undefined;
  const countyMatch = LEADING_COUNTY.exec(head);
  if (countyMatch) {
    leadingCounty = countyMatch[1]!.trim();
    head = head.slice(countyMatch[0].length).trim();
  }
  // A bare number right before the township is the section, as in BLM's own `NWSE 12 T2N R3W`.
  if (!section) {
    const bare = /(?:^|\s)0*(\d{1,2})$/.exec(head);
    if (bare) {
      section = bare[1]!;
      if (Number(section) < 1 || Number(section) > 36) return null;
      head = head.slice(0, bare.index).trim();
    }
  }
  if (head) {
    const parsed = parseAliquot(head, false);
    if (!parsed) return null;
    aliquot = parsed;
  }
  let after = rest;
  if (!aliquot) {
    const run = EXPLICIT_ALIQUOT_RUN.exec(after);
    if (run) {
      const parsed = parseAliquot(run[0], true);
      if (!parsed) return null;
      aliquot = parsed;
      after = after.slice(run[0].length).trim();
    }
  }
  if (aliquot && lot) return null;
  if ((aliquot || lot) && !section) return null;

  const tail = classifyTail(after ? after.split(" ") : []);
  if (!tail) return null;
  // `5 S-3 W` on its own is a street-grid address far more often than a township and range.
  if (shorthand && !section && tail.meridians.length === 0 && tail.states.length === 0) return null;
  if (leadingCounty && tail.county) return null;
  const county = leadingCounty ?? tail.county;
  const resolved = resolve(tail.meridians, tail.states);

  const components: PlssComponents = {
    township,
    townshipDir: townshipDir!,
    range,
    rangeDir: rangeDir!,
  };
  if (resolved.state) components.state = resolved.state;
  if (resolved.meridian) {
    components.meridian = resolved.meridian.code;
    components.meridianName = resolved.meridian.name;
  }
  if (section) components.section = section;
  if (aliquot) components.aliquot = aliquot;
  if (lot) components.lot = lot[1]!;
  if (county) components.county = county.replace(/\w\S*/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());

  const unit: PlssUnit = lot ? "lot" : aliquot ? "aliquot" : section ? "sec" : "twp";
  const pieces: string[] = [];
  if (aliquot) pieces.push(`${aliquotWords(aliquot)} Sec ${section}`);
  else if (lot) pieces.push(`Lot ${components.lot} Sec ${section}`);
  else if (section) pieces.push(`Sec ${section}`);
  pieces.push(`T${township}${townshipDir}`, `R${range}${rangeDir}`);
  if (resolved.meridian) pieces.push(resolved.meridian.name);
  if (resolved.state && (!resolved.meridian || resolved.meridian.states.length > 1)) pieces.push(resolved.state);

  return {
    unit,
    canonical: pieces.join(", "),
    components,
    ...(resolved.disambiguation ? { disambiguation: resolved.disambiguation } : {}),
  };
}

/** The `400` body for a PLSS description that cannot be looked up as written. Shared by the gateway and the Land container. */
export interface PlssDisambiguationBody {
  error: string;
  code: "bad_request";
  reason: PlssDisambiguationReason;
  candidates: { meridian: string; name: string; states: readonly string[] }[];
}

export function plssDisambiguationBody(d: PlssDisambiguation): PlssDisambiguationBody {
  return {
    error: d.message,
    code: "bad_request",
    reason: d.reason,
    candidates: d.candidates.map((m) => ({ meridian: m.code, name: m.name, states: m.states })),
  };
}

/** CadNSDI township id (PLSSID): state, meridian, township, range, duplicate code `0`. */
export function plssTownshipId(c: PlssComponents): string | null {
  if (!c.state || !c.meridian) return null;
  const pad = (n: string) => n.padStart(3, "0");
  return `${c.state}${c.meridian}${pad(c.township)}0${c.townshipDir}${pad(c.range)}0${c.rangeDir}0`;
}

/** CadNSDI first-division id (FRSTDIVID) for a regular numbered section. */
export function plssSectionId(c: PlssComponents): string | null {
  const twp = plssTownshipId(c);
  if (!twp || !c.section) return null;
  return `${twp}SN${c.section.padStart(2, "0")}0`;
}

/**
 * The quarter-quarter labels an aliquot part is made of, or null when it is already at (or
 * below) quarter-quarter level and must match a CadNSDI row exactly.
 *
 * `NE` is NENE, NWNE, SENE and SWNE. `N2` is the eight quarter-quarters of the north half.
 * `N2NE` is NENE and NWNE. This is the only aggregation the Land container does, and it unions
 * BLM's own polygons: it never draws a square.
 */
export function aliquotQuarterQuarters(label: string): string[] | null {
  const parts = label.match(/NE|NW|SE|SW|[NSEW]2/g) ?? [];
  if (parts.join("") !== label || parts.length === 0) return null;
  const QUARTERS = ["NE", "NW", "SE", "SW"] as const;
  const halfOf = (h: string) => QUARTERS.filter((q) => q.includes(h[0]!));
  if (parts.length === 1) {
    const [p] = parts as [string];
    if (p.endsWith("2")) return halfOf(p).flatMap((q) => QUARTERS.map((qq) => `${qq}${q}`));
    return QUARTERS.map((qq) => `${qq}${p}`);
  }
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    if (b.endsWith("2")) return null;
    if (a.endsWith("2")) return halfOf(a).map((qq) => `${qq}${b}`);
    return null;
  }
  return null;
}
