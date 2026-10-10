import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Geocoder, GeocodeResult, ReverseOptions, TreatyContext } from "./index";
import { createTreatyOverlay, treatyLayerIds, type TreatyLookupClient, type TreatyMapLike } from "./treaty-overlay";

const V = "2026-09-22.0123456789ab";

function context(lng: number, lat: number, ids: string[] = []): TreatyContext {
  return {
    schema_version: 1,
    dataset_version: V,
    status: "ok",
    point: { lng, lat, basis: "input_point" },
    coverage: { scope: "Canada", completeness: "partial" },
    matches: ids.map((id) => ({
      id,
      source_id: "synthetic.test",
      source_record_id: id.split(":")[1]!,
      category: "historic",
      name: id,
      name_lang: "en",
      names: { en: id },
      geography_kind: "treaty_area",
      representation: "unspecified",
      source_url: "https://example.test/",
    })),
    notice_code: "source_limitations_apply",
  };
}

type Listener = (e?: unknown) => void;

function fakeMap(features: Array<{ properties: Record<string, unknown> }> = [], present = true) {
  const listeners = new Map<string, Set<Listener>>();
  const layout = new Map<string, string>();
  const map = {
    layout,
    listeners,
    on: vi.fn((type: string, l: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(l);
    }),
    off: vi.fn((type: string, l: Listener) => listeners.get(type)?.delete(l)),
    getLayer: (id: string) => (present && id.startsWith("overlay_treaties_") ? { id } : undefined),
    setLayoutProperty: vi.fn((id: string, _n: string, v: string) => layout.set(id, v)),
    queryRenderedFeatures: vi.fn(() => features),
    fire(type: string, e?: unknown) {
      for (const l of listeners.get(type) ?? []) l(e);
    },
  };
  return map as typeof map & TreatyMapLike;
}

function fakeClient(answer: (lng: number, lat: number, opts?: ReverseOptions) => Promise<GeocodeResult[]>) {
  return { reverse: vi.fn(answer) };
}

const result = (ctx: TreatyContext): GeocodeResult[] => [
  { id: "1", name: "x", layer: "locality", lng: ctx.point.lng, lat: ctx.point.lat, treaties: ctx },
];

describe("createTreatyOverlay", () => {
  it("makes no request until someone asks", () => {
    const client = fakeClient(async () => []);
    createTreatyOverlay(fakeMap(), client);
    expect(client.reverse).not.toHaveBeenCalled();
  });

  it("shows and hides each category, and restores that after a style swap", () => {
    const map = fakeMap();
    const overlay = createTreatyOverlay(map, fakeClient(async () => []), { modern: false });
    expect(map.layout.get(treatyLayerIds("historic")[0])).toBe("visible");
    expect(map.layout.get(treatyLayerIds("modern")[1])).toBe("none");
    overlay.setVisibility({ historic: false, modern: true });
    map.layout.clear();
    map.fire("styledata");
    map.fire("styledata");
    expect(map.layout.get(treatyLayerIds("historic")[0])).toBe("none");
    expect(map.layout.get(treatyLayerIds("modern")[0])).toBe("visible");
    expect(map.listeners.get("styledata")?.size).toBe(1);
  });

  it("answers a click from the full lookup, pinned to the version drawn there", async () => {
    const map = fakeMap([
      { properties: { id: "s:A", dataset_version: V } },
      { properties: { id: "s:A", dataset_version: V } },
      { properties: { id: "s:B", dataset_version: V } },
    ]);
    const client = fakeClient(async (lng, lat) => result(context(lng, lat, ["s:A", "s:B", "s:C"])));
    const onSelect = vi.fn();
    createTreatyOverlay(map, client, { onSelect, lang: "fr" });
    map.fire("click", { lngLat: { lng: -114, lat: 51 }, point: {} });
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(client.reverse).toHaveBeenCalledWith(-114, 51, {
      include: ["treaties"],
      lang: "fr",
      limit: 1,
      treatiesVersion: V,
    });
    const selection = onSelect.mock.calls[0]![0];
    // Fragments of one record collapse; C comes from the lookup though no tile drew it.
    expect(selection.drawn).toEqual(["s:A", "s:B"]);
    expect(selection.context.matches.map((m: { id: string }) => m.id)).toEqual(["s:A", "s:B", "s:C"]);
  });

  it("lists matches in hidden categories and says which are hidden", async () => {
    const onSelect = vi.fn();
    const overlay = createTreatyOverlay(fakeMap(), fakeClient(async (lng, lat) => result(context(lng, lat, ["s:A"]))), {
      onSelect,
      historic: false,
    });
    await overlay.lookupAt([-114, 51]);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ hidden: ["historic"], context: { matches: [{ id: "s:A" }] } });
  });

  it("keeps only the latest answer when lookups race", async () => {
    const release: Record<string, () => void> = {};
    const client = fakeClient(
      (lng, lat) => new Promise((resolve) => (release[String(lng)] = () => resolve(result(context(lng, lat))))),
    );
    const onSelect = vi.fn();
    const overlay = createTreatyOverlay(fakeMap(), client, { onSelect });
    const a = overlay.lookupAt([1, 1]);
    const b = overlay.lookupAt([2, 2]);
    release["2"]!();
    await b;
    release["1"]!();
    await a;
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].context.point.lng).toBe(2);
  });

  it("goes quiet when destroyed, even for a lookup already in flight", async () => {
    let done!: () => void;
    const map = fakeMap();
    const client = fakeClient((lng, lat) => new Promise((r) => (done = () => r(result(context(lng, lat))))));
    const onSelect = vi.fn();
    const overlay = createTreatyOverlay(map, client, { onSelect });
    const pending = overlay.lookupAt([1, 1]);
    overlay.destroy();
    done();
    await pending;
    expect(onSelect).not.toHaveBeenCalled();
    expect(map.listeners.get("click")?.size ?? 0).toBe(0);
    expect(map.listeners.get("styledata")?.size ?? 0).toBe(0);
  });

  it("reports a retired drawn version instead of showing newer details", async () => {
    const err = Object.assign(new Error("treaties_version is not loaded"), { code: "treaties_version_not_found" });
    const onError = vi.fn();
    const onSelect = vi.fn();
    const overlay = createTreatyOverlay(fakeMap(), fakeClient(async () => Promise.reject(err)), { onError, onSelect });
    expect(await overlay.lookupAt([1, 1], V)).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(err);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not attach a click handler when not interactive, and tolerates a style without the overlay", () => {
    const map = fakeMap([], false);
    createTreatyOverlay(map, fakeClient(async () => []), { interactive: false });
    expect(map.listeners.get("click")?.size ?? 0).toBe(0);
    expect(map.setLayoutProperty).not.toHaveBeenCalled();
  });
});

describe("types", () => {
  it("accepts the geocoder (the MapLibre map is checked in @unmap/sdk)", () => {
    expectTypeOf<Geocoder>().toMatchTypeOf<TreatyLookupClient>();
  });
});
