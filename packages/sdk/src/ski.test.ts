import { describe, expect, it } from "vitest";
import { UnmapError } from "@unmap/core";
import { Unmap } from "./index";
import { Ski, SkiError, type SkiArea, type SkiFeatures, type SkiLifts3d } from "./ski";

const AREA: SkiArea = {
  id: "osm-relation-123",
  name: "Whistler Blackcomb",
  province: "BC",
  locality: "Whistler",
  location: [-122.95, 50.1],
  base: [-122.96, 50.11],
  bbox: [-123.0, 50.05, -122.85, 50.15],
  activities: ["downhill", "nordic"],
  status: "operating",
  websites: ["https://www.whistlerblackcomb.com"],
  wikidata_id: "Q1018400",
  elevation: { top_m: 2284, base_m: 653, vertical_m: 1631 },
  runs: { count: 200, downhill_km: 150.5, nordic_km: 12.3 },
  lifts: { count: 37 },
  aspect: { n: 0.3, ne: 0.1, e: 0.05, se: 0.05, s: 0.1, sw: 0.1, w: 0.1, nw: 0.2 },
  drive: { from: "Vancouver", minutes: 123 },
  source: "OpenStreetMap",
  licence: "ODbL-1.0",
};

const META = {
  source: "OpenStreetMap",
  unmap_updated_at: "2026-09-17T00:00:00Z",
  data_version: "2026-09-17.8e988518989b",
  status: "current",
  attribution: "© OpenStreetMap contributors",
};

const LIFTS: SkiLifts3d = {
  schema: "unmap.ski-lifts-3d.v1",
  area_id: "osm-relation-123",
  terrain_release: "mapterhorn-2026-09",
  lifts: [
    {
      id: "osm-way-1",
      name: "Peak Express",
      aerialway: "chair_lift",
      stations: [[-122.95, 50.06, 1800], [-122.95, 50.07, 2200]],
      pylons: [[-122.95, 50.065, 2010]],
      cable: [[-122.95, 50.06, 1810], [-122.95, 50.07, 2210]],
    },
  ],
};

function client(handler: (url: URL) => Response) {
  const seen: URL[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url);
    return handler(url);
  }) as typeof fetch;
  return { ski: new Ski({ key: "um_test_k", gateway: "https://api.test/", fetch: impl, retry: false }), seen };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Ski", () => {
  it("lists areas with no filters, sending only the key", async () => {
    const { ski, seen } = client(() => json({ data: [AREA], meta: META }));
    const result = await ski.areas();
    expect(seen[0]!.origin + seen[0]!.pathname).toBe("https://api.test/ski/areas");
    expect([...seen[0]!.searchParams.keys()]).toEqual(["key"]);
    expect(result.data[0]!.name).toBe("Whistler Blackcomb");
    expect(result.data[0]!.drive).toEqual({ from: "Vancouver", minutes: 123 });
    expect(result.meta.data_version).toBe("2026-09-17.8e988518989b");
  });

  it("serializes province, activity, bbox and q", async () => {
    const { ski, seen } = client(() => json({ data: [], meta: META }));
    await ski.areas({ province: "QC", activity: "nordic", bbox: [-75, 45, -70, 48], q: "Mont-Sainte-Anne" });
    const params = seen[0]!.searchParams;
    expect(params.get("province")).toBe("QC");
    expect(params.get("activity")).toBe("nordic");
    expect(params.get("bbox")).toBe("-75,45,-70,48");
    expect(params.get("q")).toBe("Mont-Sainte-Anne");
  });

  it("omits an empty q rather than sending one the gateway would refuse", async () => {
    const { ski, seen } = client(() => json({ data: [], meta: META }));
    await ski.areas({ q: "" });
    expect(seen[0]!.searchParams.has("q")).toBe(false);
  });

  it("fetches one area and encodes its id", async () => {
    const { ski, seen } = client(() => json({ data: AREA, meta: META }));
    const result = await ski.area("osm-relation-123");
    expect(seen[0]!.pathname).toBe("/ski/areas/osm-relation-123");
    expect(result.data.aspect.nw).toBe(0.2);
    await ski.area("a/b");
    expect(seen[1]!.pathname).toBe("/ski/areas/a%2Fb");
  });

  it("fetches an area's 3D lifts in the same envelope as the other ski routes", async () => {
    const { ski, seen } = client(() => json({ data: LIFTS, meta: META }));
    const { data, meta } = await ski.lifts3d("osm-relation-123");
    expect(seen[0]!.pathname).toBe("/ski/areas/osm-relation-123/lifts-3d");
    expect(data.terrain_release).toBe("mapterhorn-2026-09");
    expect(data.lifts[0]!.stations[1]).toEqual([-122.95, 50.07, 2200]);
    expect(meta.data_version).toBe("2026-09-17.8e988518989b");

    const unnamed = client(() => json({ data: { ...LIFTS, lifts: [{ ...LIFTS.lifts[0]!, name: null }] }, meta: META }));
    expect((await unnamed.ski.lifts3d("osm-relation-123")).data.lifts[0]!.name).toBeNull();
    const none = client(() => json({ data: { ...LIFTS, lifts: [] }, meta: META }));
    expect((await none.ski.lifts3d("osm-relation-123")).data.lifts).toEqual([]);
  });

  it("fetches an area's runs and lifts with stable ids in the same envelope", async () => {
    const FEATURES: SkiFeatures = {
      schema: "unmap.ski-features.v1",
      area_id: "osm-relation-4080380",
      data_version: "2026-09-17.36b1304bfad9",
      features: [
        {
          id: "way-1325579254", kind: "lift", name: "Platter (Ski Patrol Only)", piste_type: null, difficulty: null, aerialway: "platter",
          geometry: { type: "LineString", coordinates: [[-115.189425, 50.946923], [-115.191687, 50.945147]] },
          length_m: 253, osm: { type: "way", id: 1325579254 }, source: "OpenStreetMap", licence: "ODbL-1.0",
        },
        {
          id: "way-1335592415", kind: "run", name: "Boundary", piste_type: "downhill", difficulty: "advanced", aerialway: null,
          geometry: { type: "LineString", coordinates: [[-115.190549, 50.948619], [-115.190698, 50.948708]] },
          length_m: 694, osm: { type: "way", id: 1335592415 }, source: "OpenStreetMap", licence: "ODbL-1.0",
        },
      ],
    };
    const { ski, seen } = client(() => json({ data: FEATURES, meta: META }));
    const { data, meta } = await ski.features("osm-relation-4080380");
    expect(seen[0]!.pathname).toBe("/ski/areas/osm-relation-4080380/features");
    expect(data.features.map((f) => [f.id, f.kind])).toEqual([["way-1325579254", "lift"], ["way-1335592415", "run"]]);
    expect(meta.attribution).toBe(META.attribution);
    await ski.features("a/b");
    expect(seen[1]!.pathname).toBe("/ski/areas/a%2Fb/features");
  });

  it("maps a 403 addon_required to a SkiError that is an UnmapError and names the add-on", async () => {
    const { ski } = client(() =>
      json(
        {
          error: "Ski is not on this key",
          code: "addon_required",
          capability: "ski",
          addon: "addon-ski",
          message: "Add the Ski add-on to your plan.",
        },
        403,
      ),
    );
    const error = await ski.areas().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SkiError);
    expect(error).toBeInstanceOf(UnmapError);
    expect(error).toMatchObject({ status: 403, code: "addon_required", addon: "addon-ski" });
    expect(String(error)).toContain("Ski is not on this key");
  });

  it("maps a 404 not_found and a 503 with Retry-After", async () => {
    const missing = client(() => json({ error: "no such ski area", code: "not_found" }, 404));
    await expect(missing.ski.area("osm-node-9")).rejects.toMatchObject({ status: 404, code: "not_found" });

    const down = client(
      () =>
        new Response(JSON.stringify({ error: "ski area data is not published yet", code: "service_unavailable" }), {
          status: 503,
          headers: { "retry-after": "300" },
        }),
    );
    const error = (await down.ski.areas().catch((caught: unknown) => caught)) as SkiError;
    expect(error).toMatchObject({ status: 503, code: "service_unavailable", retryAfterSeconds: 300 });
    expect(error.retryable).toBe(true);
  });

  it("survives a body that is not JSON", async () => {
    const { ski } = client(() => new Response("bad gateway", { status: 502 }));
    await expect(ski.areas()).rejects.toMatchObject({ status: 502, code: undefined });
  });

  it("is on the one Unmap instance as unmap.ski", async () => {
    const seen: string[] = [];
    const unmap = new Unmap({
      key: "um_test_k",
      retry: false,
      fetch: (async (input: RequestInfo | URL) => {
        seen.push(String(input));
        return json({ data: [AREA], meta: META });
      }) as typeof fetch,
    });
    const { data } = await unmap.ski.areas({ province: "BC" });
    expect(data).toHaveLength(1);
    expect(seen[0]).toBe("https://api.unmap.dev/ski/areas?key=um_test_k&province=BC");
  });
});
