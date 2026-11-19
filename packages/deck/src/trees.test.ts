import { describe, expect, it } from "vitest";
import {
  CELL_M,
  DENSITY,
  TREE_TILE_ZOOM,
  gridSize,
  hash32,
  lngLatToWorld,
  placeTrees,
  tileAt,
  tileBounds,
  tileTrees,
  tileWidthM,
  tilesAround,
  treeMask,
  worldToLngLat,
  type TileId,
  type TreeMasks,
} from "./trees";
import { coniferMesh, treeBudget } from "./show-trees";

// A z14 tile on Sunshine Village's slopes.
const TILE: TileId = tileAt(-115.78, 51.08);
const [W, S, E, N] = tileBounds(TILE);
const square = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
/** A fraction of the way across the tile, west to east and south to north. */
const lng = (f: number) => W + (E - W) * f;
const lat = (f: number) => S + (N - S) * f;
const share = (mask: Uint8Array) => mask.reduce((sum, value) => sum + value, 0) / mask.length;

describe("tile maths", () => {
  it("goes from longitude and latitude to Web Mercator and back", () => {
    const [mx, my] = lngLatToWorld(-115.78, 51.08);
    const [back, lat] = worldToLngLat(mx, my);
    expect(back).toBeCloseTo(-115.78, 9);
    expect(lat).toBeCloseTo(51.08, 9);
    expect(TILE.z).toBe(TREE_TILE_ZOOM);
  });

  it("measures a z14 tile at about 1.5 km across at 51 degrees north", () => {
    expect(tileWidthM(TILE)).toBeGreaterThan(1400);
    expect(tileWidthM(TILE)).toBeLessThan(1700);
    expect(gridSize(TILE)).toBe(Math.round(tileWidthM(TILE) / CELL_M));
  });

  it("lists the tiles near a point, nearest first, the point's own tile first", () => {
    const tiles = tilesAround(-115.78, 51.08, 4000);
    expect(tiles[0]).toEqual(TILE);
    expect(tiles.length).toBeGreaterThan(9);
    expect(tiles.length).toBeLessThan(49);
    expect(new Set(tiles.map((t) => `${t.x}/${t.y}`)).size).toBe(tiles.length);
    expect(tilesAround(-115.78, 51.08, 0)).toEqual([TILE]);
  });

  it("hashes the same numbers to the same value, and nearby ones apart", () => {
    expect(hash32(14, 2, 3, 4)).toBe(hash32(14, 2, 3, 4));
    expect(hash32(14, 2, 3, 4)).not.toBe(hash32(14, 2, 3, 5));
    expect(hash32(1)).toBeGreaterThanOrEqual(0);
  });
});

describe("the mask", () => {
  it("covers the woods, and nothing outside them", () => {
    const west: TreeMasks = { woods: [[square(lng(-0.1), lat(-0.1), lng(0.5), lat(1.1))]], clear: [], lines: [] };
    const mask = treeMask(TILE, west, 100);
    expect(share(mask)).toBeCloseTo(0.5, 1);
    expect(mask[50 * 100 + 10]).toBe(1);
    expect(mask[50 * 100 + 90]).toBe(0);
  });

  it("leaves a wood's hole empty, and cuts water out of it", () => {
    const holed: TreeMasks = {
      woods: [[square(lng(-0.1), lat(-0.1), lng(1.1), lat(1.1)), square(lng(0.25), lat(0.25), lng(0.75), lat(0.75))]],
      clear: [],
      lines: [],
    };
    expect(share(treeMask(TILE, holed, 100))).toBeCloseTo(0.75, 1);
    const lake: TreeMasks = { ...holed, woods: [holed.woods[0]!.slice(0, 1)], clear: [[square(lng(0), lat(0), lng(0.5), lat(1.1))]] };
    expect(share(treeMask(TILE, lake, 100))).toBeCloseTo(0.5, 1);
  });

  it("clears a strip along a ski run as wide as asked", () => {
    const run: TreeMasks = {
      woods: [[square(lng(-0.1), lat(-0.1), lng(1.1), lat(1.1))]],
      clear: [],
      lines: [{ path: [[lng(0.5), lat(-0.1)], [lng(0.5), lat(1.1)]], radiusM: 50 }],
    };
    const mask = treeMask(TILE, run, 200);
    const cleared = 1 - share(mask);
    // 100 m of a tile about 1.5 km wide.
    expect(cleared).toBeCloseTo(100 / tileWidthM(TILE), 1);
    expect(mask[100 * 200 + 100]).toBe(0);
    expect(mask[100 * 200 + 10]).toBe(1);
  });
});

describe("placing trees", () => {
  const woods: TreeMasks = { woods: [[square(lng(-0.1), lat(-0.1), lng(1.1), lat(1.1))]], clear: [], lines: [] };

  it("fills a wooded tile at the grid's density, inside the tile", () => {
    const trees = tileTrees(TILE, woods);
    const cells = gridSize(TILE) ** 2;
    expect(trees.count / cells).toBeCloseTo(DENSITY, 1);
    for (let i = 0; i < trees.count; i++) {
      const [x, y] = [trees.lngLat[i * 2]!, trees.lngLat[i * 2 + 1]!];
      expect(x >= W && x <= E && y >= S && y <= N).toBe(true);
    }
    expect(Math.min(...trees.height)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...trees.height)).toBeLessThanOrEqual(22);
    expect(trees.crown.every((crown, i) => crown < trees.height[i]! / 2)).toBe(true);
  });

  it("puts the same trees in the same places every time", () => {
    const a = tileTrees(TILE, woods);
    const b = tileTrees(TILE, woods);
    expect(b.count).toBe(a.count);
    expect(Array.from(b.lngLat)).toEqual(Array.from(a.lngLat));
    expect(Array.from(b.height)).toEqual(Array.from(a.height));
  });

  it("places nothing without woods, and only on the woods' half of a half-wooded tile", () => {
    expect(tileTrees(TILE, { woods: [], clear: [], lines: [] }).count).toBe(0);
    const half = tileTrees(TILE, { woods: [[square(lng(-0.1), lat(-0.1), lng(0.5), lat(1.1))]], clear: [], lines: [] });
    expect(half.count / tileTrees(TILE, woods).count).toBeCloseTo(0.5, 1);
    for (let i = 0; i < half.count; i++) expect(half.lngLat[i * 2]!).toBeLessThan(lng(0.5));
  });

  it("reads the mask it is given, pixel for pixel", () => {
    const size = 64;
    const none = placeTrees(TILE, new Uint8Array(size * size), size);
    expect(none.count).toBe(0);
    const all = placeTrees(TILE, new Uint8Array(size * size).fill(1), size, 1);
    expect(all.count).toBe(gridSize(TILE) ** 2);
  });
});

describe("the conifer and the budget", () => {
  it("is three cones of flat-shaded triangles, a metre tall, normals pointing out and up", () => {
    const { positions, normals } = coniferMesh(7);
    expect(positions.length).toBe(3 * 7 * 9);
    expect(normals.length).toBe(positions.length);
    const zs = positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBe(1);
    for (let i = 0; i < normals.length; i += 3) {
      expect(Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!)).toBeCloseTo(1, 6);
      expect(normals[i + 2]!).toBeGreaterThan(0);
    }
  });

  it("draws fewer trees on a phone", () => {
    expect(treeBudget(true)).toBeLessThan(treeBudget(false));
  });
});
