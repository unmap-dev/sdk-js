import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    const { result } = renderHook(() => useGeocoder({ apiKey: "um_test_x", fetch: fetchImpl }));

    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);

    let p!: ReturnType<typeof result.current.search>;
    act(() => {
      p = result.current.search("calgary", { limit: 3 });
    });
    expect(result.current.loading).toBe(true); // in flight

    release();
    const out = await act(() => p);

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(out[0]?.name).toBe("Calgary");
    expect(result.current.results[0]?.name).toBe("Calgary");
  });

  it("autocomplete and reverse route through the same state", async () => {
    const { result } = renderHook(() =>
      useGeocoder({ apiKey: "k", fetch: okFetch([{ id: "2", name: "A", layer: "poi", lng: 0, lat: 0 }]) }),
    );
    await act(() => result.current.autocomplete("a"));
    expect(result.current.results[0]?.id).toBe("2");
    await act(() => result.current.reverse(-114, 51));
    expect(result.current.results[0]?.name).toBe("A");
  });

  it("passes include=treaties through search and reverse, and fetches nothing on render", async () => {
    const fetchImpl = okFetch([]);
    const { result, rerender } = renderHook(() => useGeocoder({ apiKey: "k", fetch: fetchImpl }));
    rerender();
    rerender();
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(0);
    await act(() => result.current.search("calgary", { include: ["treaties"] }));
    await act(() => result.current.reverse(-114.07, 51.05, { include: ["treaties"], treatiesVersion: "2026-09-22.0123456789ab" }));
    expect(String(calls[0]?.[0])).toContain("include=treaties");
    expect(String(calls[1]?.[0])).toContain("include=treaties");
    expect(String(calls[1]?.[0])).toContain("treaties_version=2026-09-22.0123456789ab");
  });

  it("nearby forwards the category and anchor and shares the state", async () => {
    const fetchImpl = okFetch([
      { id: "3", name: "Rexall", layer: "address", lng: -114.07, lat: 51.05, category: "health.pharmacy", distance: 120 },
    ]);
    const { result } = renderHook(() => useGeocoder({ apiKey: "k", fetch: fetchImpl }));
    const out = await act(() =>
      result.current.nearby("pharmacie", { near: [-114.07, 51.05], radius: 2000, limit: 5 }),
    );
    expect(out[0]?.distance).toBe(120);
    expect(result.current.results[0]?.category).toBe("health.pharmacy");
    expect(result.current.loading).toBe(false);
    const url = String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]);
    expect(url).toContain("/geocode/nearby?");
    expect(url).toContain("category=pharmacie");
    expect(url).toContain("near=-114.07%2C51.05");
    expect(url).toContain("radius=2000");
  });

  it("captures errors and clears loading", async () => {
    const { result } = renderHook(() => useGeocoder({ apiKey: "k", fetch: okFetch({}, false, 401) }));
    await act(async () => {
      await expect(result.current.search("x")).rejects.toThrow(/401/);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("keeps one Geocoder instance across re-renders", () => {
    const fetchImpl = okFetch([]);
    const { result, rerender } = renderHook(() => useGeocoder({ apiKey: "k", fetch: fetchImpl }));
    const first = result.current.search;
    rerender();
    expect(result.current.search).toBe(first);
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
    const { result } = renderHook(() => useDirections({ apiKey: "k", fetch: fetchImpl }));

    let p!: ReturnType<typeof result.current.route>;
    act(() => {
      p = result.current.route([-114, 51], [-114.01, 51.01], { mode: "bicycle" });
    });
    expect(result.current.loading).toBe(true);

    release();
    const out = await act(() => p);
    expect(result.current.loading).toBe(false);
    expect(out.distanceMeters).toBe(1200);
    expect((result.current.result as typeof payload).durationSeconds).toBe(300);
  });

  it("isochrone stores a feature collection", async () => {
    const fc = { type: "FeatureCollection", features: [] };
    const { result } = renderHook(() => useDirections({ apiKey: "k", fetch: okFetch(fc) }));
    const out = await act(() => result.current.isochrone([-114, 51], { minutes: [5, 10] }));
    expect(out.type).toBe("FeatureCollection");
    expect(result.current.result).toEqual(fc);
  });

  it("captures errors", async () => {
    const { result } = renderHook(() => useDirections({ apiKey: "k", fetch: okFetch({}, false, 500) }));
    await act(async () => {
      await expect(result.current.route([-114, 51], [0, 0])).rejects.toThrow(/500/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.loading).toBe(false);
  });
});
