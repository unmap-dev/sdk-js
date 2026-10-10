import { describe, expect, it } from "vitest";
import { inCanadianServiceArea, inWgs84 } from "./canada-service-area";

const INSIDE: ReadonlyArray<readonly [string, number, number]> = [
  ["Calgary", -114.0719, 51.0447],
  ["Montréal", -73.5673, 45.5017],
  ["Ottawa", -75.6972, 45.4215],
  ["Iqaluit", -68.517, 63.7467],
  ["Vancouver", -123.1207, 49.2827],
  ["Victoria", -123.3656, 48.4284],
  ["Windsor", -83.0364, 42.3149],
  ["Tsawwassen", -123.083, 49.016],
  ["St. John's", -52.7126, 47.5615],
  ["Whitehorse", -135.0568, 60.7212],
  ["Halifax", -63.5752, 44.6488],
  ["Charlottetown", -63.1311, 46.2382],
  ["Inuvik", -133.7218, 68.3607],
  ["Sault Ste. Marie, ON", -84.333, 46.521],
  ["Sarnia", -82.407, 42.975],
  ["Haida Gwaii", -132.15, 53.25],
  ["Point Pelee", -82.515, 41.908],
  ["Resolute", -94.8297, 74.6973],
  ["Alert", -62.3481, 82.5018],
  ["Hudson Bay", -85, 60],
  ["Lake Ontario", -77.8, 43.6],
  ["Manitoulin", -82.17, 45.75],
  ["Campobello", -66.95, 44.88],
  ["Kugluktuk", -115.095, 67.8256],
  ["Umiujaq", -76.55, 56.55],
  ["Mary's Harbour", -55.83, 52.31],
  ["Qikiqtarjuaq", -64.025, 67.558],
  ["Postville", -59.77, 54.91],
  ["Rigolet", -58.43, 54.18],
  ["Cartwright", -57.02, 53.71],
  ["Twillingate", -54.7436, 49.6443],
  ["Change Islands", -54.4037, 49.6689],
  ["Crow Head", -54.7999, 49.6799],
  ["St. Brendan's", -53.666, 48.8581],
  ["Mayne Island", -123.2997, 48.8511],
  ["Big Tancook Island", -64.1691, 44.4653],
  ["Île aux Grues", -70.5433, 47.0681],
  ["St. Stephen", -67.276, 45.194],
  ["Morrisburg", -75.184, 44.898],
];

const OUTSIDE: ReadonlyArray<readonly [string, number, number]> = [
  ["Detroit", -83.0458, 42.3314],
  ["Seattle", -122.3321, 47.6062],
  ["Point Roberts", -123.078, 48.995],
  ["London", -0.1276, 51.5072],
  ["Tokyo", 139.6917, 35.6895],
  ["Buffalo", -78.8784, 42.8864],
  ["Chicago", -87.6298, 41.8781],
  ["Niagara Falls, NY", -79.0377, 43.0962],
  ["Sault Ste. Marie, MI", -84.345, 46.492],
  ["Port Huron", -82.424, 42.97],
  ["Juneau", -134.4197, 58.3019],
  ["Maine", -68.2, 46.8],
  ["Nuuk", -51.72, 64.18],
  ["Saint-Pierre", -56.18, 46.78],
  ["Miquelon", -56.3814, 47.0975],
  ["Isle Royale", -88.9, 48],
  ["Houghton", -88.569, 47.122],
  ["Alpena", -83.433, 45.062],
  ["Bayfield", -90.821, 46.812],
  ["rural England", -1.5, 52.5],
  ["Cairo", 31.24, 30.04],
  ["Delhi", 77.21, 28.61],
  ["Nairobi", 36.82, -1.29],
  ["São Paulo", -46.63, -23.55],
  ["Sydney", 151.21, -33.87],
  ["Auckland", 174.76, -36.85],
  ["Fiji", 178, -18],
  ["Blaine", -122.755, 48.99],
  ["Eastport", -66.989, 44.906],
  ["Lubec", -66.982, 44.858],
];

describe("Canadian service area", () => {
  it.each(INSIDE)("includes %s", (_name, lng, lat) => {
    expect(inCanadianServiceArea(lng, lat)).toBe(true);
  });

  it.each(OUTSIDE)("excludes %s", (_name, lng, lat) => {
    expect(inCanadianServiceArea(lng, lat)).toBe(false);
  });

  it("does not treat a non-finite coordinate as inside", () => {
    expect(inCanadianServiceArea(Number.NaN, 51)).toBe(false);
  });

  it("keeps a number past the poles out of the WGS84 range", () => {
    expect(inWgs84(-114.07, 51.05)).toBe(true);
    expect(inWgs84(-180, 90)).toBe(true);
    expect(inWgs84(180, -90)).toBe(true);
    expect(inWgs84(181, 40)).toBe(false);
    expect(inWgs84(-114, 95)).toBe(false);
    expect(inWgs84(Number.NaN, 51)).toBe(false);
  });
});
