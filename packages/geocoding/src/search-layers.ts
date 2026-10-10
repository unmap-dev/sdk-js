import { ENERGY_SEARCH_LAYERS, type EnergySearchLayer } from "./energy";

/**
 * `layers=` on `/geocode/search`, `/geocode/autocomplete` and `/geocode/structured`.
 *
 * The parameter already existed and already meant one thing: `layers=well,facility` sends the
 * query to the energy container instead of the civic one. Civic result types are added to the
 * same parameter rather than to a new one, because from the caller's side they are the same
 * question — "which kinds of thing may come back" — and two parameters answering it would have
 * to define what happens when both are set.
 *
 * What the two sets do is genuinely different, and that is why they cannot be mixed:
 * `well`/`facility` select a BACKEND (a different container, a different corpus, gated by the
 * `energy` add-on); the civic values FILTER results inside one corpus. `layers=address,well`
 * has no meaning that is not a guess, so it is a 400 rather than a silent choice.
 *
 * Unknown values are also a 400. That is a tightening: before this, unrecognised tokens were
 * dropped silently, so `layers=adress` searched everything and looked like it had worked.
 */
export const CIVIC_SEARCH_LAYERS = ["address", "street", "locality", "region", "poi"] as const;
export type CivicSearchLayer = (typeof CIVIC_SEARCH_LAYERS)[number];

export type SearchLayersParse =
  | { kind: "none" }
  | { kind: "civic"; layers: CivicSearchLayer[] }
  | { kind: "energy"; layers: EnergySearchLayer[] }
  | { error: string };

const CIVIC = new Set<string>(CIVIC_SEARCH_LAYERS);
const ENERGY = new Set<string>(ENERGY_SEARCH_LAYERS);

/** Every accepted value, for error messages and docs. */
export function knownSearchLayers(): string {
  return [...CIVIC_SEARCH_LAYERS, ...ENERGY_SEARCH_LAYERS].join(", ");
}

export function parseSearchLayers(raw: string | undefined): SearchLayersParse {
  if (raw == null || raw.trim() === "") return { kind: "none" };

  const civic: CivicSearchLayer[] = [];
  const energy: EnergySearchLayer[] = [];
  const seen = new Set<string>();

  for (const token of raw.split(",")) {
    const id = token.trim();
    if (id === "") continue;
    if (seen.has(id)) continue;
    seen.add(id);
    if (CIVIC.has(id)) civic.push(id as CivicSearchLayer);
    else if (ENERGY.has(id)) energy.push(id as EnergySearchLayer);
    else return { error: `unknown layer "${id}". Known layers: ${knownSearchLayers()}` };
  }

  if (civic.length && energy.length) {
    return {
      error:
        `layers cannot mix civic and energy values: ${civic.join(", ")} filter results within ` +
        `the civic corpus, while ${energy.join(", ")} select the energy corpus instead. Ask for one or the other.`,
    };
  }
  if (energy.length) return { kind: "energy", layers: energy };
  if (civic.length) return { kind: "civic", layers: civic };
  return { kind: "none" };
}

/**
 * `focus=lng,lat`: a soft proximity preference.
 *
 * It moves ranking toward the point and excludes nothing — a relevant result on the other side
 * of the country still comes back, behind the near ones. That is the whole distinction from
 * `bbox`, which is a hard filter, and the docs and the UI copy have to keep saying it: "prefer
 * nearby" is not "restrict to this area".
 */
export type FocusParse = { focus: [number, number] } | { error: string } | undefined;

export function parseFocus(raw: string | undefined): FocusParse {
  if (raw == null || raw.trim() === "") return undefined;
  // Each piece must be non-empty before it is a number. `Number("")` is 0, so a trailing comma
  // ("-114,") would otherwise parse as latitude 0 — a point in the Gulf of Guinea, silently
  // accepted, quietly ranking everything by its distance from there.
  const pieces = raw.split(",").map((s) => s.trim());
  const parts = pieces.map((s) => (s === "" ? Number.NaN : Number(s)));
  if (parts.length !== 2 || !parts.every(Number.isFinite)) {
    return { error: "focus must be lng,lat with two finite numbers" };
  }
  const [lng, lat] = parts as [number, number];
  if (lng < -180 || lng > 180) return { error: `focus longitude ${lng} is outside [-180, 180]` };
  if (lat < -90 || lat > 90) return { error: `focus latitude ${lat} is outside [-90, 90]` };
  return { focus: [lng, lat] };
}
