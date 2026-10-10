import area from "./canada-service-area.json";

/**
 * Whether a WGS84 point is inside the Canadian geocoding and routing service area.
 *
 * This is a coverage mask, not a new dataset and not a product polygon. It is Natural Earth
 * 10m admin-0 (public domain): the Canada polygon, Hudson Bay, the Arctic channels and the
 * Gulf of St. Lawrence, with US land removed. Coastal harbours stay inside via the sea strip
 * described below.
 * Natural Earth assigns the Great Lakes to the United States, so those water boxes are added
 * back. US land inside the boxes is removed again, including the Keweenaw, Alpena, Bayfield,
 * and the lake islands. Point Roberts and both islands of Saint-Pierre-et-Miquelon are cut
 * out. The mask is simplified at 0.012°, except the US shoreline cut out of those boxes, which
 * follows the 10m land edge. Canada land that simplification removed is put back, except
 * Point Roberts. A 0.18° strip of sea outside that shoreline is included, so Kugluktuk,
 * Umiujaq, Mary's Harbour, Postville, Rigolet, Cartwright, Twillingate, Change Islands,
 * Crow Head, and St. Brendan's stay inside. United States land more than 0.012° outside
 * the Canada polygon is cut back out, so Eastport and the Alaska shore south of Hyder stay
 * out. Water within 0.02° of the United States shore and outside that polygon is cut back
 * out, so Lubec stays out. Detroit, Port Huron, Point Roberts, and Blaine stay out. The
 * 0.012° simplification still covers a thinner sliver: Calais and St. Stephen's downtown
 * both sit in it.
 * Islands the admin file omits are included when the land file has them and they are closer
 * to Canada than to the United States, including Mayne Island, Big Tancook, and Île aux Grues.
 * A rectangle is not used: it cannot separate Windsor from Detroit.
 *
 * Open water inside this mask is still Canada. A route that fails there is `no_route`, not
 * `outside_coverage`. Iqaluit is inside the mask.
 *
 * Kept off the package root on purpose. Importing it from `index.ts` would put the mask in
 * every browser bundle of the geocoding client.
 */
type Ring = readonly (readonly [number, number])[];

const BBOX = area.bbox as unknown as readonly [number, number, number, number];
const POLYGONS = area.polygons as unknown as readonly (readonly Ring[])[];

/** Machine-readable code for a coordinate outside this mask. */
export const OUTSIDE_COVERAGE_CODE = "outside_coverage";

/** English error string. The OpenAPI error schema says messages are English. */
export const OUTSIDE_COVERAGE_MESSAGE = "outside Canadian coverage";

/**
 * English error string for a number that is not a WGS84 degree.
 * That is a bad request, not a point outside this mask.
 */
export const WGS84_RANGE_MESSAGE = "longitude is -180..180 and latitude -90..90";

/** True for a finite longitude and latitude. False is not "outside Canada". */
export function inWgs84(lng: number, lat: number): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function ringContains(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  let previousIndex = ring.length - 1;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (current && previous) {
      const [xi, yi] = current;
      const [xj, yj] = previous;
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    previousIndex = index;
  }
  return inside;
}

/** True when geocoding and routing will try to answer this point. False for non-finite input. */
export function inCanadianServiceArea(lng: number, lat: number): boolean {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  const [west, south, east, north] = BBOX;
  if (lng < west || lng > east || lat < south || lat > north) return false;
  for (const polygon of POLYGONS) {
    const shell = polygon[0];
    if (!shell || !ringContains(lng, lat, shell)) continue;
    let inHole = false;
    for (let hole = 1; hole < polygon.length; hole++) {
      const interior = polygon[hole];
      if (interior && ringContains(lng, lat, interior)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}
