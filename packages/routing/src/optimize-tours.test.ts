import { describe, it, expect, vi } from "vitest";
import { UnmapError } from "@unmap/core";
import { Router, UnmapOptimizeError, optimizeTours, type OptimizeToursRequest } from "./index";

const REQUEST: OptimizeToursRequest = {
  model: {
    shipments: [{ deliveries: [{ arrivalLocation: { latitude: 51.05, longitude: -114.07 } }] }],
    vehicles: [{ startLocation: { latitude: 51.04, longitude: -114.06 } }],
  },
};

const RESPONSE = { routes: [{ vehicleIndex: 0, visits: [{ shipmentIndex: 0 }] }], metrics: { totalCost: 12.5 } };

interface Stub {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  bodyThrows?: boolean;
}

function stubFetch(...responses: Stub[]) {
  let i = 0;
  return vi.fn(async (_url: unknown, _init?: unknown) => {
    const r = responses[Math.min(i++, responses.length - 1)]!;
    const status = r.status ?? 200;
    const headers = new Headers(r.headers ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      json: async () => {
        if (r.bodyThrows) throw new SyntaxError("Unexpected token");
        return r.body ?? RESPONSE;
      },
    };
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const callOf = (f: unknown, n = 0) =>
  (f as { mock: { calls: [string, RequestInit][] } }).mock.calls[n]!;

const googleError = (code: number, status: string, message: string, details?: unknown[], top?: string) => ({
  error: { code, message, status, ...(details ? { details } : {}) },
  ...(top ? { code: top } : {}),
});

describe("optimizeTours", () => {
  it("POSTs the request to /optimize with the key in X-API-Key, not the URL", async () => {
    const f = stubFetch({});
    const out = await optimizeTours(REQUEST, { key: "um_test_abc", gateway: "https://api.unmap.dev/", fetch: f });
    const [url, init] = callOf(f);
    expect(url).toBe("https://api.unmap.dev/optimize");
    expect(url).not.toContain("key=");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("um_test_abc");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
    expect(out.response).toEqual(RESPONSE);
  });

  it("uses the default gateway when none is given", async () => {
    const f = stubFetch({});
    await optimizeTours(REQUEST, { key: "k", fetch: f });
    expect(callOf(f)[0]).toBe("https://api.unmap.dev/optimize");
  });

  it("returns the GMPRO response untouched and the header metadata beside it", async () => {
    const warnings = [
      { code: "FIELD_IGNORED", field: "considerRoadTraffic", path: "considerRoadTraffic", count: 1, message: "considerRoadTraffic is ignored" },
    ];
    const f = stubFetch({
      headers: {
        "X-Unmap-Optimize-Warnings": JSON.stringify(warnings),
        "X-Unmap-Billable-Shipments": "7",
        Warning: '299 - "timeout clamped to 30s for this plan"',
      },
    });
    const out = await optimizeTours(REQUEST, { key: "k", fetch: f });
    expect(out.response).toEqual(RESPONSE);
    expect(Object.keys(out.response)).toEqual(["routes", "metrics"]);
    expect(out.warnings).toEqual(warnings);
    expect(out.billableShipments).toBe(7);
    expect(out.timeoutClamped).toBe(true);
    expect(out.clampedTimeoutSeconds).toBe(30);
  });

  it("reports empty metadata when the gateway sent none", async () => {
    const out = await optimizeTours(REQUEST, { key: "k", fetch: stubFetch({}) });
    expect(out.warnings).toEqual([]);
    expect(out.billableShipments).toBe(0);
    expect(out.timeoutClamped).toBe(false);
    expect(out.clampedTimeoutSeconds).toBeNull();
  });

  it("does not throw on a malformed warnings header", async () => {
    const f = stubFetch({ headers: { "X-Unmap-Optimize-Warnings": "{not json", "X-Unmap-Billable-Shipments": "many", Warning: "199 - other" } });
    const out = await optimizeTours(REQUEST, { key: "k", fetch: f });
    expect(out.warnings).toEqual([]);
    expect(out.billableShipments).toBe(0);
    expect(out.timeoutClamped).toBe(false);
  });

  it("passes an abort signal through", async () => {
    const f = stubFetch({});
    const ctrl = new AbortController();
    await optimizeTours(REQUEST, { key: "k", fetch: f, signal: ctrl.signal });
    expect(callOf(f)[1].signal).toBe(ctrl.signal);
  });

  it("is also a method on Router, which shares the key, gateway and fetch", async () => {
    const f = stubFetch({});
    const out = await new Router({ key: "k2", gateway: "https://gw.example", fetch: f }).optimizeTours(REQUEST);
    expect(callOf(f)[0]).toBe("https://gw.example/optimize");
    expect((callOf(f)[1].headers as Record<string, string>)["x-api-key"]).toBe("k2");
    expect(out.response).toEqual(RESPONSE);
  });
});

describe("UnmapOptimizeError", () => {
  it("carries the Google status, message and details of a validation failure", async () => {
    const details = [
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        fieldViolations: [{ field: "model.shipments[0]", description: "needs a pickup or a delivery" }],
      },
    ];
    const f = stubFetch({ status: 400, body: googleError(400, "INVALID_ARGUMENT", "The request has 1 validation error.", details, "bad_request") });
    const err = await optimizeTours(REQUEST, { key: "k", fetch: f }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnmapOptimizeError);
    expect(err).toBeInstanceOf(UnmapError);
    const e = err as UnmapOptimizeError;
    expect(e.status).toBe(400);
    expect(e.googleStatus).toBe("INVALID_ARGUMENT");
    expect(e.code).toBe("bad_request");
    expect(e.message).toContain("The request has 1 validation error.");
    expect(e.details).toEqual(details);
    expect(e.retryAfterSeconds).toBeUndefined();
    expect(e.name).toBe("UnmapOptimizeError");
  });

  it("reads Retry-After on a 429 and retries nothing when retry is off", async () => {
    const f = stubFetch({
      status: 429,
      headers: { "Retry-After": "12" },
      body: googleError(429, "RESOURCE_EXHAUSTED", "Every optimizer instance is busy.", undefined, "rate_limited"),
    });
    const e = (await optimizeTours(REQUEST, { key: "k", fetch: f, retry: false }).catch((x: unknown) => x)) as UnmapOptimizeError;
    expect(f).toHaveBeenCalledTimes(1);
    expect(e.status).toBe(429);
    expect(e.googleStatus).toBe("RESOURCE_EXHAUSTED");
    expect(e.code).toBe("rate_limited");
    expect(e.retryAfterSeconds).toBe(12);
    expect(e.retryable).toBe(true);
  });

  it("retries a 503 by default and returns the later success", async () => {
    const f = stubFetch(
      { status: 503, headers: { "Retry-After": "0" }, body: googleError(503, "UNAVAILABLE", "No optimizer instance.", undefined, "service_unavailable") },
      {},
    );
    const out = await optimizeTours(REQUEST, { key: "k", fetch: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(out.response).toEqual(RESPONSE);
  });

  it("handles the gateway's plain error body when the feature is not enabled", async () => {
    const f = stubFetch({ status: 404, body: { error: "Not found", code: "not_found" } });
    const e = (await optimizeTours(REQUEST, { key: "k", fetch: f }).catch((x: unknown) => x)) as UnmapOptimizeError;
    expect(e).toBeInstanceOf(UnmapOptimizeError);
    expect(e.status).toBe(404);
    expect(e.code).toBe("not_found");
    expect(e.googleStatus).toBeUndefined();
    expect(e.details).toEqual([]);
    expect(e.message).toContain("Not found");
  });

  it("falls back to a status message when the body is not JSON", async () => {
    const f = stubFetch({ status: 502, bodyThrows: true });
    const e = (await optimizeTours(REQUEST, { key: "k", fetch: f, retry: false }).catch((x: unknown) => x)) as UnmapOptimizeError;
    expect(e.status).toBe(502);
    expect(e.message).toContain("502");
    expect(e.details).toEqual([]);
  });

  it("throws UnmapOptimizeError, not a raw SyntaxError, when a 200 body is not JSON", async () => {
    const f = stubFetch({ status: 200, bodyThrows: true });
    const err = await optimizeTours(REQUEST, { key: "k", fetch: f, retry: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnmapOptimizeError);
    expect(err).toBeInstanceOf(UnmapError);
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect((err as UnmapOptimizeError).status).toBe(200);
    expect((err as UnmapOptimizeError).message).toContain("not JSON");
  });

  it("keeps the mandatory-shipment precondition detail", async () => {
    const details = [
      { "@type": "type.googleapis.com/google.rpc.PreconditionFailure", violations: [{ type: "NO_VEHICLE", subject: "model.shipments[0]", description: "x" }] },
    ];
    const f = stubFetch({ status: 400, body: googleError(400, "FAILED_PRECONDITION", "A mandatory shipment cannot be served.", details, "bad_request") });
    const e = (await optimizeTours(REQUEST, { key: "k", fetch: f }).catch((x: unknown) => x)) as UnmapOptimizeError;
    expect(e.googleStatus).toBe("FAILED_PRECONDITION");
    expect(e.details).toEqual(details);
  });
});
