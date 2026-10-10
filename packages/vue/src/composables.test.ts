import { describe, it, expect, vi } from "vitest";
import { useGeocoder } from "./useGeocoder";
import { useDirections } from "./useDirections";

// A fetch mock whose response resolution we control, so we can observe the
// loading flag flip to true mid-flight and back to false when it settles.
function deferredFetch(payload: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const fetchImpl = vi.fn(async () => {
    await gate;
    return { ok: true, status: 200, json: async () => payload };
  }) as unknown as typeof fetch;
  return { fetchImpl, release };
}

const okFetch = (payload: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => payload })) as unknown as typeof fetch;

describe("useGeocoder", () => {
  it("toggles loading and populates results", async () => {
    const { fetchImpl, release } = deferredFetch({
      results: [{ id: "1", name: "Calgary", layer: "locality", lng: -114, lat: 51 }],
    });
    const g = useGeocoder({ key: "um_test_x", fetch: fetchImpl });

    expect(g.loading.value).toBe(false);
    expect(g.results.value).toEqual([]);

    const p = g.search("calgary", { limit: 3 });
    expect(g.loading.value).toBe(true); // in flight

    release();
    const out = await p;

    expect(g.loading.value).toBe(false);
    expect(g.error.value).toBeNull();
    expect(out[0]?.name).toBe("Calgary");
    expect(g.results.value[0]?.name).toBe("Calgary");
  });

  it("autocomplete and reverse route through the same reactive state", async () => {
    const g = useGeocoder({ key: "k", fetch: okFetch([{ id: "2", name: "A", layer: "poi", lng: 0, lat: 0 }]) });
    await g.autocomplete("a");
    expect(g.results.value[0]?.id).toBe("2");
    await g.reverse(-114, 51);
    expect(g.results.value[0]?.name).toBe("A");
  });

  it("passes include=treaties through search and reverse, and fetches nothing on creation", async () => {
    const fetchImpl = okFetch([]);
    const g = useGeocoder({ key: "k", fetch: fetchImpl });
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(0);
    await g.search("calgary", { include: ["treaties"] });
    await g.reverse(-114.07, 51.05, { include: ["treaties"] });
    expect(String(calls[0]?.[0])).toContain("include=treaties");
    expect(String(calls[1]?.[0])).toContain("include=treaties");
  });

  it("nearby forwards the category and anchor and shares the reactive state", async () => {
    const fetchImpl = okFetch([
      { id: "3", name: "Rexall", layer: "address", lng: -114.07, lat: 51.05, category: "health.pharmacy", distance: 120 },
    ]);
    const g = useGeocoder({ key: "k", fetch: fetchImpl });
    const out = await g.nearby("pharmacie", { near: [-114.07, 51.05], radius: 2000, limit: 5 });
    expect(out[0]?.distance).toBe(120);
    expect(g.results.value[0]?.category).toBe("health.pharmacy");
    expect(g.loading.value).toBe(false);
    const url = String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]);
    expect(url).toContain("/geocode/nearby?");
    expect(url).toContain("category=pharmacie");
    expect(url).toContain("near=-114.07%2C51.05");
    expect(url).toContain("radius=2000");
  });

  it("captures errors and clears loading", async () => {
    const g = useGeocoder({ key: "k", fetch: okFetch({}, false, 401) });
    await expect(g.search("x")).rejects.toThrow(/401/);
    expect(g.loading.value).toBe(false);
    expect(g.error.value).toBeInstanceOf(Error);
  });
});

describe("useDirections", () => {
  it("route toggles loading and stores the result", async () => {
    const payload = {
      distanceMeters: 1200,
      durationSeconds: 300,
      geometry: { type: "LineString", coordinates: [[-114, 51], [-114.01, 51.01]] },
    };
    const { fetchImpl, release } = deferredFetch(payload);
    const d = useDirections({ key: "k", fetch: fetchImpl });

    const p = d.route([-114, 51], [-114.01, 51.01], { mode: "bicycle" });
    expect(d.loading.value).toBe(true);

    release();
    const out = await p;
    expect(d.loading.value).toBe(false);
    expect(out.distanceMeters).toBe(1200);
    expect((d.result.value as typeof payload).durationSeconds).toBe(300);
  });

  it("isochrone stores a feature collection", async () => {
    const fc = { type: "FeatureCollection", features: [] };
    const d = useDirections({ key: "k", fetch: okFetch(fc) });
    const out = await d.isochrone([-114, 51], { minutes: [5, 10] });
    expect(out.type).toBe("FeatureCollection");
    expect(d.result.value).toEqual(fc);
  });

  it("captures errors", async () => {
    const d = useDirections({ key: "k", fetch: okFetch({}, false, 500) });
    await expect(d.route([-114, 51], [0, 0])).rejects.toThrow(/500/);
    expect(d.error.value).toBeInstanceOf(Error);
    expect(d.loading.value).toBe(false);
  });
});
