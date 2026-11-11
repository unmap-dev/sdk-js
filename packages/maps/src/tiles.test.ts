import { describe, expect, it, vi } from "vitest";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";
import { UnmapError, tileToBBox } from "@unmap/core";
import { tileFeatures, tilesCovering } from "./tiles";

const BBOX: [number, number, number, number] = [-114.08, 51.04, -114.06, 51.05];

/** A z14 tile holding one `roads` LineString, built the way the gateway's tiles are encoded. */
function roadTile(x: number, y: number): Uint8Array {
  const [w, s, e, n] = tileToBBox({ z: 14, x, y });
  const line: GeoJSON.Feature = {
    type: "Feature",
    properties: { kind: "minor_road", name: "Test St" },
    geometry: {
      type: "LineString",
      coordinates: [
        [w + (e - w) * 0.2, s + (n - s) * 0.2],
        [w + (e - w) * 0.8, s + (n - s) * 0.8],
      ],
    },
  };
  const index = new GeoJSONVT({ type: "FeatureCollection", features: [line] }, { maxZoom: 14 });
  return fromGeojsonVt({ roads: index.getTile(14, x, y)! });
}

const bytes = (b: Uint8Array) => new Response(b as BodyInit, { status: 200 });

describe("tilesCovering", () => {
  // Pinned from the slippy formula: the box straddles x 3000/3001 and y 5481/5482.
  it("lists every z14 tile a box touches", () => {
    expect(tilesCovering(BBOX, 14)).toEqual([
      [3000, 5481],
      [3000, 5482],
      [3001, 5481],
      [3001, 5482],
    ]);
  });
});

describe("tileFeatures", () => {
  it("decodes a layer to GeoJSON inside the tile, and counts each request", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const m = String(url).match(/\/tiles\/14\/(\d+)\/(\d+)/)!;
      return bytes(roadTile(Number(m[1]), Number(m[2])));
    });
    const res = await tileFeatures({
      key: "um_pk_test_abc",
      bbox: BBOX,
      layers: ["roads", "water"],
      gateway: "https://gw.example",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("https://gw.example/tiles/14/3000/5481?key=um_pk_test_abc");
    expect(res.requests).toBe(4);
    expect(res.features.water).toEqual([]);
    expect(res.features.roads).toHaveLength(4);
    const [w, s, e, n] = tileToBBox({ z: 14, x: 3000, y: 5481 });
    const inTile = res.features.roads!.find((f) => {
      const c = (f.geometry as GeoJSON.LineString).coordinates[0]!;
      return c[0]! >= w && c[0]! <= e && c[1]! >= s && c[1]! <= n;
    });
    expect(inTile).toBeDefined();
    expect(inTile!.properties).toMatchObject({ kind: "minor_road", name: "Test St" });
  });

  it("treats 204 as an empty tile that still counts as a request", async () => {
    const res = await tileFeatures({
      key: "k",
      bbox: BBOX,
      layers: ["roads"],
      fetch: (async () => new Response(null, { status: 204 })) as typeof fetch,
    });
    expect(res.features.roads).toEqual([]);
    expect(res.requests).toBe(4);
  });

  it("rejects a non-2xx with an UnmapError carrying the status", async () => {
    const p = tileFeatures({
      key: "k",
      bbox: BBOX,
      layers: ["roads"],
      fetch: (async () => new Response("no", { status: 403 })) as typeof fetch,
    });
    await expect(p).rejects.toBeInstanceOf(UnmapError);
    await expect(p).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a box over maxTiles before fetching anything", async () => {
    const fetchMock = vi.fn();
    const p = tileFeatures({
      key: "k",
      bbox: [-114.2, 50.9, -113.9, 51.2],
      layers: ["roads"],
      maxTiles: 4,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(p).rejects.toThrow(RangeError);
    await expect(p).rejects.toThrow(/\d+ tiles.*4/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
