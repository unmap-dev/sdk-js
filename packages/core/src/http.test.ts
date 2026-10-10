import { describe, expect, it, vi } from "vitest";
import { UnmapError, fetchWithRetry, parseRetryAfter } from "./http";

/** A fetch stub with no `clone()` and no `Headers`, which is what a caller's test double looks like. */
function stub(...responses: { status: number; retryAfter?: string }[]): typeof fetch {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (n: string) => (n === "retry-after" ? (r.retryAfter ?? null) : null) },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const calls = (f: typeof fetch) => (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

describe("parseRetryAfter", () => {
  it("reads the delta-seconds form", () => {
    expect(parseRetryAfter("5")).toBe(5);
    expect(parseRetryAfter("60")).toBe(60);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("reads the HTTP-date form and never goes negative", () => {
    const soon = new Date(Date.now() + 30_000).toUTCString();
    expect(parseRetryAfter(soon)).toBeGreaterThan(20);
    expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it("is null for absent or unusable values", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("UnmapError", () => {
  it("is what every product's error can be caught as", () => {
    class GeocoderError extends UnmapError {}
    const e = new GeocoderError(503, "geocode temporarily unavailable", "service_unavailable", 60);
    expect(e).toBeInstanceOf(UnmapError);
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(503);
    expect(e.code).toBe("service_unavailable");
    expect(e.retryAfterSeconds).toBe(60);
  });

  it("calls the waitable failures retryable and nothing else", () => {
    const retryable = (s: number) => new UnmapError(s, "x").retryable;
    expect([429, 502, 503, 0].every(retryable)).toBe(true);
    expect([400, 401, 403, 404, 409, 413, 422, 500].some(retryable)).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  it("returns a success without retrying", async () => {
    const f = stub({ status: 200 });
    const res = await fetchWithRetry(f, "https://x/y", {}, undefined);
    expect(res.status).toBe(200);
    expect(calls(f)).toBe(1);
  });

  it("retries a 503 and returns the eventual success", async () => {
    const f = stub({ status: 503, retryAfter: "0" }, { status: 200 });
    const res = await fetchWithRetry(f, "https://x/y", {}, undefined);
    expect(res.status).toBe(200);
    expect(calls(f)).toBe(2);
  });

  it("does not retry a 400, which describes the request", async () => {
    const f = stub({ status: 400 });
    const res = await fetchWithRetry(f, "https://x/y", {}, undefined);
    expect(res.status).toBe(400);
    expect(calls(f)).toBe(1);
  });

  /**
   * The land and energy containers are allowed to sleep and answer `Retry-After: 60`; geocode
   * and routing are held warm and answer `5`. Sleeping a caller's request handler for a full
   * minute inside one `await` is a worse surprise than an error they can schedule around, so the
   * wait is capped and the response comes straight back carrying the header.
   */
  it("hands back a wait longer than maxDelayMs instead of sleeping through it", async () => {
    const f = stub({ status: 503, retryAfter: "60" });
    const started = Date.now();
    const res = await fetchWithRetry(f, "https://x/y", {}, undefined);
    expect(res.status).toBe(503);
    expect(calls(f)).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("waits out a long Retry-After when the caller raises the cap", async () => {
    const f = stub({ status: 503, retryAfter: "0" }, { status: 200 });
    const res = await fetchWithRetry(f, "https://x/y", {}, { maxDelayMs: 120_000 });
    expect(res.status).toBe(200);
    expect(calls(f)).toBe(2);
  });

  it("retry: false sends exactly one request", async () => {
    const f = stub({ status: 503, retryAfter: "0" });
    const res = await fetchWithRetry(f, "https://x/y", {}, false);
    expect(res.status).toBe(503);
    expect(calls(f)).toBe(1);
  });

  it("stops after the configured attempts and returns the last failure", async () => {
    const f = stub({ status: 503, retryAfter: "0" });
    const res = await fetchWithRetry(f, "https://x/y", {}, { attempts: 3 });
    expect(res.status).toBe(503);
    expect(calls(f)).toBe(3);
  });

  it("never touches the body, so a stub without clone() works", async () => {
    // The whole reason the retry decision reads only status and headers: `opts.fetch` exists so
    // a caller can pass a two-line stub, and requiring `clone()` would break every one of them.
    const f = stub({ status: 503, retryAfter: "0" }, { status: 200 });
    await expect(fetchWithRetry(f, "https://x/y", {}, undefined)).resolves.toBeDefined();
  });

  it("retries a transport failure but never an abort", async () => {
    let n = 0;
    const flaky = (async () => {
      if (++n === 1) throw new Error("network down");
      return { ok: true, status: 200, headers: { get: () => null } } as unknown as Response;
    }) as unknown as typeof fetch;
    expect((await fetchWithRetry(flaky, "https://x/y", {}, undefined)).status).toBe(200);
    expect(n).toBe(2);

    const controller = new AbortController();
    controller.abort();
    const always = (async () => {
      throw new Error("aborted");
    }) as unknown as typeof fetch;
    await expect(
      fetchWithRetry(always, "https://x/y", { signal: controller.signal }, undefined),
    ).rejects.toThrow("aborted");
  });
});
