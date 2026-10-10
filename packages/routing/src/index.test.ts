import { describe, it, expect, vi } from "vitest";
import { Router, RouterError, type AvoidAreas } from "./index";

const mockFetch = (payload: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => payload })) as unknown as typeof fetch;

const urlOf = (f: unknown) =>
  (f as { mock: { calls: string[][] } }).mock.calls[0]![0] as unknown as string;

describe("Router", () => {
  it("route builds from/to/mode params", async () => {
    const f = mockFetch({ distanceMeters: 100, durationSeconds: 60, geometry: { type: "LineString", coordinates: [] } });
    const r = new Router({ key: "k", gateway: "https://api.unmap.dev", fetch: f });
    const out = await r.route([-114, 51], [-113.9, 51.1], { mode: "bicycle" });
    expect(out.distanceMeters).toBe(100);
    const url = urlOf(f);
    expect(url).toContain("/route?");
    expect(url).not.toContain("/v1/");
    expect(url).toContain("from=-114%2C51");
    expect(url).toContain("to=-113.9%2C51.1");
    expect(url).toContain("mode=bicycle");
  });

  it("isochrone joins minutes", async () => {
    const f = mockFetch({ type: "FeatureCollection", features: [] });
    await new Router({ key: "k", fetch: f }).isochrone([-114, 51], { minutes: [5, 10, 15] });
    const url = urlOf(f);
    expect(url).toContain("/isochrone?key=k&near=-114%2C51&minutes=5%2C10%2C15");
    expect(url).not.toContain("/v1/");
    expect(url).not.toMatch(/[?&](lon|lat)=/);
  });

  it("sends mode=car through unchanged", async () => {
    const f = mockFetch({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: f }).route([-114, 51], [-113.9, 51.1], { mode: "car" });
    expect(urlOf(f)).toContain("mode=car");
  });

  it("sends a transit departure as an ISO instant", async () => {
    const f = mockFetch({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: f }).route([-114, 51], [-113.9, 51.1], {
      mode: "transit",
      departAt: new Date("2026-09-15T14:15:00.000Z"),
    });
    const url = urlOf(f);
    expect(url).toContain("mode=transit");
    expect(url).toContain("depart_at=2026-09-15T14%3A15%3A00.000Z");
  });

  it("draws a transit isochrone with a departure", async () => {
    const f = mockFetch({ type: "FeatureCollection", features: [] });
    await new Router({ key: "k", fetch: f }).isochrone([-79.38, 43.65], {
      minutes: [30, 60],
      mode: "transit",
      departAt: "2026-10-15T08:30",
    });
    const url = urlOf(f);
    expect(url).toContain("/isochrone?");
    expect(url).toContain("mode=transit");
    expect(url).toContain("depart_at=2026-10-15T08%3A30");
    expect(url).toContain("minutes=30%2C60");
  });

  it("types a transit isochrone like a transit route: departAt required, road options refused", () => {
    const r = new Router({ key: "k", fetch: mockFetch({}) });
    // @ts-expect-error departAt is required for transit
    void (() => r.isochrone([-79.38, 43.65], { minutes: [30], mode: "transit" }));
    // @ts-expect-error avoid is a road option
    void (() => r.isochrone([-79.38, 43.65], { minutes: [30], mode: "transit", departAt: "2026-10-15T08:30", avoid: ["tolls"] }));
  });

  it("route serialises a truck profile as flat query params", async () => {
    const f = mockFetch({ distanceMeters: 100, durationSeconds: 60, geometry: { type: "LineString", coordinates: [] } });
    const r = new Router({ key: "k", gateway: "https://api.unmap.dev", fetch: f });
    await r.route([-114, 51], [-113.9, 51.1], {
      mode: "truck",
      truck: { height: 4.2, weight: 30, axleCount: 6, hazmat: true, useTruckRoute: 0.8 },
    });
    const url = urlOf(f);
    expect(url).toContain("mode=truck");
    expect(url).toContain("height=4.2");
    expect(url).toContain("weight=30");
    expect(url).toContain("axle_count=6");
    expect(url).toContain("hazmat=true");
    expect(url).toContain("use_truck_route=0.8");
    expect(url).not.toContain("width=");
  });

  it("route serialises useHighways as use_highways", async () => {
    const f = mockFetch({ distanceMeters: 100, durationSeconds: 60, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: f }).route([-114, 51], [-113.9, 51.1], {
      mode: "auto",
      useHighways: 0,
    });
    expect(urlOf(f)).toContain("use_highways=0");
  });

  it("route serialises useHills as use_hills", async () => {
    const f = mockFetch({ distanceMeters: 100, durationSeconds: 60, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: f }).route([-114, 51], [-113.9, 51.1], {
      mode: "bicycle",
      useHills: 0,
    });
    // 0 is the value that matters: it means "avoid every hill", and a truthiness check on the
    // way to the query string would silently drop it.
    expect(urlOf(f)).toContain("use_hills=0");
  });

  it("isochrone serialises useHills too", async () => {
    const f = mockFetch({ type: "FeatureCollection", features: [] });
    await new Router({ key: "k", fetch: f }).isochrone([-114, 51], {
      minutes: [10],
      mode: "pedestrian",
      useHills: 1,
    });
    expect(urlOf(f)).toContain("use_hills=1");
  });

  it("omits use_hills entirely when it is not set", async () => {
    const f = mockFetch({ distanceMeters: 100, durationSeconds: 60, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: f }).route([-114, 51], [-113.9, 51.1], { mode: "bicycle" });
    expect(urlOf(f)).not.toContain("use_hills");
  });

  it("isochrone serialises a truck profile the same way", async () => {
    const f = mockFetch({ type: "FeatureCollection", features: [] });
    await new Router({ key: "k", fetch: f }).isochrone([-114, 51], {
      minutes: [10],
      mode: "truck",
      truck: { length: 25, axleLoad: 10 },
    });
    const url = urlOf(f);
    expect(url).toContain("mode=truck");
    expect(url).toContain("length=25");
    expect(url).toContain("axle_load=10");
  });

  it("throws RouterError on non-ok", async () => {
    const r = new Router({ key: "k", fetch: mockFetch({}, false, 429) });
    await expect(r.route([0, 0], [1, 1])).rejects.toThrow(/429/);
  });

  it("puts the gateway's reason on the error", async () => {
    const f = mockFetch({ error: "mode must be one of auto, car, bicycle, pedestrian, truck" }, false, 400);
    const r = new Router({ key: "k", fetch: f });
    const err = await r.route([0, 0], [1, 1]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouterError);
    expect((err as RouterError).message).toMatch(/^mode must be one of .* \(route 400 on \/route\)$/);
    expect((err as RouterError).code).toBeUndefined();
  });
});

/**
 * Every other test injects `opts.fetch`, which is exactly how the default path shipped broken:
 * a bare `fetch` stored on the instance is invoked with the Router as its receiver, and browsers
 * answer that with "Illegal invocation". Node is lenient, so only a receiver-checking stub
 * reproduces it here.
 */
describe("default fetch", () => {
  it("invokes the global fetch with the global as its receiver", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } }),
      } as Response);
    } as unknown as typeof fetch;
    try {
      await expect(new Router({ key: "k" }).route([0, 0], [1, 1])).resolves.toMatchObject({
        distanceMeters: 1,
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("Router.matrix", () => {
  it("POSTs origins and destinations as JSON and returns the grid", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ durations: [[720]], distances: [[10200]] }), { status: 200 });
    }) as unknown as typeof fetch;

    const router = new Router({ key: "um_test_x", gateway: "https://api.example.com", fetch: fetchImpl });
    const out = await router.matrix([[-114.07, 51.05]], [[-113.99, 51.05]], { mode: "truck", truck: { height: 4.2 } });

    expect(out).toEqual({ durations: [[720]], distances: [[10200]] });
    expect(seen!.url).toBe("https://api.example.com/matrix?key=um_test_x");
    expect(seen!.init.method).toBe("POST");
    // Numbers stay numbers on the wire. The gateway stringifies them on the way in, so the
    // SDK has no reason to send "4.2" as a string.
    expect(JSON.parse(String(seen!.init.body))).toEqual({
      origins: [[-114.07, 51.05]],
      destinations: [[-113.99, 51.05]],
      mode: "truck",
      height: 4.2,
    });
  });

  it("serialises avoid as a comma list on the GET endpoints and an array in the POST body", async () => {
    // Two shapes, one meaning. The gateway reads both through the same parser, so a test that
    // only covered one would let the other drift into a silently dropped option.
    const g = mockFetch({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: g }).route([-114, 51], [-113.9, 51.1], { avoid: ["tolls", "ferries"] });
    expect(urlOf(g)).toContain("avoid=tolls%2Cferries");

    const i = mockFetch({ type: "FeatureCollection", features: [] });
    await new Router({ key: "k", fetch: i }).isochrone([-114, 51], { minutes: [10], avoid: ["ferries"] });
    expect(urlOf(i)).toContain("avoid=ferries");

    let seen: RequestInit | undefined;
    const post = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ sources_to_targets: [[{ time: 1, distance: 1 }]] }), { status: 200 });
    }) as unknown as typeof fetch;
    await new Router({ key: "um_test_x", fetch: post }).matrix(
      [[-114.07, 51.05]],
      [[-113.99, 51.05]],
      { avoid: ["tolls"] },
    );
    expect(JSON.parse(String(seen!.body))).toMatchObject({ avoid: ["tolls"] });
  });

  it("omits avoid entirely when it is absent or empty", async () => {
    const f = mockFetch({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } });
    const r = new Router({ key: "k", fetch: f });
    await r.route([-114, 51], [-113.9, 51.1], {});
    expect(urlOf(f)).not.toContain("avoid=");
    // An empty array is a caller computing a list that came out empty, not a request for an
    // empty avoid, which the gateway answers with a 400.
    const e = mockFetch({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: e }).route([-114, 51], [-113.9, 51.1], { avoid: [] });
    expect(urlOf(e)).not.toContain("avoid=");
  });

  it("switches route and isochrone to POST when avoidAreas is present, and only then", async () => {
    const poly: AvoidAreas = { type: "Polygon", coordinates: [[[-114.1, 51], [-114, 51], [-114, 51.1], [-114.1, 51]]] };
    let seen: RequestInit | undefined;
    let url = "";
    const post = (async (u: string, init: RequestInit) => {
      url = u;
      seen = init;
      return new Response(
        JSON.stringify({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    await new Router({ key: "um_test_x", fetch: post }).route([-114, 51], [-113.9, 51.1], { avoidAreas: poly });
    expect(seen!.method).toBe("POST");
    expect(url).toContain("/route");
    expect(JSON.parse(String(seen!.body))).toMatchObject({ from: [-114, 51], avoid_areas: poly });

    let isoUrl = "";
    let isoInit: RequestInit | undefined;
    const isoPost = (async (u: string, init: RequestInit) => {
      isoUrl = u;
      isoInit = init;
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await new Router({ key: "um_test_x", fetch: isoPost }).isochrone([-114.07, 51.05], { minutes: [10], avoidAreas: poly });
    expect(isoInit!.method).toBe("POST");
    expect(isoUrl).toContain("/isochrone");
    expect(JSON.parse(String(isoInit!.body))).toMatchObject({ near: [-114.07, 51.05], minutes: [10], avoid_areas: poly });
    expect(JSON.parse(String(isoInit!.body))).not.toHaveProperty("center");

    // Without it the GET stays the default, so a plain route keeps its cacheable URL.
    const g = mockFetch({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } });
    await new Router({ key: "k", fetch: g }).route([-114, 51], [-113.9, 51.1], {});
    expect(urlOf(g)).toContain("/route?");
  });

  it("carries avoidAreas into the POST body on matrix, match and optimize too", async () => {
    const poly: AvoidAreas = { type: "Polygon", coordinates: [[[-114.1, 51], [-114, 51], [-114, 51.1], [-114.1, 51]]] };
    let seen: RequestInit | undefined;
    const post = (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ sources_to_targets: [[{ time: 1, distance: 1 }]] }), { status: 200 });
    }) as unknown as typeof fetch;
    await new Router({ key: "um_test_x", fetch: post }).matrix(
      [[-114.07, 51.05]],
      [[-113.99, 51.05]],
      { avoidAreas: poly },
    );
    expect(JSON.parse(String(seen!.body))).toMatchObject({ avoid_areas: poly });
  });

  it("carries useHills into the POST body, on matrix and on match", async () => {
    // useHills lives on the same RouteOptions the POST endpoints take, so leaving it out of the
    // body builder would typecheck at the call site and drop the option on the floor.
    let seen: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response(
        JSON.stringify({ sources_to_targets: [[{ time: 720, distance: 10.2 }]] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const router = new Router({ key: "um_test_x", fetch: fetchImpl });

    await router.matrix([[-114.07, 51.05]], [[-113.99, 51.05]], { mode: "bicycle", useHills: 0 });
    expect(JSON.parse(String(seen!.body))).toMatchObject({ mode: "bicycle", use_hills: 0 });

    const matchFetch = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response(
        JSON.stringify({ distanceMeters: 1, durationSeconds: 1, geometry: { type: "LineString", coordinates: [] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    await new Router({ key: "um_test_x", fetch: matchFetch }).match(
      [[-114.07, 51.05], [-113.99, 51.05]],
      { mode: "pedestrian", useHills: 1 },
    );
    expect(JSON.parse(String(seen!.body))).toMatchObject({ mode: "pedestrian", use_hills: 1 });
  });

  it("throws a RouterError carrying the gateway's code", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "at most 10 origins", code: "too_many_locations" }), {
        status: 400,
      })) as unknown as typeof fetch;
    const router = new Router({ key: "um_test_x", fetch: fetchImpl });
    await expect(router.matrix([[-114, 51]], [[-113, 51]])).rejects.toMatchObject({
      status: 400,
      code: "too_many_locations",
    });
  });
});

describe("Router.match", () => {
  it("POSTs coordinates and returns a RouteResult", async () => {
    let seen: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response(
        JSON.stringify({ distanceMeters: 10200, durationSeconds: 720, geometry: { type: "LineString", coordinates: [] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const router = new Router({ key: "um_test_x", fetch: fetchImpl });
    const out = await router.match([[-114.07, 51.05], [-113.99, 51.05]]);
    expect(out.distanceMeters).toBe(10200);
    expect(JSON.parse(String(seen!.body))).toEqual({
      coordinates: [[-114.07, 51.05], [-113.99, 51.05]],
    });
  });
});

describe("Router.optimize", () => {
  it("POSTs stops and returns an OptimizedRouteResult", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({
          order: [0, 2, 3, 1],
          distanceMeters: 38200,
          durationSeconds: 3410,
          geometry: { type: "LineString", coordinates: [] },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const router = new Router({ key: "um_test_x", gateway: "https://api.example.com", fetch: fetchImpl });
    const stops: [number, number][] = [
      [-114.07, 51.05],
      [-113.98, 51.04],
      [-114.12, 51.03],
      [-114.04, 51.08],
    ];
    const out = await router.optimize(stops, { mode: "truck", truck: { height: 4.2 } });

    expect(out).toEqual({
      order: [0, 2, 3, 1],
      distanceMeters: 38200,
      durationSeconds: 3410,
      geometry: { type: "LineString", coordinates: [] },
    });
    expect(seen!.url).toBe("https://api.example.com/optimized-route?key=um_test_x");
    expect(seen!.init.method).toBe("POST");
    expect(JSON.parse(String(seen!.init.body))).toEqual({
      stops: [
        [-114.07, 51.05],
        [-113.98, 51.04],
        [-114.12, 51.03],
        [-114.04, 51.08],
      ],
      mode: "truck",
      height: 4.2,
    });
  });

  it("throws a RouterError carrying code no_route on a 422", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: "no optimized route: a stop is unreachable or beyond the engine's distance limit",
          code: "no_route",
        }),
        { status: 422 },
      )) as unknown as typeof fetch;
    const router = new Router({ key: "um_test_x", fetch: fetchImpl });
    const stops: [number, number][] = [[-114, 51], [-113.9, 51.1], [-113.8, 51.2]];
    const err = await router.optimize(stops).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouterError);
    expect((err as RouterError).status).toBe(422);
    expect((err as RouterError).code).toBe("no_route");
  });

  it("keeps a WGS84 range error as 400 invalid_location", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: "longitude is -180..180 and latitude -90..90",
          code: "invalid_location",
        }),
        { status: 400 },
      )) as unknown as typeof fetch;
    const router = new Router({ key: "um_test_x", fetch: fetchImpl });
    const err = await router.route([181, 40], [-114, 51]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouterError);
    expect((err as RouterError).status).toBe(400);
    expect((err as RouterError).code).toBe("invalid_location");
  });

  it("keeps an endpoint outside Canada as 422 outside_coverage", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: "outside Canadian coverage",
          code: "outside_coverage",
        }),
        { status: 422 },
      )) as unknown as typeof fetch;
    const router = new Router({ key: "um_test_x", fetch: fetchImpl });
    const err = await router.route([-114.07, 51.05], [-122.33, 47.61]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RouterError);
    expect((err as RouterError).status).toBe(422);
    expect((err as RouterError).code).toBe("outside_coverage");
  });
});

describe("Router.status", () => {
  it("GETs /routing/status and returns the graph's state", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({
          region: "canada",
          status: "ready",
          engine: { name: "valhalla", version: "3.8.3" },
          graph: { builtAt: "2026-09-10T04:12:00.000Z", ageHours: 176 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const out = await new Router({ key: "um_test_x", gateway: "https://api.example.com", fetch: fetchImpl }).status();
    expect(out).toEqual({
      region: "canada",
      status: "ready",
      engine: { name: "valhalla", version: "3.8.3" },
      graph: { builtAt: "2026-09-10T04:12:00.000Z", ageHours: 176 },
    });
    // Not "/route/status", and not "/v1/": the path is its own spelling and the gateway serves it
    // at the root like everything else.
    expect(seen!.url).toBe("https://api.example.com/routing/status?key=um_test_x");
    // A GET, unlike matrix/match/optimize: no method override and no body, so fetch's own default
    // applies. The gateway only registers this path for GET.
    expect(seen!.init.method).toBeUndefined();
    expect(seen!.init.body).toBeUndefined();
  });

  it("resolves with status unavailable rather than rejecting when routing is down", async () => {
    // The gateway answers 200 with `status: "unavailable"` when the container does not answer, so
    // the client has nothing to throw. A status call that rejects when its subject is unhealthy
    // would tell a caller nothing a failed route() had not already told them.
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ region: "canada", status: "unavailable", engine: { name: "valhalla" } }), {
        status: 200,
      })) as unknown as typeof fetch;
    const out = await new Router({ key: "um_test_x", fetch: fetchImpl }).status();
    expect(out.status).toBe("unavailable");
    expect(out.graph).toBeUndefined();
  });

  it("passes graph.osmTimestamp through when the gateway sent one", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          region: "canada",
          status: "ready",
          engine: { name: "valhalla", version: "3.8.3" },
          graph: {
            builtAt: "2026-09-10T04:12:00.000Z",
            ageHours: 176,
            osmTimestamp: "2026-09-09T20:21:13.000Z",
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const out = await new Router({ key: "um_test_x", fetch: fetchImpl }).status();
    expect(out.graph?.osmTimestamp).toBe("2026-09-09T20:21:13.000Z");
  });
});
