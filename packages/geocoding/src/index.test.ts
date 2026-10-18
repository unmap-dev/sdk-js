import { describe, it, expect, vi, expectTypeOf } from "vitest";
import {
  Geocoder,
  type GeocodeResult,
  type SearchOptions,
  GeocoderError,
  type LegalLandDetails,
  type IdentifyResponse,
  type QueryResponse,
  DEFAULT_IDENTIFY_LAYERS,
  parseQueryBbox,
  parseQueryLayer,
  parseQueryLimit,
  ENERGY_IDENTIFY_LAYER_IDS,
  IDENTIFY_LAYER_IDS,
  LAND_IDENTIFY_LAYER_IDS,
  MINING_IDENTIFY_LAYER_IDS,
  isEnergyIdentifyLayer,
  isLandIdentifyLayer,
  knownIdentifyLayers,
  type TreatyContext,
} from "./index";

const mockFetch = (payload: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => payload })) as unknown as typeof fetch;

describe("Geocoder", () => {
  it("search builds the request URL and parses results", async () => {
    const f = mockFetch({ results: [{ id: "1", name: "Calgary", layer: "locality", lng: -114, lat: 51 }] });
    const g = new Geocoder({ key: "um_test_x", gateway: "https://api.unmap.dev/", fetch: f });
    const out = await g.search("calgary", { limit: 3, lang: "fr" });
    expect(out[0]?.name).toBe("Calgary");
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("/geocode/search?");
    expect(url).not.toContain("/v1/");
    for (const part of ["key=um_test_x", "q=calgary", "limit=3", "lang=fr"]) expect(url).toContain(part);
  });

  it("reverse sends near=lng,lat", async () => {
    const f = mockFetch([]);
    await new Geocoder({ key: "k", fetch: f }).reverse(-68.517, 63.7467);
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("/geocode/reverse?key=k&near=-68.517%2C63.7467");
    expect(url).not.toContain("/v1/");
    expect(url).not.toMatch(/[?&](lon|lat)=/);
  });

  it("batch POSTs queries and returns aligned slots", async () => {
    const f = mockFetch([
      [{ id: "1", name: "Calgary", layer: "locality", lng: -114, lat: 51 }],
      [],
    ]);
    const g = new Geocoder({ key: "um_test_x", gateway: "https://api.unmap.dev/", fetch: f });
    const out = await g.batch(["Calgary", ""], { lang: "fr", limit: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]![0]?.name).toBe("Calgary");
    expect(out[1]).toEqual([]);
    const [url, init] = (f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(String(url)).toContain("/geocode/batch?");
    expect(String(url)).toContain("key=um_test_x");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
      }),
    );
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      queries: ["Calgary", ""],
      limit: 2,
      lang: "fr",
    });
  });

  it("chunks 250 queries into three POSTs", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { queries: string[] };
      return {
        ok: true,
        status: 200,
        json: async () => body.queries.map(() => []),
      };
    }) as unknown as typeof fetch;
    const queries = Array.from({ length: 250 }, (_, i) => `q${i}`);
    const out = await new Geocoder({ key: "k", fetch: f }).batch(queries);
    expect(out).toHaveLength(250);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(3);
    const sizes = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.map(
      ([, init]) => (JSON.parse(String(init.body)) as { queries: string[] }).queries.length,
    );
    expect(sizes).toEqual([100, 100, 50]);
  });

  it("throws GeocoderError on a non-ok response", async () => {
    const g = new Geocoder({ key: "k", fetch: mockFetch({}, false, 401) });
    await expect(g.search("x")).rejects.toThrow(/401/);
  });

  it("puts the gateway's reason and code on the error", async () => {
    const f = mockFetch({ error: "invalid or disabled API key", code: "unauthorized" }, false, 401);
    const g = new Geocoder({ key: "k", fetch: f });
    const err = await g.search("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeocoderError);
    expect((err as GeocoderError).status).toBe(401);
    expect((err as GeocoderError).code).toBe("unauthorized");
    expect((err as GeocoderError).message).toBe("invalid or disabled API key (geocode 401 on /geocode/search)");
  });

  it("keeps a WGS84 range error as 400 bad_request", async () => {
    const f = mockFetch(
      { error: "longitude is -180..180 and latitude -90..90", code: "bad_request" },
      false,
      400,
    );
    const err = await new Geocoder({ key: "k", fetch: f }).reverse(181, 40).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeocoderError);
    expect((err as GeocoderError).status).toBe(400);
    expect((err as GeocoderError).code).toBe("bad_request");
  });

  it("keeps a coordinate outside Canada as 422 outside_coverage", async () => {
    const f = mockFetch(
      { error: "outside Canadian coverage", code: "outside_coverage" },
      false,
      422,
    );
    const err = await new Geocoder({ key: "k", fetch: f }).reverse(-122.33, 47.61).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeocoderError);
    expect((err as GeocoderError).status).toBe(422);
    expect((err as GeocoderError).code).toBe("outside_coverage");
  });
});

describe("multilingual contract", () => {
  it("GeocodeResult carries an optional names map", () => {
    expectTypeOf<GeocodeResult["names"]>().toEqualTypeOf<Record<string, string> | undefined>();
  });
  it("SearchOptions.lang accepts any language code", () => {
    const o: SearchOptions = { lang: "iu" };
    expectTypeOf(o.lang).toEqualTypeOf<string | undefined>();
  });
});

/**
 * Every other test injects `opts.fetch`, which is exactly how the default path shipped broken:
 * a bare `fetch` stored on the instance is invoked with the Geocoder as its receiver, and
 * browsers answer that with "Illegal invocation". Node is lenient, so only a receiver-checking
 * stub reproduces it here.
 */
describe("default fetch", () => {
  it("invokes the global fetch with the global as its receiver", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response);
    } as unknown as typeof fetch;
    try {
      await expect(new Geocoder({ key: "k" }).search("calgary")).resolves.toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("nearby", () => {
  it("builds /geocode/nearby with category, near, radius, limit, lang", async () => {
    const f = mockFetch([]);
    const g = new Geocoder({ key: "um_test_x", gateway: "https://api.unmap.dev", fetch: f });
    await g.nearby("pharmacie", { near: [-114.0719, 51.0447], radius: 2000, limit: 5, lang: "fr" });
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("/geocode/nearby?");
    for (const part of [
      "key=um_test_x",
      "category=pharmacie",
      "near=-114.0719%2C51.0447",
      "radius=2000",
      "limit=5",
      "lang=fr",
    ]) {
      expect(url).toContain(part);
    }
  });

  it("joins an array of categories with commas", async () => {
    const f = mockFetch([]);
    await new Geocoder({ key: "k", fetch: f }).nearby(["food.cafe", "food.bakery"], { near: [-114, 51] });
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("category=food.cafe%2Cfood.bakery");
  });

  it("accepts bbox instead of near", async () => {
    const f = mockFetch([]);
    await new Geocoder({ key: "k", fetch: f }).nearby("bank", { bbox: [-114.12, 51.02, -114.02, 51.07] });
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("bbox=-114.12%2C51.02%2C-114.02%2C51.07");
    expect(url).not.toContain("near=");
  });

  it("GeocodeResult carries optional category and distance", () => {
    expectTypeOf<GeocodeResult["category"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<GeocodeResult["distance"]>().toEqualTypeOf<number | undefined>();
  });
});

describe("legal_land", () => {
  it("widens GeocodeLayer and carries optional legal_land + bbox", () => {
    expectTypeOf<GeocodeResult["layer"]>().toEqualTypeOf<
      "address" | "street" | "locality" | "region" | "poi" | "legal_land" | "well" | "facility" | "parcel"
    >();
    expectTypeOf<GeocodeResult["legal_land"]>().toEqualTypeOf<LegalLandDetails | undefined>();
    expectTypeOf<GeocodeResult["bbox"]>().toEqualTypeOf<[number, number, number, number] | undefined>();
    expectTypeOf<GeocodeResult["uwi"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<GeocodeResult["licence"]>().toEqualTypeOf<string | undefined>();
  });

  it("parseLegalLand accepts NW-25-24-1-W5 and rejects civic queries", async () => {
    const { parseLegalLand, looksLikeLegalLand, toLegalLandDetails } = await import("./index");
    const parsed = parseLegalLand("NW-25-24-1-W5");
    expect(looksLikeLegalLand("NW-25-24-1-W5")).toBe(true);
    expect(looksLikeLegalLand("Calgary")).toBe(false);
    expect(parsed?.canonical).toBe("NW-25-24-1-W5");
    expect(toLegalLandDetails(parsed!).system).toBe("dls");
  });

  it("search forwards geometry=true", async () => {
    const f = mockFetch([]);
    await new Geocoder({ key: "k", fetch: f }).search("NW-25-24-1-W5", { geometry: true });
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("geometry=true");
  });
});

describe("identify", () => {
  it("defaults to municipalities only", async () => {
    const { parseIdentifyLayers, parseIdentifyAt } = await import("./index");
    expect(DEFAULT_IDENTIFY_LAYERS).toEqual(["municipalities"]);
    expect(IDENTIFY_LAYER_IDS).toEqual([
      "municipalities",
      "survey.dls",
      "survey.nts",
      "survey.parcels",
      "energy.wells",
      "energy.pipelines",
      "energy.facilities",
      "energy.fields",
      "energy.petroleum-tenure",
      "energy.mineral-tenure",
      "mining.occurrences",
      "mining.prospectivity",
      "mining.sk-potential",
    ]);
    expect(LAND_IDENTIFY_LAYER_IDS).toEqual([
      "municipalities",
      "survey.dls",
      "survey.nts",
      "survey.parcels",
    ]);
    expect(ENERGY_IDENTIFY_LAYER_IDS).toEqual(["energy.wells", "energy.pipelines", "energy.facilities"]);
    expect(MINING_IDENTIFY_LAYER_IDS).toEqual([
      "mining.occurrences",
      "mining.prospectivity",
      "mining.sk-potential",
    ]);
    expect(IDENTIFY_LAYER_IDS).toEqual(expect.arrayContaining([...ENERGY_IDENTIFY_LAYER_IDS]));
    expect(isLandIdentifyLayer("municipalities")).toBe(true);
    expect(isLandIdentifyLayer("survey.dls")).toBe(true);
    expect(isLandIdentifyLayer("survey.parcels")).toBe(true);
    expect(isLandIdentifyLayer("mining.occurrences")).toBe(true);
    expect(isEnergyIdentifyLayer("energy.wells")).toBe(true);
    expect(isEnergyIdentifyLayer("energy.fields")).toBe(true);
    expect(isEnergyIdentifyLayer("municipalities")).toBe(false);
    expect(parseIdentifyLayers(undefined)).toEqual({ layers: ["municipalities"] });
    expect(parseIdentifyLayers("energy.ccs")).toEqual({
      error: `unknown identify layer "energy.ccs". known: ${knownIdentifyLayers()}`,
    });
    expect(parseIdentifyLayers("parks")).toEqual({
      error: `unknown identify layer "parks". known: ${knownIdentifyLayers()}`,
    });
    expect(parseIdentifyAt("-114.07,51.05")).toEqual({ at: [-114.07, 51.05] });
    expect(parseIdentifyAt(undefined)).toEqual({ error: "at=lng,lat is required" });
    expect(parseIdentifyAt("-114.07")).toEqual({ error: "at must be lng,lat" });
  });

  it("builds /identify with at, layers, and geometry", async () => {
    const payload: IdentifyResponse = { at: [-114.07, 51.05], results: [] };
    const f = mockFetch(payload);
    const g = new Geocoder({ key: "um_test_x", gateway: "https://api.unmap.dev", fetch: f });
    const out = await g.identify({
      at: [-114.07, 51.05],
      layers: ["municipalities", "survey.dls"],
      geometry: true,
    });
    expect(out).toEqual(payload);
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("/identify?");
    expect(url).not.toContain("/geocode/identify");
    for (const part of [
      "key=um_test_x",
      "at=-114.07%2C51.05",
      "layers=municipalities%2Csurvey.dls",
      "geometry=true",
    ]) {
      expect(url).toContain(part);
    }
  });

  it("omits layers and geometry when not asked", async () => {
    const f = mockFetch({ at: [-114, 51], results: [] });
    await new Geocoder({ key: "k", fetch: f }).identify({ at: [-114, 51] });
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).not.toContain("layers=");
    expect(url).not.toContain("geometry=");
  });
});

describe("query", () => {
  it("parses layer, bbox, and limit", () => {
    expect(parseQueryLayer("energy.wells")).toEqual({ layer: "energy.wells" });
    expect(parseQueryLayer("")).toEqual({ error: "layer required" });
    expect(parseQueryLayer("parks")).toMatchObject({ unknown: "parks" });
    expect(parseQueryBbox("-114.3,50.9,-113.8,51.2")).toEqual({ bbox: [-114.3, 50.9, -113.8, 51.2] });
    expect(parseQueryBbox("1,2,1,4")).toEqual({ error: "bbox must be minlng,minlat,maxlng,maxlat" });
    expect(parseQueryLimit(undefined)).toBe(50);
    expect(parseQueryLimit("0")).toBe(1);
  });

  it("builds /data/query with layer, bbox, limit, and geometry", async () => {
    const payload: QueryResponse = { layer: "energy.wells", bbox: [-114.3, 50.9, -113.8, 51.2], results: [] };
    const f = mockFetch(payload);
    const g = new Geocoder({ key: "um_test_x", gateway: "https://api.unmap.dev", fetch: f });
    const out = await g.queryLayer({
      layer: "energy.wells",
      bbox: [-114.3, 50.9, -113.8, 51.2],
      limit: 10,
      geometry: true,
    });
    expect(out).toEqual(payload);
    const url = (f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;
    expect(url).toContain("/data/query?");
    for (const part of [
      "key=um_test_x",
      "layer=energy.wells",
      "bbox=-114.3%2C50.9%2C-113.8%2C51.2",
      "limit=10",
      "geometry=true",
    ]) {
      expect(url).toContain(part);
    }
  });
});

describe("Geocoder treaty context", () => {
  const urlOf = (f: typeof fetch) =>
    new URL((f as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string);

  it("sends no include by default", async () => {
    const f = mockFetch([]);
    const g = new Geocoder({ key: "k", fetch: f });
    await g.search("calgary");
    expect(urlOf(f).searchParams.has("include")).toBe(false);
    const r = mockFetch([]);
    await new Geocoder({ key: "k", fetch: r }).reverse(-114, 51);
    expect(urlOf(r).searchParams.has("include")).toBe(false);
  });

  it("serializes include once and passes a pinned version", async () => {
    const f = mockFetch([]);
    await new Geocoder({ key: "k", fetch: f }).search("calgary", {
      include: ["treaties", "treaties"],
      treatiesVersion: "2026-09-22.0123456789ab",
    });
    const url = urlOf(f);
    expect(url.searchParams.getAll("include")).toEqual(["treaties"]);
    expect(url.searchParams.get("treaties_version")).toBe("2026-09-22.0123456789ab");
  });

  it("reverse keeps lng,lat order and adds include", async () => {
    const f = mockFetch([]);
    await new Geocoder({ key: "k", fetch: f }).reverse(-114.07, 51.05, { include: ["treaties"], lang: "fr" });
    const url = urlOf(f);
    expect(url.searchParams.get("near")).toBe("-114.07,51.05");
    expect(url.searchParams.has("lon")).toBe(false);
    expect(url.searchParams.get("include")).toBe("treaties");
    expect(url.searchParams.get("lang")).toBe("fr");
  });

  it("surfaces an unloaded pinned version as a coded error without the key in the message", async () => {
    const f = mockFetch({ error: "treaties_version 2020-01-01.000000000000 is not loaded", code: "treaties_version_not_found" }, false, 404);
    const err = await new Geocoder({ key: "um_live_secret", fetch: f })
      .reverse(-114, 51, { include: ["treaties"], treatiesVersion: "2020-01-01.000000000000" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeocoderError);
    expect((err as GeocoderError).code).toBe("treaties_version_not_found");
    expect((err as GeocoderError).message).not.toContain("um_live_secret");
  });

  it("types the treaties field on results", () => {
    expectTypeOf<GeocodeResult["treaties"]>().toEqualTypeOf<TreatyContext | undefined>();
  });

  it("does not offer include where the API refuses it", () => {
    // autocomplete and batch take SearchOptions, which has no include.
    expectTypeOf<SearchOptions>().not.toHaveProperty("include");
  });
});
