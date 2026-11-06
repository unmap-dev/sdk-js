import { describe, expect, it } from "vitest";
import { bakedZ, bearing } from "./geometry";

describe("bakedZ", () => {
  it("returns the baked height unchanged at exaggeration 1 (the default)", () => {
    expect(bakedZ([-116, 51, 1700])).toBe(1700);
    expect(bakedZ([-116, 51, 1700], 1)).toBe(1700);
  });

  it("scales from sea level, as MapLibre scales the terrain it drapes", () => {
    expect(bakedZ([-116, 51, 1700], 1.5)).toBe(2550);
    expect(bakedZ([-116, 51, -20], 2)).toBe(-40);
  });

  it("treats a point with no z as sea level", () => {
    expect(bakedZ([-116, 51] as unknown as [number, number, number], 2)).toBe(0);
  });

  it("refuses an exaggeration MapLibre would not draw", () => {
    expect(() => bakedZ([-116, 51, 1700], 0)).toThrow(RangeError);
    expect(() => bakedZ([-116, 51, 1700], -1)).toThrow(RangeError);
    expect(() => bakedZ([-116, 51, 1700], Number.NaN)).toThrow(RangeError);
  });
});

describe("bearing", () => {
  it("is degrees clockwise from north", () => {
    expect(bearing([-116, 51], [-116, 51.01])).toBeCloseTo(0, 6);
    expect(bearing([-116.02, 51], [-116, 51])).toBeCloseTo(90, 1);
    expect(bearing([-116, 51.01], [-116, 51])).toBeCloseTo(180, 6);
    expect(bearing([-116, 51], [-116.02, 51])).toBeCloseTo(270, 1);
  });
});
