/**
 * Point-in-polygon identify: which catalog features contain a coordinate.
 *
 * Identify-capable layers are a subset of the gateway catalog. `parks`,
 * `rail`, `aboriginal-lands`, `energy.ccs`, and `energy.geothermal` are
 * catalogued for tiles/overlays but have no identify table, so they 400 here
 * rather than return a silent miss. Energy tables are empty-safe: a missing
 * relation is `[]` for that layer, not a 500.
 */

export const LAND_IDENTIFY_LAYER_IDS = [
  "municipalities",
  "survey.dls",
  "survey.nts",
  "survey.parcels",
] as const;

export const ENERGY_IDENTIFY_LAYER_IDS = [
  "energy.wells",
  "energy.pipelines",
  "energy.facilities",
] as const;

/** Routed through the Land container as extra tables. Not a fourth container. */
export const MINING_IDENTIFY_LAYER_IDS = [
  "mining.occurrences",
  "mining.prospectivity",
  "mining.sk-potential",
] as const;

export const IDENTIFY_LAYER_IDS = [
  ...LAND_IDENTIFY_LAYER_IDS,
  ...ENERGY_IDENTIFY_LAYER_IDS,
  "energy.fields",
  "energy.petroleum-tenure",
  "energy.mineral-tenure",
  ...MINING_IDENTIFY_LAYER_IDS,
] as const;

export type IdentifyLayerId = (typeof IDENTIFY_LAYER_IDS)[number];

/** Default when `layers` is omitted: core only, so an account key without add-ons can identify. */
export const DEFAULT_IDENTIFY_LAYERS: readonly IdentifyLayerId[] = ["municipalities"];

export function isIdentifyLayer(id: string): id is IdentifyLayerId {
  return (IDENTIFY_LAYER_IDS as readonly string[]).includes(id);
}

export function isLandIdentifyLayer(id: IdentifyLayerId): boolean {
  return (
    (LAND_IDENTIFY_LAYER_IDS as readonly string[]).includes(id) ||
    (MINING_IDENTIFY_LAYER_IDS as readonly string[]).includes(id)
  );
}

export function isEnergyIdentifyLayer(id: IdentifyLayerId): boolean {
  return id.startsWith("energy.");
}

export function knownIdentifyLayers(): string {
  return IDENTIFY_LAYER_IDS.join(", ");
}

export function parseIdentifyLayers(raw: string | undefined): { layers: IdentifyLayerId[] } | { error: string } {
  const ids = (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (ids.length === 0) {
    return { layers: [...DEFAULT_IDENTIFY_LAYERS] };
  }
  const layers: IdentifyLayerId[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!isIdentifyLayer(id)) {
      return { error: `unknown identify layer "${id}". known: ${knownIdentifyLayers()}` };
    }
    if (!seen.has(id)) {
      seen.add(id);
      layers.push(id);
    }
  }
  return { layers };
}

export function parseIdentifyAt(at: string | undefined): { at: [number, number] } | { error: string } {
  const raw = at?.trim();
  if (!raw) return { error: "at=lng,lat is required" };
  const pieces = raw.split(",");
  if (pieces.length !== 2 || pieces.some((p) => p.trim() === "")) return { error: "at must be lng,lat" };
  const lng = Number(pieces[0]);
  const lat = Number(pieces[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { error: "at must be lng,lat" };
  return { at: [lng, lat] };
}

export interface IdentifyOptions {
  /** `[lng, lat]` in WGS84 degrees. */
  at: [number, number];
  /** Identify-capable catalog ids. Default `municipalities`. Survey layers need `legal-land`. Energy layers need `energy`. `survey.parcels` needs `agriculture`. Mining layers need `mining`. */
  layers?: readonly string[];
  /** Include polygons when the row has one. */
  geometry?: boolean;
  signal?: AbortSignal;
}

export interface IdentifyResult {
  layer: IdentifyLayerId;
  id: string;
  name: string;
  province?: string;
  unit?: string;
  survey_system?: string;
  uwi?: string;
  licence?: string;
  operator?: string;
  status?: string;
  pid?: string;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface IdentifyResponse {
  at: [number, number];
  results: IdentifyResult[];
}
