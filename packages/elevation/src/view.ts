/**
 * Sight lines over unmap's terrain tiles: what a window can see, and what is in its way.
 *
 * Pure functions, no network and no decoder. A caller hands `groundHeights` a `TileLoader` that
 * fetches `/terrain/{release}/{z}/{x}/{y}.webp` (the `raster-dem` template a `terrain=on` style
 * carries) and decodes it to RGBA its own way: an `OffscreenCanvas` in the browser, an image
 * library in Node. Every tile is one billed call and is loaded once however many samples fall in
 * it, so a batch over many homes shares its tiles.
 *
 * The heights are the terrain release's: bare ground in most Canadian cities, so hills block a
 * view and houses, towers and trees do not, unless the caller adds them to the heights it reads.
 */

type LngLat = [number, number];

/** An arc of azimuths, in degrees clockwise from north, `from` to `to` inclusive, every `step`. */
export interface Fan {
  from: number;
  to: number;
  step: number;
}

/** One sight line, sampled: metres from the home, and the ground there (null where the model has none). */
export interface ViewRay {
  azimuth: number;
  distances: number[];
  points: LngLat[];
}

/** What one sight line of a fan sees. */
export interface RayResult {
  azimuth: number;
  /** True when the skyline in this direction is mountains, not a nearer hill. */
  clear: boolean;
  /** The skyline point: where the line from the window grazes the ground last. */
  horizon: { lngLat: LngLat; distance: number; height: number; angle: number } | null;
  /** The steepest angle up to any mountain on this line, seen or not, for the skyline's ghost. */
  mountainAngle: number | null;
}

/** Whether a single target (a summit, the downtown towers) can be seen, and what is in the way. */
export interface TargetResult {
  visible: boolean;
  /** The angle up to the target, in degrees above the level line from the window. */
  angle: number;
  distance: number;
  /** The nearer ground that rises highest in the view, and so blocks the target when it is hidden. */
  blocker: { lngLat: LngLat; distance: number; height: number } | null;
}

/** The first sample out from the window, in metres: the next lot over. */
export const NEAREST = 40;

/** Ground this far above the home's own counts as mountain. Calgary's highest hills stop well short of it. */
export const MOUNTAIN_RELIEF = 600;

/**
 * The terrain zoom each sample is read at, by its distance from the home: the finest tiles where a
 * neighbour's rise matters, coarser ones in the mountains, where only the summits do. A z9 tile is
 * about 100 m a pixel at Calgary's latitude, plenty for a peak 100 km off.
 */
export const ZOOM_BANDS: Array<{ within: number; zoom: number }> = [
  { within: 4_000, zoom: 12 },
  { within: 12_000, zoom: 11 },
  { within: 35_000, zoom: 10 },
  { within: Infinity, zoom: 9 },
];

const EARTH_RADIUS_M = 6_371_008.8;
/** Standard atmospheric refraction: light bends a little with the curve, so a little less is hidden. */
export const REFRACTION = 0.13;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceMetres(a: LngLat, b: LngLat): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The initial bearing from `a` to `b`, in degrees clockwise from north, 0 to 360. */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  const φ1 = toRadians(a[1]);
  const φ2 = toRadians(b[1]);
  const Δλ = toRadians(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** The point `metres` from `origin` along `azimuth`, on the sphere, rounded to five decimals (about a metre). */
export function destination(origin: LngLat, azimuth: number, metres: number): LngLat {
  const δ = metres / EARTH_RADIUS_M;
  const θ = toRadians(azimuth);
  const φ1 = toRadians(origin[1]);
  const λ1 = toRadians(origin[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [round5(toDegrees(λ2)), round5(toDegrees(φ2))];
}

function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * `count` distances from `near` to `far`, each a fixed ratio past the last: about 100 m apart a
 * kilometre out, a few kilometres apart in the mountains, where only the summits matter.
 */
export function sampleDistances(count: number, far: number, near = NEAREST): number[] {
  if (count <= 1) return [far];
  const ratio = (far / near) ** (1 / (count - 1));
  return Array.from({ length: count }, (_value, index) => (index === count - 1 ? far : near * ratio ** index));
}

/** A sight line from `origin` along `azimuth`, sampled at `distances`. */
export function sightRay(origin: LngLat, azimuth: number, distances: number[]): ViewRay {
  return { azimuth, distances, points: distances.map((distance) => destination(origin, azimuth, distance)) };
}

/** The fan's azimuths, inclusive of both ends. */
export function fanAzimuths(fan: Fan): number[] {
  const out: number[] = [];
  for (let azimuth = fan.from; azimuth <= fan.to + 1e-9; azimuth += fan.step) out.push(azimuth);
  return out;
}

/** The fan's sight lines, every one `reach` metres long and sampled `samples` times. */
export function fanRays(origin: LngLat, fan: Fan, reach: number, samples: number): ViewRay[] {
  const distances = sampleDistances(samples, reach);
  return fanAzimuths(fan).map((azimuth) => sightRay(origin, azimuth, distances));
}

/** A sight line ending exactly on `target`. */
export function targetRay(origin: LngLat, target: LngLat, samples: number): ViewRay {
  const ray = sightRay(origin, bearingDegrees(origin, target), sampleDistances(samples, distanceMetres(origin, target), Math.min(NEAREST, distanceMetres(origin, target) / samples)));
  ray.points[ray.points.length - 1] = [round5(target[0]), round5(target[1])];
  return ray;
}

/**
 * How far the ground at `metres` sits below the level line from the window, from the Earth's
 * curve less the share refraction gives back: about 680 m at 100 km.
 */
export function curveDrop(metres: number, refraction = REFRACTION): number {
  return ((metres * metres) / (2 * EARTH_RADIUS_M)) * (1 - refraction);
}

/** The angle up (or down) from the window to ground of `height` at `metres`, in degrees. */
export function sightAngle(eyeHeight: number, metres: number, height: number): number {
  return toDegrees(Math.atan2(height - curveDrop(metres) - eyeHeight, metres));
}

/**
 * What a sight line of a fan sees from a window at `eyeHeight` (metres above sea level) over
 * ground at `groundHeight`. The skyline point is the sample at the steepest angle up; the line is
 * clear when that sample is mountain, at least `relief` above the home's own ground.
 */
export function readRay(ray: ViewRay, heights: (number | null)[], groundHeight: number, eyeHeight: number, relief = MOUNTAIN_RELIEF): RayResult {
  let best = -Infinity;
  let at = -1;
  let mountainAngle: number | null = null;
  for (let index = 0; index < ray.distances.length; index++) {
    const height = heights[index];
    if (height === null || height === undefined) continue;
    const angle = sightAngle(eyeHeight, ray.distances[index]!, height);
    if (angle > best) {
      best = angle;
      at = index;
    }
    if (height >= groundHeight + relief && (mountainAngle === null || angle > mountainAngle)) mountainAngle = angle;
  }
  if (at < 0) return { azimuth: ray.azimuth, clear: false, horizon: null, mountainAngle: null };
  const height = heights[at]!;
  return {
    azimuth: ray.azimuth,
    clear: height >= groundHeight + relief,
    horizon: { lngLat: ray.points[at]!, distance: ray.distances[at]!, height, angle: best },
    mountainAngle,
  };
}

/**
 * Whether the last sample of `ray` (a summit, or the towers `targetLift` metres above their
 * street) can be seen: nothing nearer rises to a steeper angle. Within a hundredth of a degree
 * counts as seen, the model's own half-metre steps.
 */
export function readTarget(ray: ViewRay, heights: (number | null)[], eyeHeight: number, targetLift = 0): TargetResult | null {
  const last = ray.distances.length - 1;
  const ground = heights[last];
  if (ground === null || ground === undefined) return null;
  const distance = ray.distances[last]!;
  const angle = sightAngle(eyeHeight, distance, ground + targetLift);
  let best = -Infinity;
  let blocker: TargetResult["blocker"] = null;
  for (let index = 0; index < last; index++) {
    const height = heights[index];
    if (height === null || height === undefined) continue;
    const nearer = sightAngle(eyeHeight, ray.distances[index]!, height);
    if (nearer > best) {
      best = nearer;
      blocker = { lngLat: ray.points[index]!, distance: ray.distances[index]!, height };
    }
  }
  return { visible: angle >= best - 0.01, angle, distance, blocker };
}

/** The terrain zoom to read a sample at, by its distance from the home. */
export function zoomFor(metres: number): number {
  return ZOOM_BANDS.find((band) => metres < band.within)!.zoom;
}

/** A terrain tile, decoded: its RGBA pixels, row by row, `size` on a side. */
export interface TerrainTile {
  size: number;
  data: ArrayLike<number>;
}

/** Terrarium: `elevation = R * 256 + G + B / 256 - 32768`, the encoding unmap's terrain uses. */
export function terrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** The tile a coordinate falls in at zoom `z`, and its fractional pixel inside a `size` tile. */
export function tilePixel(lng: number, lat: number, z: number, size: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const gx = ((lng + 180) / 360) * n;
  const gy = ((1 - Math.asinh(Math.tan(toRadians(lat))) / Math.PI) / 2) * n;
  const x = Math.floor(gx);
  const y = Math.floor(gy);
  return { x, y, px: (gx - x) * size, py: (gy - y) * size };
}

/**
 * The height at a pixel position, bilinear between the four pixel centres around it. At a tile's
 * edge the nearest pixels stand in for the neighbour's: a few metres of error, never a hole.
 */
export function sampleTile(tile: TerrainTile, px: number, py: number): number {
  const size = tile.size;
  const fx = Math.min(Math.max(px - 0.5, 0), size - 1);
  const fy = Math.min(Math.max(py - 0.5, 0), size - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const at = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    return terrarium(tile.data[i]!, tile.data[i + 1]!, tile.data[i + 2]!);
  };
  const tx = fx - x0;
  const ty = fy - y0;
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Loads one terrain tile, null where the terrain has none. */
export type TileLoader = (z: number, x: number, y: number) => Promise<TerrainTile | null>;

/**
 * The ground under every sample of every ray, each read at its distance's zoom. Each tile is
 * loaded once however many samples fall in it, all of them at once. `home` is read at the finest
 * zoom and answered first.
 */
export async function groundHeights(home: LngLat, rays: ViewRay[], load: TileLoader): Promise<{ ground: number | null; perRay: (number | null)[][] }> {
  const wanted = new globalThis.Map<string, Promise<TerrainTile | null>>();
  const read = (lngLat: LngLat, metres: number) => {
    const z = zoomFor(metres);
    const at = tilePixel(lngLat[0], lngLat[1], z, 512);
    const id = `${z}/${at.x}/${at.y}`;
    if (!wanted.has(id)) wanted.set(id, load(z, at.x, at.y));
    return { id, at };
  };
  const homeRead = read(home, 0);
  const rayReads = rays.map((ray) => ray.points.map((point, index) => read(point, ray.distances[index]!)));
  const ids = [...wanted.keys()];
  const loaded = await Promise.all(ids.map((id) => wanted.get(id)!));
  const tiles = new globalThis.Map(ids.map((id, index) => [id, loaded[index]!]));
  const height = ({ id, at }: { id: string; at: { px: number; py: number } }) => {
    const tile = tiles.get(id);
    if (!tile) return null;
    const scale = tile.size / 512;
    return sampleTile(tile, at.px * scale, at.py * scale);
  };
  return { ground: height(homeRead), perRay: rayReads.map((reads) => reads.map(height)) };
}

/** The share of the fan that reaches the mountains, 0 to 1. */
export function viewShare(results: RayResult[]): number {
  const read = results.filter((result) => result.horizon !== null);
  return read.length === 0 ? 0 : read.filter((result) => result.clear).length / read.length;
}

/**
 * The widest run of blocked lines in the fan: its middle azimuth, and the median distance to
 * what blocks it. Null when nothing is blocked.
 */
export function widestBlock(results: RayResult[]): { azimuth: number; distance: number } | null {
  let best: RayResult[] = [];
  let run: RayResult[] = [];
  for (const result of results) {
    if (result.horizon && !result.clear) run.push(result);
    else run = [];
    if (run.length > best.length) best = [...run];
  }
  if (best.length === 0) return null;
  const distances = best.map((result) => result.horizon!.distance).sort((a, b) => a - b);
  return { azimuth: (best[0]!.azimuth + best[best.length - 1]!.azimuth) / 2, distance: distances[Math.floor(distances.length / 2)]! };
}
