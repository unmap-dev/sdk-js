import { describe, expect, it, vi } from "vitest";
import {
  bearingDegrees,
  curveDrop,
  destination,
  distanceMetres,
  fanAzimuths,
  fanRays,
  groundHeights,
  NEAREST,
  readRay,
  readTarget,
  sampleDistances,
  sampleTile,
  sightRay,
  targetRay,
  terrarium,
  tilePixel,
  viewShare,
  widestBlock,
  zoomFor,
  type RayResult,
  type TerrainTile,
} from "./view";

const CALGARY: [number, number] = [-114.0665, 51.0475];

/** RGBA pixels for a tile of one height, Terrarium-encoded. */
function flat(height: number, size = 4): TerrainTile {
  const value = height + 32768;
  const r = Math.floor(value / 256);
  const g = Math.floor(value - r * 256);
  const b = Math.round((value - r * 256 - g) * 256);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < size * size; index++) data.set([r, g, b, 255], index * 4);
  return { size, data };
}

/** A ray along azimuth 270 from Calgary. */
function ray(distances: number[]) {
  return sightRay(CALGARY, 270, distances);
}

describe("sight lines", () => {
  it("walks out along a bearing and back: 10 km west is 10 km away, due west", () => {
    const west = destination(CALGARY, 270, 10_000);
    expect(distanceMetres(CALGARY, west)).toBeCloseTo(10_000, -1);
    expect(bearingDegrees(CALGARY, west)).toBeCloseTo(270, 0);
  });

  it("hides about 680 m behind the curve at 100 km, refraction included", () => {
    expect(curveDrop(100_000)).toBeGreaterThan(670);
    expect(curveDrop(100_000)).toBeLessThan(690);
    expect(curveDrop(0)).toBe(0);
  });

  it("spaces samples closer near the home, from the next lot over to the far end", () => {
    const distances = sampleDistances(72, 130_000);
    expect(distances[0]).toBe(NEAREST);
    expect(distances[71]).toBe(130_000);
    expect(distances[1]! - distances[0]!).toBeLessThan(distances[71]! - distances[70]!);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it("covers a fan end to end, and all the way round", () => {
    expect(fanAzimuths({ from: 200, to: 305, step: 3 })).toEqual(Array.from({ length: 36 }, (_value, index) => 200 + index * 3));
    expect(fanAzimuths({ from: 0, to: 357, step: 3 })).toHaveLength(120);
  });

  it("gives every line of a fan the same reach and spacing", () => {
    const rays = fanRays(CALGARY, { from: 0, to: 90, step: 45 }, 50_000, 10);
    expect(rays.map((line) => line.azimuth)).toEqual([0, 45, 90]);
    for (const line of rays) {
      expect(line.distances).toEqual(sampleDistances(10, 50_000));
      expect(distanceMetres(CALGARY, line.points[9]!)).toBeCloseTo(50_000, -1);
    }
  });

  it("ends a target line exactly on the target", () => {
    const tower: [number, number] = [-114.0628, 51.0477];
    const line = targetRay([-114.2005, 51.0575], tower, 200);
    expect(line.points[line.points.length - 1]).toEqual(tower);
    expect(line.distances[line.distances.length - 1]).toBeCloseTo(distanceMetres([-114.2005, 51.0575], tower), 6);
  });

  it("calls a line clear when the skyline is mountain, and blocked when a nearer hill outranks it", () => {
    const line = ray([500, 5_000, 80_000]);
    const clear = readRay(line, [1_100, 1_120, 3_000], 1_100, 1_104.5);
    expect(clear.clear).toBe(true);
    expect(clear.horizon?.distance).toBe(80_000);
    // A 60 m rise 500 m out stands about 6.3 degrees up; the 3,000 m peak 80 km off, about 0.9.
    const blocked = readRay(line, [1_160, 1_120, 3_000], 1_100, 1_104.5);
    expect(blocked.clear).toBe(false);
    expect(blocked.horizon?.distance).toBe(500);
    expect(blocked.mountainAngle).toBeCloseTo(clear.horizon!.angle, 6);
  });

  it("reads nothing from a line with no heights", () => {
    expect(readRay(ray([500, 5_000]), [null, null], 1_100, 1_104.5)).toMatchObject({ clear: false, horizon: null, mountainAngle: null });
  });

  it("sees a target nothing nearer outranks, and names what blocks one", () => {
    const line = ray([1_000, 4_000, 9_000]);
    expect(readTarget(line, [1_050, 1_060, 1_045], 1_104.5, 200)).toMatchObject({ visible: true });
    const hidden = readTarget(line, [1_050, 1_400, 1_045], 1_104.5, 200)!;
    expect(hidden.visible).toBe(false);
    expect(hidden.blocker?.distance).toBe(4_000);
    expect(readTarget(line, [1_050, 1_060, null], 1_104.5)).toBeNull();
  });

  it("scores the fan and finds its widest blocked run", () => {
    const result = (azimuth: number, clear: boolean, distance = 1_000): RayResult => ({
      azimuth,
      clear,
      horizon: { lngLat: [0, 0], distance, height: 0, angle: 0 },
      mountainAngle: null,
    });
    const rays = [result(200, true), result(203, false, 900), result(206, false, 1_500), result(209, false, 2_000), result(212, true), result(215, false)];
    expect(viewShare(rays)).toBeCloseTo(2 / 6, 6);
    expect(widestBlock(rays)).toEqual({ azimuth: 206, distance: 1_500 });
    expect(widestBlock([result(200, true)])).toBeNull();
  });
});

describe("terrain tiles", () => {
  it("reads fine tiles near the home and coarse ones in the mountains", () => {
    expect(zoomFor(100)).toBe(12);
    expect(zoomFor(8_000)).toBe(11);
    expect(zoomFor(20_000)).toBe(10);
    expect(zoomFor(90_000)).toBe(9);
  });

  it("decodes Terrarium and interpolates between pixel centres", () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    expect(terrarium(132, 76, 128)).toBe(1100.5);
    const pixel = (height: number) => Array.from(flat(height, 1).data);
    const tile: TerrainTile = { size: 2, data: [...pixel(1000), ...pixel(2000), ...pixel(1000), ...pixel(2000)] };
    expect(sampleTile(tile, 1, 1)).toBeCloseTo(1500, 3);
    expect(sampleTile(tile, 0, 0)).toBeCloseTo(1000, 3);
  });

  it("finds the tile and pixel a coordinate falls in", () => {
    const at = tilePixel(0, 0, 1, 512);
    expect(at).toEqual({ x: 1, y: 1, px: 0, py: 0 });
  });

  it("loads each tile once however many samples fall in it", async () => {
    const load = vi.fn(async () => flat(1200));
    const rays = [sightRay(CALGARY, 270, [50, 60, 70]), sightRay(CALGARY, 271, [50, 60, 70])];
    const { ground, perRay } = await groundHeights(CALGARY, rays, load);
    expect(ground).toBeCloseTo(1200, 3);
    expect(perRay.flat().every((height) => Math.abs(height! - 1200) < 1e-3)).toBe(true);
    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("leaves a sample empty where the terrain has no tile", async () => {
    const { ground, perRay } = await groundHeights(CALGARY, [sightRay(CALGARY, 270, [50])], async () => null);
    expect(ground).toBeNull();
    expect(perRay).toEqual([[null]]);
  });
});
