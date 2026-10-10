import { describe, expect, it } from "vitest";
import { Places, PlacesError, type Place } from "./places";

const PLACE: Place = {
  id: "um:place:1234",
  source_id: "1234",
  name: "RBC Royal Bank",
  names: { en: "RBC Royal Bank", fr: "Banque Royale" },
  category: "finance.bank",
  category_group: "finance",
  coordinates: [-114.0676, 51.0447],
  address: { housenumber: "339", street: "8 Avenue SW", city: "Calgary" },
  source: "places.osm-poi",
};

function client(handler: (url: URL, init?: RequestInit) => Response) {
  const seen: URL[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push(url);
    return handler(url, init);
  }) as typeof fetch;
  return { places: new Places({ key: "um_test_k", fetch: impl }), seen };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const envelope = (data: unknown) =>
  ok({
    data,
    meta: { status: "current", attribution: "(c) OpenStreetMap contributors", unmap_updated_at: "2026-09-17T00:00:00Z" },
  });

describe("Places.search", () => {
  it("calls /places/search with the key and the query", async () => {
    const { places, seen } = client(() => envelope([PLACE]));
    const res = await places.search("bank", { limit: 5, lang: "fr" });
    expect(seen[0]!.pathname).toBe("/places/search");
    expect(seen[0]!.searchParams.get("q")).toBe("bank");
    expect(seen[0]!.searchParams.get("limit")).toBe("5");
    expect(seen[0]!.searchParams.get("lang")).toBe("fr");
    expect(seen[0]!.searchParams.get("key")).toBe("um_test_k");
    expect(res.data[0]!.id).toBe("um:place:1234");
  });

  it("surfaces meta rather than unwrapping it away", async () => {
    // A caller who cannot see `attribution` cannot comply with the licence the data came under.
    const { places } = client(() => envelope([PLACE]));
    const res = await places.search("bank");
    expect(res.meta.attribution).toContain("OpenStreetMap");
    expect(res.meta.status).toBe("current");
  });

  it("omits empty parameters instead of sending blanks", async () => {
    const { places, seen } = client(() => envelope([]));
    await places.search("bank");
    expect(seen[0]!.searchParams.has("limit")).toBe(false);
    expect(seen[0]!.searchParams.has("bbox")).toBe(false);
  });

  it("joins a bbox", async () => {
    const { places, seen } = client(() => envelope([]));
    await places.search("bank", { bbox: [-115, 50, -113, 52] });
    expect(seen[0]!.searchParams.get("bbox")).toBe("-115,50,-113,52");
  });
});

describe("Places.nearby", () => {
  it("accepts one category or several", async () => {
    const { places, seen } = client(() => envelope([PLACE]));
    await places.nearby("bakery", { near: [-114.07, 51.05], radius: 2000 });
    expect(seen[0]!.pathname).toBe("/places/nearby");
    expect(seen[0]!.searchParams.get("category")).toBe("bakery");
    expect(seen[0]!.searchParams.get("near")).toBe("-114.07,51.05");
    expect(seen[0]!.searchParams.get("radius")).toBe("2000");

    await places.nearby(["bakery", "cafe"], { near: [-114.07, 51.05] });
    expect(seen[1]!.searchParams.get("category")).toBe("bakery,cafe");
  });

  it("passes an alias through for the gateway to resolve", async () => {
    // Resolution happens server-side so raw curl works too; the client must not second-guess it.
    const { places, seen } = client(() => envelope([]));
    await places.nearby("boulangerie", { near: [-73.57, 45.5] });
    expect(seen[0]!.searchParams.get("category")).toBe("boulangerie");
  });
});

describe("Places.get", () => {
  it("encodes the id into the path", async () => {
    const { places, seen } = client(() =>
      ok({ data: PLACE, meta: { status: "current", attribution: "x", unmap_updated_at: "t" } }),
    );
    const res = await places.get("um:place:1234");
    expect(seen[0]!.pathname).toBe(`/places/${encodeURIComponent("um:place:1234")}`);
    expect(res.data.name).toBe("RBC Royal Bank");
  });

  it("throws a PlacesError carrying the gateway's own reason", async () => {
    const { places } = client(
      () =>
        new Response(
          JSON.stringify({ error: "no such place, or the geocoding container predates /places/{id}", code: "not_found" }),
          { status: 404 },
        ),
    );
    await expect(places.get("um:place:9")).rejects.toMatchObject({
      name: "PlacesError",
      status: 404,
      code: "not_found",
    });
    // The message carries the reason, so a caller who logs the error reads why, not a bare status.
    await expect(places.get("um:place:9")).rejects.toThrow(/predates/);
  });

  it("still throws usefully when the error body is not JSON", async () => {
    const { places } = client(() => new Response("<html>", { status: 502 }));
    await expect(places.get("um:place:9")).rejects.toMatchObject({ status: 502 });
  });
});

describe("the client surface", () => {
  it("declares no fields the corpus does not carry", () => {
    // `"phone": null` would be a claim about the place and usually a false one. The type declares
    // only what is actually returned, so a caller is never invited to read a field that is always
    // absent.
    const keys = Object.keys(PLACE);
    for (const absent of ["phone", "website", "opening_hours", "accessibility", "operator", "attributes"]) {
      expect(keys, absent).not.toContain(absent);
    }
  });

  it("does not leak the key into an error message", async () => {
    const { places } = client(() => new Response(JSON.stringify({ error: "nope" }), { status: 400 }));
    const error = await places.search("x").catch((e: PlacesError) => e);
    expect(String(error)).not.toContain("um_test_k");
  });
});
