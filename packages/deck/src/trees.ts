/**
 * Where the 3D trees go: plain functions, no map and no WebGL, unit-tested in trees.test.ts.
 *
 * Trees are placed per z14 tile. Each tile is rasterised into a mask: the woods (`landuse` kinds
 * `wood` and `forest`, the polygons the basemap already draws), with water and buildings cut out
 * and a strip cleared along every road, river, ski run and lift. A jittered grid then puts at most
 * one tree in each cell that lands on the mask. Every random choice is a hash of the tile and the
 * cell, so a tree is always in the same place, at the same size, from one visit to the next.
 *
 * The trees are a picture of woodland, not an inventory: OpenStreetMap knows where the woods are,
 * not where each tree stands, how tall it is or what species it is.
 */

/** The zoom trees are placed at: the basemap's deepest tiles. */
export const TREE_TILE_ZOOM = 14;

/** Below this map zoom no trees are drawn: they would be too small to read and too many to draw. */
export const TREES_MIN_ZOOM = 13.5;

/** The spacing of the placement grid, in metres: at most one tree per cell. */
export const CELL_M = 13;

/** The share of grid cells on the mask that get a tree. */
export const DENSITY = 0.62;

/** Mask pixels across a tile, per grid cell: the mask is finer than the grid so edges are sharp. */
const MASK_PER_CELL = 2;

const EARTH_CIRCUMFERENCE_M = 40075016.686;

export interface TileId {
  z: number;
  x: number;
  y: number;
}

export function tileKey(tile: TileId): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

/** A longitude and latitude as Web Mercator world coordinates, 0 to 1 across and down. */
export function lngLatToWorld(lng: number, lat: number): [number, number] {
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

/** Web Mercator world coordinates back to a longitude and latitude. */
export function worldToLngLat(mx: number, my: number): [number, number] {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
  return [mx * 360 - 180, lat];
}

/** The tile at `zoom` that holds a point. */
export function tileAt(lng: number, lat: number, zoom = TREE_TILE_ZOOM): TileId {
  const n = 2 ** zoom;
  const [mx, my] = lngLatToWorld(lng, lat);
  return { z: zoom, x: Math.min(n - 1, Math.max(0, Math.floor(mx * n))), y: Math.min(n - 1, Math.max(0, Math.floor(my * n))) };
}

/** The ground width of a tile in metres, at its middle latitude. */
export function tileWidthM(tile: TileId): number {
  const n = 2 ** tile.z;
  const [, lat] = worldToLngLat(0, (tile.y + 0.5) / n);
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / n;
}

/**
 * The tiles within `radiusM` of a point, nearest first: the ones whose trees matter most come
 * first, so a tree budget cuts the far ones.
 */
export function tilesAround(lng: number, lat: number, radiusM: number, zoom = TREE_TILE_ZOOM): TileId[] {
  const n = 2 ** zoom;
  const centre = tileAt(lng, lat, zoom);
  const width = tileWidthM(centre);
  const reach = Math.ceil(radiusM / width);
  const [mx, my] = lngLatToWorld(lng, lat);
  const found: Array<{ tile: TileId; d: number }> = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = centre.x + dx;
      const y = centre.y + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      // Distance from the point to the nearest part of the tile, in metres.
      const nx = Math.max(x / n, Math.min((x + 1) / n, mx));
      const ny = Math.max(y / n, Math.min((y + 1) / n, my));
      const d = Math.hypot(nx - mx, ny - my) * n * width;
      if (d <= radiusM) found.push({ tile: { z: zoom, x, y }, d });
    }
  }
  return found.sort((a, b) => a.d - b.d).map((entry) => entry.tile);
}

/** A 32-bit hash of whole numbers (a murmur3 finaliser over each): the placement's only randomness. */
export function hash32(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** A hash as a number in [0, 1). */
function unit(h: number): number {
  return h / 4294967296;
}

/** A ring of [longitude, latitude] points. */
export type Ring = ReadonlyArray<readonly [number, number] | readonly number[]>;

/** What a tile's mask is drawn from, in longitude and latitude. */
export interface TreeMasks {
  /** Polygons, each an outer ring and its holes, where trees grow. */
  woods: Ring[][];
  /** Polygons cut out of the woods: water, buildings. */
  clear: Ring[][];
  /** Lines with a strip cleared along them, `radiusM` either side: roads, rivers, runs, lifts. */
  lines: Array<{ path: Ring; radiusM: number }>;
}

/** Points in tile pixels: x and y from 0 to `size` across the tile. */
function toPixels(ring: Ring, tile: TileId, size: number): Float64Array {
  const n = 2 ** tile.z;
  const out = new Float64Array(ring.length * 2);
  for (let i = 0; i < ring.length; i++) {
    const [mx, my] = lngLatToWorld(Number(ring[i]![0]), Number(ring[i]![1]));
    out[i * 2] = (mx * n - tile.x) * size;
    out[i * 2 + 1] = (my * n - tile.y) * size;
  }
  return out;
}

/** Fill (`value` 1) or cut (`value` 0) one polygon into the mask, even-odd, by pixel centre. */
function fillPolygon(mask: Uint8Array, size: number, rings: Float64Array[], value: 0 | 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]!);
      maxX = Math.max(maxX, ring[i]!);
      minY = Math.min(minY, ring[i + 1]!);
      maxY = Math.max(maxY, ring[i + 1]!);
    }
  }
  if (maxX < 0 || maxY < 0 || minX > size || minY > size) return;
  const row0 = Math.max(0, Math.floor(minY));
  const row1 = Math.min(size - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let row = row0; row <= row1; row++) {
    const yc = row + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      const count = ring.length / 2;
      for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = ring[i * 2]!, yi = ring[i * 2 + 1]!;
        const xj = ring[j * 2]!, yj = ring[j * 2 + 1]!;
        if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const c1 = Math.min(size, Math.ceil(xs[k + 1]! - 0.5));
      if (c1 > c0) mask.fill(value, row * size + c0, row * size + c1);
    }
  }
}

/** Clear every pixel whose centre is within `radius` pixels of the line. */
function clearLine(mask: Uint8Array, size: number, path: Float64Array, radius: number): void {
  const r2 = radius * radius;
  for (let i = 2; i < path.length; i += 2) {
    const ax = path[i - 2]!, ay = path[i - 1]!, bx = path[i]!, by = path[i + 1]!;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + radius));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + radius));
    if (x0 > x1 || y0 > y1) continue;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        const cx = ax + t * dx - px, cy = ay + t * dy - py;
        if (cx * cx + cy * cy <= r2) mask[y * size + x] = 0;
      }
    }
  }
}

/** How many grid cells a tile is cut into across. */
export function gridSize(tile: TileId): number {
  return Math.max(16, Math.min(160, Math.round(tileWidthM(tile) / CELL_M)));
}

/** The tile's mask, `size` pixels square, row by row from the north-west corner: 1 where a tree may stand. */
export function treeMask(tile: TileId, masks: TreeMasks, size = gridSize(tile) * MASK_PER_CELL): Uint8Array {
  const mask = new Uint8Array(size * size);
  for (const polygon of masks.woods) fillPolygon(mask, size, polygon.map((ring) => toPixels(ring, tile, size)), 1);
  for (const polygon of masks.clear) fillPolygon(mask, size, polygon.map((ring) => toPixels(ring, tile, size)), 0);
  const metresPerPixel = tileWidthM(tile) / size;
  for (const line of masks.lines) clearLine(mask, size, toPixels(line.path, tile, size), line.radiusM / metresPerPixel);
  return mask;
}

/** One tile's trees, as flat arrays ready for the GPU: tree `i` is at index `i` (and `2i`, `2i + 1`). */
export interface TileTrees {
  key: string;
  count: number;
  /** Longitude, latitude of each tree's foot. */
  lngLat: Float64Array;
  /** Height of each tree, metres. */
  height: Float32Array;
  /** Crown radius at the widest, metres. */
  crown: Float32Array;
  /** Turn about the vertical, degrees: so the faceted crowns do not all line up. */
  yaw: Float32Array;
  /** 0 to 255: which of the greens the tree is drawn in. */
  shade: Uint8Array;
}

/**
 * Put trees on a tile: at most one per grid cell, jittered inside it, where the mask allows.
 * Heights run 8 to 22 m, crowns about a quarter of the height across, so a stand reads as boreal
 * spruce and fir from the air. Everything is a hash of the tile and the cell.
 */
export function placeTrees(tile: TileId, mask: Uint8Array, maskSize: number, density = DENSITY): TileTrees {
  const cells = gridSize(tile);
  const n = 2 ** tile.z;
  const lngLat: number[] = [];
  const height: number[] = [];
  const crown: number[] = [];
  const yaw: number[] = [];
  const shade: number[] = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const h = hash32(tile.z, tile.x, tile.y, i, j);
      if (unit(h) >= density) continue;
      const u = (i + 0.1 + 0.8 * unit(hash32(h, 1))) / cells;
      const v = (j + 0.1 + 0.8 * unit(hash32(h, 2))) / cells;
      const px = Math.min(maskSize - 1, Math.floor(u * maskSize));
      const py = Math.min(maskSize - 1, Math.floor(v * maskSize));
      if (mask[py * maskSize + px] !== 1) continue;
      const [lng, lat] = worldToLngLat((tile.x + u) / n, (tile.y + v) / n);
      // The sum of two uniforms leans the heights to the middle of the range.
      const tall = 8 + 7 * (unit(hash32(h, 3)) + unit(hash32(h, 4)));
      lngLat.push(lng, lat);
      height.push(tall);
      crown.push(tall * (0.2 + 0.08 * unit(hash32(h, 5))));
      yaw.push(360 * unit(hash32(h, 6)));
      shade.push(hash32(h, 7) & 255);
    }
  }
  return {
    key: tileKey(tile),
    count: height.length,
    lngLat: Float64Array.from(lngLat),
    height: Float32Array.from(height),
    crown: Float32Array.from(crown),
    yaw: Float32Array.from(yaw),
    shade: Uint8Array.from(shade),
  };
}

/** The trees for a tile from what the map holds there. */
export function tileTrees(tile: TileId, masks: TreeMasks): TileTrees {
  const size = gridSize(tile) * MASK_PER_CELL;
  return placeTrees(tile, treeMask(tile, masks, size), size);
}

/** The bounding box of rings, as [west, south, east, north]. */
export function ringsBounds(rings: readonly Ring[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      const lng = Number(point[0]), lat = Number(point[1]);
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return [w, s, e, n];
}

/** A tile's bounds as [west, south, east, north], grown by `marginM` metres on every side. */
export function tileBounds(tile: TileId, marginM = 0): [number, number, number, number] {
  const n = 2 ** tile.z;
  const [w, north] = worldToLngLat(tile.x / n, tile.y / n);
  const [e, south] = worldToLngLat((tile.x + 1) / n, (tile.y + 1) / n);
  const dLat = marginM / 111320;
  const dLng = dLat / Math.max(0.05, Math.cos((((north + south) / 2) * Math.PI) / 180));
  return [w - dLng, south - dLat, e + dLng, north + dLat];
}

/** Whether two [west, south, east, north] boxes overlap. */
export function boxesOverlap(a: readonly number[], b: readonly number[]): boolean {
  return a[0]! <= b[2]! && b[0]! <= a[2]! && a[1]! <= b[3]! && b[1]! <= a[3]!;
}

/** The greens a tree is drawn in, darkest first: spruce, fir and pine as seen on a winter map. */
export const TREE_GREENS: ReadonlyArray<readonly [number, number, number]> = [
  [34, 66, 48],
  [42, 78, 54],
  [52, 88, 58],
  [62, 96, 64],
  [46, 74, 62],
];

/** A tree's colour from its shade, as RGBA. */
export function treeColor(shade: number): [number, number, number, number] {
  const [r, g, b] = TREE_GREENS[shade % TREE_GREENS.length]!;
  return [r, g, b, 255];
}
