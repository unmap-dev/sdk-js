import type { LngLatZ } from "./types";

/**
 * The height to draw a baked point at, on a map whose terrain has this vertical exaggeration.
 *
 * MapLibre draws terrain at `DEM height × exaggeration`, measured from sea level (no offset), and
 * deck.gl layers are not draped on that terrain: they sit at whatever z they are given. A baked z
 * therefore has to be scaled by the same factor to stay on the terrain the map draws. At the
 * default exaggeration of 1 the baked z is returned as is.
 *
 * The whole height is scaled, including the part that is above the ground (a tower, the cable's
 * clearance), because the lifts document carries one z per point, not ground plus offset. At 1.5×
 * a 12 m tower draws 18 m tall: still on the ground at its foot, just taller. Read the map's own
 * value with `map.getTerrain()?.exaggeration ?? 1`.
 */
export function bakedZ(point: LngLatZ, exaggeration = 1): number {
  if (!(Number.isFinite(exaggeration) && exaggeration > 0)) {
    throw new RangeError(`exaggeration must be a positive number, got ${exaggeration}`);
  }
  return (point[2] ?? 0) * exaggeration;
}

/** `point` with its z scaled by `exaggeration`; lng and lat untouched. */
export function scaled(point: LngLatZ, exaggeration: number): LngLatZ {
  return [point[0], point[1], bakedZ(point, exaggeration)];
}

const RAD = Math.PI / 180;

/** Initial great-circle bearing from `a` to `b`, degrees clockwise from north, in [0, 360). */
export function bearing(a: readonly number[], b: readonly number[]): number {
  const [lng1 = 0, lat1 = 0] = a;
  const [lng2 = 0, lat2 = 0] = b;
  const φ1 = lat1 * RAD;
  const φ2 = lat2 * RAD;
  const Δλ = (lng2 - lng1) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

/** Squared planar distance from `p` to segment `a`–`b`, in degrees with longitude scaled by cos(lat). */
export function segmentDistance2(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const k = Math.cos((p[1] ?? 0) * RAD);
  const px = (p[0] ?? 0) * k, py = p[1] ?? 0;
  const ax = (a[0] ?? 0) * k, ay = a[1] ?? 0;
  const bx = (b[0] ?? 0) * k, by = b[1] ?? 0;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}
