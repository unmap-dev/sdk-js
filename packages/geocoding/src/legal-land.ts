/**
 * Framework-free port of Township Canada's legal-land regex grammar
 * (`api/packages/shared/regex_rules.js` + `helpers.processInput`).
 *
 * A successful parse is a structured candidate, not a geocoder hit. Coordinates,
 * civic addresses, and place names return null — those stay on the civic path.
 *
 * US PLSS descriptions are parsed by `./plss` and surface here as `system: "PLSS"`. That grammar
 * needs an explicit `T…N|S` and `R…E|W`, which no Canadian description carries, so it is tried
 * before the Ontario lot grammar (which would otherwise read "Lot 3 Sec 5 T10S R22E" as an
 * Ontario township named "Sec 5 T10s R22e") and cannot change a Canadian parse.
 */

import { parsePlss, type PlssDisambiguation } from "./plss";

export type LegalLandSystem = "DLS" | "NTS" | "GTS" | "FPS" | "RIVER_LOT" | "PLSS";

export type LegalLandUnit =
  | "lsd"
  | "qtr"
  | "half"
  | "sec"
  | "twp"
  | "nts"
  | "nts_sheet"
  | "lot"
  | "con"
  | "grid"
  | "section"
  | "unit"
  | "river_lot"
  | "aliquot";

export type LegalLandComponents = {
  meridian?: string;
  range?: string;
  township?: string;
  section?: string;
  quarter?: string;
  half?: string;
  lsd?: string;
  quarterUnit?: string;
  ntsUnit?: string;
  block?: string;
  series?: string;
  mapArea?: string;
  mapSheet?: string;
  fpsUnit?: string;
  fpsSection?: string;
  latDeg?: string;
  latMin?: string;
  lonDeg?: string;
  lonMin?: string;
  lot?: string;
  concession?: string;
  townshipName?: string;
  kind?: string;
  parts?: string[];
  /** PLSS: USPS state code, when the description names one or its meridian implies one. */
  state?: string;
  /** PLSS: principal meridian name. `meridian` carries the BLM code (`20`). */
  meridianName?: string;
  /** PLSS township direction. */
  townshipDir?: "N" | "S";
  /** PLSS range direction. */
  rangeDir?: "E" | "W";
  /** PLSS aliquot part, BLM label, smallest part first (`NWSE`, `N2NE`). */
  aliquot?: string;
  /** PLSS: the county the description names. Context only; it is not part of the lookup key. */
  county?: string;
};

export type LegalLandParse = {
  system: LegalLandSystem;
  canonical: string;
  unit: LegalLandUnit;
  components: LegalLandComponents;
  province?: string;
  /**
   * PLSS only: present when the description cannot be looked up as written (no meridian or
   * state, a state with several meridians, or a state that never used the PLSS). The gateway
   * answers `400` with these candidates rather than choosing one.
   */
  disambiguation?: PlssDisambiguation;
};

const SEP = String.raw`(?:\s*-\s*|\s+)`;
const SEP_OPT = String.raw`(?:\s*-\s*|\s+)?`;

const LSD_N = String.raw`(?<lsd>0?[1-9]|1[0-6])`;
const SEC_N = String.raw`(?<section>(?:0?[1-9]|[1-2][0-9]|3[0-6])a?)`;
const TWP_N = String.raw`(?<township>(?:(?:00|0)?[1-9]|0?[1-9][0-9]|1[0-2][0-9])a?)`;
const RGE_N = String.raw`(?<range>(?:0?[1-9]|[1-8][0-9]|9[0-3])a?)`;
const MER_N = String.raw`(?<meridian>[Ww][1-6]|[Ee][1-2])[Mm]?`;

const DLS_LSD = new RegExp(`^${LSD_N}${SEP}${SEC_N}${SEP}${TWP_N}${SEP}${RGE_N}${SEP_OPT}${MER_N}$`, "i");
const DLS_SEC = new RegExp(`^${SEC_N}${SEP}${TWP_N}${SEP}${RGE_N}${SEP_OPT}${MER_N}$`, "i");
const DLS_TWP = new RegExp(`^${TWP_N}${SEP}${RGE_N}${SEP_OPT}${MER_N}$`, "i");
const DLS_QTR_MATCH = new RegExp(`^([ns][ew])(1/4)?(?:\\s*-\\s*|\\s+).*$`, "i");
const DLS_QTR = new RegExp(
  `^(?<quarter>[ns][ew])(?:[\\s-]*1/4)?${SEP_OPT}${SEC_N}${SEP}${TWP_N}${SEP}${RGE_N}${SEP_OPT}${MER_N}$`,
  "i",
);
const DLS_HALF_MATCH = new RegExp(`^([nsew])(1/2)?(?:\\s*-\\s*|\\s+).*$`, "i");
const DLS_HALF = new RegExp(
  `^(?<half>[nsew])(?:[\\s-]*1/2)?${SEP_OPT}${SEC_N}${SEP}${TWP_N}${SEP}${RGE_N}${SEP_OPT}${MER_N}$`,
  "i",
);

const NTS = new RegExp(
  `^(?<quarterUnit>[abcd])${SEP_OPT}(?<ntsUnit>(?:00|0)?[1-9]|0?[1-9][0-9]|100)${SEP_OPT}(?<block>[a-l])\\s*/?\\s*(?<series>0?8[2-9]|0?9[0-9]|10[0-9]|11[0-4])${SEP_OPT}(?<mapArea>[a-p])${SEP_OPT}(?<mapSheet>0?[1-9]|1[0-6])$`,
  "i",
);
const NTS_SHEET = new RegExp(
  `^(?<series>0?8[2-9]|0?9[0-9]|10[0-9]|11[0-4])(?<mapArea>[a-p])\\s*/?\\s*(?<mapSheet>0?[1-9]|1[0-6])$`,
  "i",
);

const FPS_UNIT = /^([a-p])\s+(\d{1,2})\s+(\d{2})-(\d{2})\s+n\s+(\d{1,3})-(\d{1,3})\s+w$/i;
const FPS_SECTION = /^(\d{1,2})\s+(\d{2})-(\d{2})\s+n\s+(\d{1,3})-(\d{1,3})\s+w$/i;
const FPS_GRID = /^(\d{2})-(\d{2})\s+n\s+(\d{1,3})-(\d{1,3})\s+w$/i;

const ON_LOT = /^lot\s+(\d+)(?:\s+(.*))?$/i;
const ON_CON = /^(?:con|concession)\s+(\d+)\s+([\w ]+)$/i;
const ON_CON_IN_REST = /^(?:con|concession)\s+(\d+)\s*(.*)$/i;
const ON_LOT_IN_REST = /^lot\s+(\d+)\s*(.*)$/i;

const RIVER = /^(pl|rl|wl|lx|sl|ot)(?:[\s-]+[a-z0-9]+)+$/i;

function sanitize(q: string): string {
  return q.trim().replace(/['"]/g, "").replace(/[;\\]/g, "");
}

/** Users often glue the quarter/half onto the section: `NW25-24-1-W5`. Leave `N1/2` / `NW1/4` intact. */
function insertDirectionSeparator(q: string): string {
  return q.replace(/^([NS][EW]|[NSEW])(?!1\/[24]\b)(\d)/i, "$1-$2");
}

function cleanPart(value: string): string {
  return value.replace(/^0+(?=\d)/, "").replace(/\/0+/, "/").toUpperCase();
}

function dlsProvince(meridian: string): string | undefined {
  const m = meridian.toUpperCase();
  if (m === "W5") return "AB";
  if (m === "W1" || m === "E1" || m === "E2") return "MB";
  return undefined;
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function groups(re: RegExp, q: string): Record<string, string> | null {
  const match = re.exec(q);
  if (!match?.groups) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(match.groups)) {
    if (value === undefined || value === "") continue;
    out[key] = cleanPart(value);
  }
  return out;
}

function dlsFrom(unit: "lsd" | "qtr" | "half" | "sec" | "twp", g: Record<string, string>): LegalLandParse {
  const meridian = g.meridian!;
  const components: LegalLandComponents = { meridian, range: g.range, township: g.township };
  const pieces: string[] = [];
  if (unit === "lsd") {
    components.lsd = g.lsd;
    components.section = g.section;
    pieces.push(g.lsd!, g.section!);
  } else if (unit === "qtr") {
    components.quarter = g.quarter;
    components.section = g.section;
    pieces.push(g.quarter!, g.section!);
  } else if (unit === "half") {
    components.half = g.half;
    components.section = g.section;
    pieces.push(g.half!, g.section!);
  } else if (unit === "sec") {
    components.section = g.section;
    pieces.push(g.section!);
  }
  pieces.push(g.township!, g.range!, meridian);
  const parsed: LegalLandParse = {
    system: "DLS",
    canonical: pieces.join("-"),
    unit,
    components,
  };
  const province = dlsProvince(meridian);
  if (province) parsed.province = province;
  return parsed;
}

function parseDls(q: string): LegalLandParse | null {
  const candidate = insertDirectionSeparator(q);
  const lsd = groups(DLS_LSD, candidate);
  if (lsd) return dlsFrom("lsd", lsd);
  if (DLS_QTR_MATCH.test(candidate)) {
    const qtr = groups(DLS_QTR, candidate);
    if (qtr) return dlsFrom("qtr", qtr);
  }
  if (DLS_HALF_MATCH.test(candidate)) {
    const half = groups(DLS_HALF, candidate);
    if (half) return dlsFrom("half", half);
  }
  const sec = groups(DLS_SEC, candidate);
  if (sec) return dlsFrom("sec", sec);
  const twp = groups(DLS_TWP, candidate);
  if (twp) return dlsFrom("twp", twp);
  return null;
}

function parseNts(q: string): LegalLandParse | null {
  const full = groups(NTS, q);
  if (full) {
    return {
      system: "NTS",
      canonical: `${full.quarterUnit}-${full.ntsUnit}-${full.block}/${full.series}-${full.mapArea}-${full.mapSheet}`,
      unit: "nts",
      components: {
        quarterUnit: full.quarterUnit,
        ntsUnit: full.ntsUnit,
        block: full.block,
        series: full.series,
        mapArea: full.mapArea,
        mapSheet: full.mapSheet,
      },
    };
  }
  const sheet = groups(NTS_SHEET, q);
  if (!sheet) return null;
  return {
    system: "NTS",
    canonical: `${sheet.series}${sheet.mapArea}/${sheet.mapSheet}`,
    unit: "nts_sheet",
    components: {
      series: sheet.series,
      mapArea: sheet.mapArea,
      mapSheet: sheet.mapSheet,
    },
  };
}

function parseFps(q: string): LegalLandParse | null {
  const unit = FPS_UNIT.exec(q);
  if (unit) {
    const components = {
      fpsUnit: unit[1]!.toUpperCase(),
      fpsSection: unit[2]!,
      latDeg: unit[3]!,
      latMin: unit[4]!,
      lonDeg: unit[5]!,
      lonMin: unit[6]!,
    };
    return {
      system: "FPS",
      canonical: `${components.fpsUnit} ${components.fpsSection} ${components.latDeg}-${components.latMin} N ${components.lonDeg}-${components.lonMin} W`,
      unit: "unit",
      components,
    };
  }
  const section = FPS_SECTION.exec(q);
  if (section) {
    const components = {
      fpsSection: section[1]!,
      latDeg: section[2]!,
      latMin: section[3]!,
      lonDeg: section[4]!,
      lonMin: section[5]!,
    };
    return {
      system: "FPS",
      canonical: `${components.fpsSection} ${components.latDeg}-${components.latMin} N ${components.lonDeg}-${components.lonMin} W`,
      unit: "section",
      components,
    };
  }
  const grid = FPS_GRID.exec(q);
  if (!grid) return null;
  const components = {
    latDeg: grid[1]!,
    latMin: grid[2]!,
    lonDeg: grid[3]!,
    lonMin: grid[4]!,
  };
  return {
    system: "FPS",
    canonical: `${components.latDeg}-${components.latMin} N ${components.lonDeg}-${components.lonMin} W`,
    unit: "grid",
    components,
  };
}

function parseGts(q: string): LegalLandParse | null {
  const lot = ON_LOT.exec(q);
  if (lot) {
    const components: LegalLandComponents = { lot: cleanPart(lot[1]!) };
    const rest = (lot[2] ?? "").trim();
    const con = ON_CON_IN_REST.exec(rest);
    const nameBits: string[] = [];
    if (con) {
      components.concession = cleanPart(con[1]!);
      const after = (con[2] ?? "").trim();
      if (after) components.townshipName = titleCase(after);
      nameBits.push(`Con ${components.concession}`);
      if (components.townshipName) nameBits.push(components.townshipName);
    } else if (rest) {
      components.townshipName = titleCase(rest);
      nameBits.push(components.townshipName);
    }
    return {
      system: "GTS",
      canonical: [`Lot ${components.lot}`, ...nameBits].join(" "),
      unit: "lot",
      components,
      province: "ON",
    };
  }
  const con = ON_CON.exec(q);
  if (!con) return null;
  const components: LegalLandComponents = { concession: cleanPart(con[1]!) };
  const rest = con[2]!.trim();
  const nestedLot = ON_LOT_IN_REST.exec(rest);
  if (nestedLot) {
    components.lot = cleanPart(nestedLot[1]!);
    const after = (nestedLot[2] ?? "").trim();
    if (after) components.townshipName = titleCase(after);
  } else {
    components.townshipName = titleCase(rest);
  }
  const tail = [
    components.lot ? `Lot ${components.lot}` : "",
    components.townshipName ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    system: "GTS",
    canonical: [`Con ${components.concession}`, tail].filter(Boolean).join(" "),
    unit: components.lot ? "lot" : "con",
    components,
    province: "ON",
  };
}

function parseRiverLot(q: string): LegalLandParse | null {
  if (!RIVER.test(q)) return null;
  const tokens = q.split(/[\s-]+/).filter(Boolean).map((t) => t.toUpperCase());
  const kind = tokens[0]!;
  const parts = tokens.slice(1);
  return {
    system: "RIVER_LOT",
    canonical: tokens.join("-"),
    unit: "river_lot",
    components: { kind, parts },
    province: "MB",
  };
}

export function parseLegalLand(q: string): LegalLandParse | null {
  if (typeof q !== "string") return null;
  const raw = sanitize(q);
  if (!raw) return null;

  return (
    parseFps(raw) ??
    parsePlssLegalLand(raw) ??
    parseGts(raw) ??
    parseRiverLot(raw) ??
    parseDls(raw) ??
    parseNts(raw)
  );
}

function parsePlssLegalLand(q: string): LegalLandParse | null {
  const plss = parsePlss(q);
  if (!plss) return null;
  return {
    system: "PLSS",
    canonical: plss.canonical,
    unit: plss.unit,
    components: { ...plss.components },
    ...(plss.disambiguation ? { disambiguation: plss.disambiguation } : {}),
  };
}

/** Public `legal_land.system` values on a geocode result (LOCATION-MODEL). */
export type LegalLandLayerSystem = "dls" | "nts" | "fps" | "on" | "river_lot" | "plss";

const LAYER_SYSTEM: Record<LegalLandSystem, LegalLandLayerSystem> = {
  DLS: "dls",
  NTS: "nts",
  GTS: "on",
  FPS: "fps",
  RIVER_LOT: "river_lot",
  PLSS: "plss",
};

/** True when `q` is a well-formed legal-land description, not a civic query. */
export function looksLikeLegalLand(q: string): boolean {
  return parseLegalLand(q) != null;
}

/**
 * Where a PLSS answer came from. Only PLSS results carry it today: the Canadian rows were
 * imported without record ids, so there is nothing comparable to report for them.
 */
export interface LegalLandProvenance {
  /** Source dataset, e.g. "Township America PLSS lookup (from BLM CadNSDI V2)". */
  dataset: string;
  /** Import release the Land container answered from. */
  release?: string;
  /** The BLM CadNSDI ids (PLSSID, FRSTDIVID, SECDIVID) the source carries for the polygons in the answer. */
  record_ids: string[];
  /** The source table's own row ids for the polygons in the answer. */
  source_ids?: string[];
  /** `record`: one stored polygon. `quarter_quarters`: the union of stored quarter-quarters. */
  assembled_from: "record" | "quarter_quarters";
  /** County the source records for the cell. */
  county?: string;
  /** Area of the polygon as stored, in acres. Not a surveyed acreage. */
  mapped_acres: number;
  /** True when a published ring was invalid and was made valid on import. */
  geometry_repaired?: boolean;
  /** What the geometry is and is not. */
  accuracy: string;
}

export interface LegalLandDetails {
  system: LegalLandLayerSystem;
  province?: string;
  /** PLSS: USPS state code. Canadian systems use `province`. */
  state?: string;
  canonical: string;
  unit: LegalLandUnit;
  components: LegalLandComponents;
  provenance?: LegalLandProvenance;
}

/** Map a parse onto the public result block. Does not invent coordinates. */
export function toLegalLandDetails(parsed: LegalLandParse): LegalLandDetails {
  return {
    system: LAYER_SYSTEM[parsed.system],
    ...(parsed.province ? { province: parsed.province } : {}),
    ...(parsed.system === "PLSS" && parsed.components.state ? { state: parsed.components.state } : {}),
    canonical: parsed.canonical,
    unit: parsed.unit,
    components: parsed.components,
  };
}
