import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GeocodeResult } from "@unmap/geocoding";
import type { UnmapCarmenFeature } from "./geocoder";

/**
 * The plugin draws DOM and the package runs no DOM environment, so its constructor is mocked and
 * the tests assert on what it receives. The adapter is plain request/response mapping, tested
 * against a stubbed `fetch` so the real `@unmap/geocoding` client builds every URL.
 */
const constructed: { api: unknown; options: Record<string, unknown> }[] = [];
vi.mock("@maplibre/maplibre-gl-geocoder", () => ({
  default: class {
    constructor(api: unknown, options: Record<string, unknown>) {
      constructed.push({ api, options });
    }
  },
}));
vi.mock("maplibre-gl", () => ({ Marker: class {}, Popup: class {} }));

const { toCarmenFeature, unmapGeocoderApi, createGeocoder, renderResult, renderPopup } = await import("./geocoder");

const calgaryAddress: GeocodeResult = {
  id: "20335012",
  name: "1000 9 AV SW, Calgary",
  layer: "address",
  lng: -114.0849,
  lat: 51.0446,
  source: "statcan_nar",
  address: { housenumber: "1000", street: "9 AV SW", city: "Calgary", region: "AB", postcode: "T2P 2Y6", country: "CA" },
};
const calgary: GeocodeResult = {
  id: "28898025",
  name: "Calgary",
  layer: "locality",
  lng: -114.07,
  lat: 51.04,
  address: { city: "Calgary", region: "AB", country: "CA" },
};
const alberta: GeocodeResult = { id: "1", name: "Alberta", layer: "region", lng: -114, lat: 54, address: { region: "AB", country: "CA" } };

let calls: URL[];
const stubFetch = (body: unknown) =>
  vi.fn(async (input: RequestInfo | URL) => {
    calls.push(new URL(String(input)));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

beforeEach(() => {
  calls = [];
  constructed.length = 0;
});

describe("toCarmenFeature", () => {
  it("splits an address into Carmen's house number and street", () => {
    const f = toCarmenFeature(calgaryAddress);
    expect(f.place_type).toEqual(["address"]);
    expect(f.address).toBe("1000");
    expect(f.text).toBe("9 AV SW");
    expect(f.place_name).toBe("1000 9 AV SW, Calgary, AB");
    expect(f.center).toEqual([-114.0849, 51.0446]);
    expect(f.geometry).toEqual({ type: "Point", coordinates: [-114.0849, 51.0446] });
    expect(f.id).toBe("address.20335012");
  });

  it("says where a named place is with its street and city", () => {
    const pub: GeocodeResult = {
      id: "7",
      name: "Dickens Pub",
      layer: "address",
      lng: -114.085,
      lat: 51.0447,
      address: { housenumber: "1000", street: "9 Avenue SW", city: "Calgary", region: "AB" },
    };
    const f = toCarmenFeature(pub);
    expect(f.place_name).toBe("Dickens Pub, 1000 9 Avenue SW, Calgary, AB");
    expect(f.address).toBe("1000");
    expect(f.text).toBe("9 Avenue SW");
  });

  it("carries postcode, city, province and country as Carmen context", () => {
    expect(toCarmenFeature(calgaryAddress).context).toEqual([
      { id: "postcode.T2P 2Y6", text: "T2P 2Y6" },
      { id: "place.Calgary", text: "Calgary" },
      { id: "region.AB", text: "AB", short_code: "CA-AB" },
      { id: "country.ca", text: "Canada", short_code: "ca" },
    ]);
  });

  it("reads a locality as a Carmen place without naming itself as its own city", () => {
    const f = toCarmenFeature(calgary);
    expect(f.place_type).toEqual(["place"]);
    expect(f.text).toBe("Calgary");
    expect(f.place_name).toBe("Calgary, AB");
    expect(f.context.map((c) => c.id)).toEqual(["region.AB", "country.ca"]);
  });

  it("does not repeat a province after its own name", () => {
    const f = toCarmenFeature(alberta);
    expect(f.place_name).toBe("Alberta");
    expect(f.context).toEqual([{ id: "country.ca", text: "Canada", short_code: "ca" }]);
  });

  it("keeps a layer Carmen has no type for under its own name, with the full result", () => {
    const well: GeocodeResult = { id: "9", name: "100/01-01-001-01W4/0", layer: "well", lng: -110, lat: 49, uwi: "100010100101W400" };
    const f = toCarmenFeature(well);
    expect(f.place_type).toEqual(["well"]);
    expect(f.properties.unmap.uwi).toBe("100010100101W400");
  });
});

describe("unmapGeocoderApi", () => {
  it("answers forwardGeocode from autocomplete, mapping the plugin's config", async () => {
    const api = unmapGeocoderApi({ key: "um_test_x", fetch: stubFetch([calgaryAddress]) });
    const res = await api.forwardGeocode({ query: "1000 9 Ave SW", limit: 3, language: "fr", proximity: [-114.07, 51.05], types: "address,place" });
    expect(res.features[0]?.place_name).toBe("1000 9 AV SW, Calgary, AB");
    expect(res.features[0]?.language).toBe("fr");
    const url = calls[0]!;
    expect(url.pathname).toBe("/geocode/autocomplete");
    expect(url.searchParams.get("q")).toBe("1000 9 Ave SW");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("lang")).toBe("fr");
    expect(url.searchParams.get("layers")).toBe("address,locality");
    expect(url.searchParams.get("focus")).toMatch(/^-114\.07,51\.05/);
  });

  it("reads types and language as the arrays the plugin really sends", async () => {
    // MaplibreGeocoder splits `types`, `countries` and `language` before calling the API, though
    // its .d.ts declares strings; 0.22.0 called `.split` on the array and every typed box failed.
    const api = unmapGeocoderApi({ key: "um_test_x", fetch: stubFetch([calgaryAddress]) });
    const config = { query: "1000 9 Ave SW", types: ["address", "place", "neighborhood"], language: ["fr", "en"] };
    const res = await api.forwardGeocode(config as unknown as Parameters<typeof api.forwardGeocode>[0]);
    expect(res.features).toHaveLength(1);
    expect(calls[0]!.searchParams.get("layers")).toBe("address,locality");
    expect(calls[0]!.searchParams.get("lang")).toBe("fr");
    expect(res.features[0]?.language).toBe("fr");
  });

  it("reads an array language on reverse too", async () => {
    const api = unmapGeocoderApi({ key: "um_test_x", fetch: stubFetch([calgaryAddress]) });
    await api.reverseGeocode!({ query: [-114.0849, 51.0446], language: ["en"] } as unknown as Parameters<typeof api.forwardGeocode>[0]);
    expect(calls[0]!.searchParams.get("lang")).toBe("en");
  });

  it("uses full-text search in search mode", async () => {
    const api = unmapGeocoderApi({ key: "um_test_x", mode: "search", fetch: stubFetch([calgary]) });
    await api.forwardGeocode({ query: "Calgary" });
    expect(calls[0]!.pathname).toBe("/geocode/search");
  });

  it("returns nothing without calling the gateway for types unmap has no layer for", async () => {
    const api = unmapGeocoderApi({ key: "um_test_x", fetch: stubFetch([calgary]) });
    expect((await api.forwardGeocode({ query: "T2P", types: "postcode" })).features).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("applies a bbox itself on autocomplete, over a wider pool", async () => {
    const outside: GeocodeResult = { ...calgaryAddress, id: "2", lng: -79.38, lat: 43.65 };
    const api = unmapGeocoderApi({ key: "um_test_x", fetch: stubFetch([outside, calgaryAddress]) });
    const res = await api.forwardGeocode({ query: "1000", limit: 2, bbox: [-115, 50, -113, 52] });
    expect(calls[0]!.searchParams.get("limit")).toBe("8");
    expect(calls[0]!.searchParams.has("bbox")).toBe(false);
    expect(res.features.map((f) => f.id)).toEqual(["address.20335012"]);
  });

  it("answers reverseGeocode for a [lng, lat] query", async () => {
    const api = unmapGeocoderApi({ key: "um_test_x", fetch: stubFetch([calgaryAddress]) });
    const res = await api.reverseGeocode!({ query: [-114.0849, 51.0446] });
    expect(calls[0]!.pathname).toBe("/geocode/reverse");
    expect((res.features[0] as UnmapCarmenFeature | undefined)?.address).toBe("1000");
  });

  it("returns an empty collection for a blank query", async () => {
    const api = unmapGeocoderApi({ key: "um_test_x", fetch: stubFetch([calgary]) });
    expect(await api.forwardGeocode({ query: "  " })).toEqual({ type: "FeatureCollection", features: [] });
    expect(calls).toHaveLength(0);
  });
});

describe("createGeocoder", () => {
  it("builds the plugin with MapLibre, results while typing, and the caller's options last", () => {
    createGeocoder({ key: "um_test_x", placeholder: "Search Canada", minLength: 3 });
    const { api, options } = constructed[0]!;
    expect(typeof (api as { forwardGeocode: unknown }).forwardGeocode).toBe("function");
    expect(options.maplibregl).toBeDefined();
    expect(options.showResultsWhileTyping).toBe(true);
    expect(options.placeholder).toBe("Search Canada");
    expect(options.minLength).toBe(3);
    // Client options configure the adapter, never the control.
    expect(options).not.toHaveProperty("key");
  });

  it("fills the input with a picked result's full line, not Carmen's street-only text", () => {
    createGeocoder({ key: "um_test_x" });
    const getItemValue = constructed[0]!.options.getItemValue as (item: unknown) => string;
    expect(getItemValue(toCarmenFeature(calgaryAddress))).toBe("1000 9 AV SW, Calgary, AB");
    expect(getItemValue({ text: "a suggestion" })).toBe("a suggestion");
  });
});

describe("renderers", () => {
  const hostile: GeocodeResult = {
    id: "666",
    name: '<img src=x onerror="alert(1)">, Calgary',
    layer: "poi",
    lng: -114.07,
    lat: 51.04,
    address: { city: "Calgary", region: "AB" },
  };

  it("escape result text that carries markup, in the list and the popup", () => {
    const f = toCarmenFeature(hostile);
    for (const html of [renderResult(f), renderPopup(f)]) {
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
      expect(html).toContain("Calgary, AB");
    }
  });

  it("escape a bare suggestion's text", () => {
    expect(renderResult({ text: "<b>x</b>" })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("are createGeocoder's defaults, still overridable", () => {
    createGeocoder({ key: "um_test_x" });
    expect(constructed[0]!.options.render).toBe(renderResult);
    expect(constructed[0]!.options.popupRender).toBe(renderPopup);
    const mine = () => "";
    createGeocoder({ key: "um_test_x", render: mine });
    expect(constructed[1]!.options.render).toBe(mine);
  });
});
