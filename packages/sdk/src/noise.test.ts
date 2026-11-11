import { describe, expect, it } from "vitest";
import { UnmapError } from "@unmap/core";
import { Unmap } from "./index";
import { Noise, NoiseError, type NoisePoint } from "./noise";

// The res-11 hexagon at 236 11 Street NW, Calgary, in release 2026-11-10.28f32d82e125.
const POINT: NoisePoint = {
  h3: "8b12ccd2929afff",
  resolution: 11,
  city: "calgary",
  lden: 49.3,
  lnight: 40.2,
  score: 91,
  risk: 9,
  label: "Quiet",
  exceeds_who: { day: false, night: false },
  dominant_source: "road",
  sources_db: { road: 45.7, rail: 44.3, aircraft: null, commercial: 28 },
};

const META = {
  source: "PickYourPlace",
  unmap_updated_at: "2026-11-10T17:57:09+00:00",
  data_version: "2026-11-10.28f32d82e125",
  status: "current",
  attribution: "© OpenStreetMap contributors; noise model: PickYourPlace",
  licence: "ODbL-1.0",
};

function client(handler: (url: URL) => Response) {
  const seen: URL[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url);
    return handler(url);
  }) as typeof fetch;
  return { noise: new Noise({ key: "um_test_k", gateway: "https://api.test/", fetch: impl, retry: false }), seen };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Noise", () => {
  it("looks up a point with the key, lat and lng, and returns the hexagon with its licence", async () => {
    const { noise, seen } = client(() => json({ data: POINT, meta: META }));
    const { data, meta } = await noise.point({ lat: 51.054, lng: -114.0884 });
    expect(seen[0]!.origin + seen[0]!.pathname).toBe("https://api.test/noise/point");
    expect(Object.fromEntries(seen[0]!.searchParams)).toEqual({ key: "um_test_k", lat: "51.054", lng: "-114.0884" });
    expect(data).toEqual(POINT);
    expect(meta).toMatchObject({ licence: "ODbL-1.0", data_version: "2026-11-10.28f32d82e125" });
    expect(meta.attribution).toContain("© OpenStreetMap contributors");
  });

  it("passes a null level through as null, with the note", async () => {
    const empty: NoisePoint = { ...POINT, lden: null, lnight: null, score: null, risk: null, label: null, note: "no modelled source within range" };
    const { noise } = client(() => json({ data: empty, meta: META }));
    const { data } = await noise.point({ lat: 51.054, lng: -114.0884 });
    expect(data.lden).toBeNull();
    expect(data.note).toBe("no modelled source within range");
  });

  it("refuses a coordinate outside WGS84 without a request", async () => {
    const { noise, seen } = client(() => json({ data: POINT, meta: META }));
    for (const bad of [{ lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: Number.NaN, lng: 0 }]) {
      const error = await noise.point(bad).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NoiseError);
      expect(error).toMatchObject({ status: 400, code: "bad_request" });
    }
    expect(seen).toEqual([]);
  });

  it("throws outside_coverage with the covered cities", async () => {
    const cities = [{ slug: "calgary", name: { en: "Calgary", fr: "Calgary" }, bbox: [-114.33, 50.83, -113.86, 51.22] }];
    const { noise } = client(() => json({ error: "this point is outside the cities Urban Noise covers", code: "outside_coverage", cities }, 422));
    const error = await noise.point({ lat: 63.75, lng: -68.52 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoiseError);
    expect(error).toBeInstanceOf(UnmapError);
    expect(error).toMatchObject({ status: 422, code: "outside_coverage", cities });
  });

  it("names the SKU on a 403", async () => {
    const { noise } = client(() =>
      json(
        {
          error: "Urban Noise requires the Urban Noise add-on",
          code: "addon_required",
          capability: "urbanNoise",
          addon: "addon-urban-noise",
        },
        403,
      ),
    );
    const error = await noise.point({ lat: 51.05, lng: -114.08 }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403, code: "addon_required", addon: "addon-urban-noise" });
  });

  it("is on the Unmap client as unmap.noise", () => {
    const unmap = new Unmap({ key: "um_test_k" });
    expect(unmap.noise).toBeInstanceOf(Noise);
  });
});
