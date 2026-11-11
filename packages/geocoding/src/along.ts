import {
  inCanadianServiceArea,
  inWgs84,
  OUTSIDE_COVERAGE_CODE,
  OUTSIDE_COVERAGE_MESSAGE,
  WGS84_RANGE_MESSAGE,
} from "./canada-service-area";

/**
 * Imported as `@unmap/geocoding/along`, not from the package root: `checkAlongLine` tests every
 * vertex against the Canada service-area polygon, and re-exporting it from the root put that
 * polygon in the SDK's browser bundle (+38 KB gzip, over its ceiling) for a check only the gateway
 * and the container run.
 *
 * The contract for `POST /places/along`: places within a few metres of a route, in the order the
 * route reaches them.
 *
 * One module, three readers. The gateway validates the public request with it, the geocode
 * container re-checks the line it is handed, and the SDK documents the same numbers. Bounds that
 * live as literals on two sides drift (docs/decisions/2026-09-20-one-source-for-request-contracts.md
 * found three such cases), so these exist once.
 */
export const PLACES_ALONG = {
  /** Vertices in the route line. A 100 km drive from `/route` is well under this. */
  maxVertices: 2000,
  /**
   * Total line length. Walks, rides and "coffee on the way" across a city drive; a provincial
   * highway trip is a different question (stops near exits), not a longer corridor.
   */
  maxLengthMeters: 100_000,
  /** Metres either side of the line. Out-of-range values are clamped, as `/places/nearby` clamps. */
  radius: { min: 10, max: 500, default: 50 },
  /** Results returned. Out-of-range values are a 400, as `/places/nearby`'s `limit` is. */
  limit: { min: 1, max: 200, default: 50 },
} as const;

export type AlongLine = [number, number][];

export type AlongLineCheck =
  | { ok: true; line: AlongLine; lengthMeters: number }
  | { ok: false; status: 400 | 422; code: "bad_request" | typeof OUTSIDE_COVERAGE_CODE; error: string };

const R = 6_371_008.8;

/** Great-circle length of a `[lng, lat]` line, in metres. */
export function lineLengthMeters(line: AlongLine): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const [lng1, lat1] = line[i - 1]!;
    const [lng2, lat2] = line[i]!;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = p2 - p1;
    const dl = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

function bad(error: string): AlongLineCheck {
  return { ok: false, status: 400, code: "bad_request", error };
}

/**
 * Validate a route line: a GeoJSON LineString, which is exactly what `/route` returns as
 * `geometry`, so a caller passes one response straight into the next request.
 *
 * Only a LineString. A Feature or a MultiLineString would each be a second spelling of the same
 * input, and the error names the field to pass instead. A third coordinate (elevation) is
 * accepted and dropped, because GeoJSON allows it and `/elevation`-enriched lines carry it.
 */
export function checkAlongLine(value: unknown): AlongLineCheck {
  const shape = "route must be a GeoJSON LineString, e.g. the geometry /route returns";
  if (typeof value !== "object" || value === null) return bad(shape);
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type !== "LineString" || !Array.isArray(g.coordinates)) return bad(shape);
  if (g.coordinates.length < 2) return bad("route needs at least 2 coordinates");
  if (g.coordinates.length > PLACES_ALONG.maxVertices) {
    return bad(`route has ${g.coordinates.length} coordinates; at most ${PLACES_ALONG.maxVertices}. Simplify the line first.`);
  }
  const line: AlongLine = [];
  for (const c of g.coordinates) {
    if (!Array.isArray(c) || c.length < 2 || c.length > 3 || !c.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return bad("every route coordinate must be [lng, lat] with finite numbers");
    }
    const [lng, lat] = c as [number, number];
    if (!inWgs84(lng, lat)) return { ok: false, status: 400, code: "bad_request", error: WGS84_RANGE_MESSAGE };
    line.push([lng, lat]);
  }
  const lengthMeters = lineLengthMeters(line);
  if (lengthMeters > PLACES_ALONG.maxLengthMeters) {
    return bad(`route is ${Math.round(lengthMeters / 1000)} km; at most ${PLACES_ALONG.maxLengthMeters / 1000} km`);
  }
  // Every vertex, not just the ends: a line from Windsor to Montréal through Michigan and New
  // York has Canadian endpoints and an American middle the corpus cannot answer for.
  if (!line.every(([lng, lat]) => inCanadianServiceArea(lng, lat))) {
    return { ok: false, status: 422, code: OUTSIDE_COVERAGE_CODE, error: OUTSIDE_COVERAGE_MESSAGE };
  }
  return { ok: true, line, lengthMeters };
}

/** `radius`, clamped. Undefined means the default; anything that is not a finite number is null. */
export function alongRadius(raw: unknown): number | null {
  if (raw === undefined) return PLACES_ALONG.radius.default;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.min(PLACES_ALONG.radius.max, Math.max(PLACES_ALONG.radius.min, raw));
}

/** `limit`, checked. Undefined means the default; out of range or not an integer is null. */
export function alongLimit(raw: unknown): number | null {
  if (raw === undefined) return PLACES_ALONG.limit.default;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < PLACES_ALONG.limit.min || raw > PLACES_ALONG.limit.max) return null;
  return raw;
}
