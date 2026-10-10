/**
 * Energy-query detect for wells / facilities.
 *
 * UWI grammars are Township Canada's `web/server/utils/regex.js` (`uwi`, `bc_uwi`).
 * Well licences are only treated as energy when they carry a clear prefix (`W`,
 * `WL`, `LIC` / `LICENCE` / `LICENSE`). Bare digits stay civic.
 * Facility names are too generic: they are energy only when the caller asks
 * (`?layers=well|facility` or `profile`/`source=energy`).
 */

export const ENERGY_SEARCH_LAYERS = ["well", "facility"] as const;
export type EnergySearchLayer = (typeof ENERGY_SEARCH_LAYERS)[number];

export type EnergyQueryKind = "uwi" | "licence";

export interface EnergyQuery {
  kind: EnergyQueryKind;
  /** Trimmed original. */
  raw: string;
  /** Lookup key: UWI uppercased, or licence digits. */
  key: string;
}

/**
 * AER ST37 (`00/…`, `F1/…`) and Petrinex/IHS (`102/…`) DLS UWI.
 * Format: LocationExceptionCode/LSD-Section-Township-Range-Meridian/EventSequence
 */
const DLS_UWI =
  /^\s*(?:[A-Z0-9]{2}|\d{3})\/(1[0-6]|0?[1-9])-(3[0-6]|[12][0-9]|0?[1-9])-(1[0-2][0-9]|0?[1-9][0-9]|00[1-9])-(([1-8][0-9]|9[0-3]|0?[1-9])\s*(w[1-6]|e[1-2]|[1-6]))\s*m?\/?(\w{1,2})?\s*$/i;

/**
 * BC NTS UWI: `200/B-039-H/094-B-08/00`
 * Format: LocationExceptionCode/Unit-Block-Quadrant/MapArea-Group-Sheet/EventSequence
 */
const BC_UWI =
  /^\s*\d{3}\/(a|b|c|d)(\s*-\s*|\s+)?((00|0)?[1-9]|0?[1-9][0-9]|100)(\s*-\s*|\s+)?(a|b|c|d|e|f|g|h|i|j|k|l)\s*?\/\s*(0?8[2-9]|0?9[0-9]|10[0-9]|11[0-4])(\s*-\s*|\s+)?(a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p)(\s*-\s*|\s+)?(1[0-6]|0?[1-9])\/\d{1,2}\s*$/i;

/** Prefixed well licence. Bare 5–7 digit strings are not distinctive enough. */
const WELL_LICENCE = /^\s*(?:w|wl|lic(?:\.|ence|ense)?)\s*[-#]?\s*(\d{5,7})\s*$/i;

export function parseEnergyQuery(q: string): EnergyQuery | null {
  if (typeof q !== "string") return null;
  const raw = q.trim();
  if (!raw) return null;
  if (BC_UWI.test(raw) || DLS_UWI.test(raw)) {
    return { kind: "uwi", raw, key: raw.replace(/\s+/g, "").toUpperCase() };
  }
  const licence = WELL_LICENCE.exec(raw);
  if (licence?.[1]) {
    return { kind: "licence", raw, key: licence[1] };
  }
  return null;
}

/** True when `q` is a UWI or a prefixed well licence, not a civic address. */
export function looksLikeEnergyQuery(q: string): boolean {
  return parseEnergyQuery(q) != null;
}

export function parseEnergySearchLayers(raw: string | undefined): EnergySearchLayer[] {
  if (!raw) return [];
  const out: EnergySearchLayer[] = [];
  const seen = new Set<EnergySearchLayer>();
  for (const token of raw.split(",")) {
    const id = token.trim();
    if (id === "well" || id === "facility") {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function isEnergySearchSource(raw: string | undefined): boolean {
  return raw?.trim() === "energy";
}

/**
 * Whether this search should take the energy branch (addon gate + table lookup).
 * Civic strings stay civic unless the caller asked for energy layers/source.
 */
export function energySearchRequested(
  q: string,
  opts: { layers?: string; profile?: string; source?: string } = {},
): boolean {
  if (looksLikeEnergyQuery(q)) return true;
  if (parseEnergySearchLayers(opts.layers).length > 0) return true;
  return isEnergySearchSource(opts.profile) || isEnergySearchSource(opts.source);
}

export interface EnergyDetails {
  uwi?: string;
  licence?: string;
  operator?: string;
  status?: string;
}
