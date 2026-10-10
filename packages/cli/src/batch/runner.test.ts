import { describe, it, expect } from "vitest";
import type { GeocodeResult } from "@unmap/geocoding";
import {
  CHECKPOINT_EVERY,
  CHECKPOINT_MIN_MS,
  RateLimiter,
  backoffMs,
  classifyError,
  parseRetryAfter,
  runBatch,
  type BatchRow,
  type GeocodeOutcome,
  type RowOutcome,
} from "./runner";
import { EMPTY_COUNTS, type BatchCounts } from "./checkpoint";
import { DEFAULT_OPTIONS, type BatchOptions } from "./plan";

const hit = (id: string, over: Partial<GeocodeResult> = {}): GeocodeResult => ({
  id,
  name: `result ${id}`,
  layer: "address",
  lng: -114,
  lat: 51,
  score: 100,
  source: "openaddresses",
  match_type: "exact",
  precision: "point",
  ...over,
});

/** A fake run: a scripted server, a virtual clock, and a record of what was emitted. */
function harness(
  script: (query: string, attempt: number) => GeocodeOutcome,
  options: Partial<BatchOptions> = {},
) {
  const emitted: RowOutcome[] = [];
  const checkpoints: Array<{ through: number; counts: BatchCounts }> = [];
  const attempts = new Map<string, number>();
  let clock = 0;
  let stop = false;
  let inFlight = 0;
  let peakInFlight = 0;

  const deps = {
    async geocode(query: string): Promise<GeocodeOutcome> {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      const n = (attempts.get(query) ?? 0) + 1;
      attempts.set(query, n);
      // Yield so concurrent tasks really do overlap.
      await Promise.resolve();
      inFlight--;
      return script(query, n);
    },
    async emit(o: RowOutcome) {
      emitted.push(o);
    },
    async checkpoint(through: number, counts: BatchCounts) {
      checkpoints.push({ through, counts: { ...counts } });
    },
    async sleep(ms: number) {
      clock += ms;
    },
    // Advanced by `sleep`, and by `tick()` below for tests about the checkpoint time floor,
    // which has to be exercised WITHOUT a sleep: the whole case it exists for is a run fast
    // enough that nothing ever sleeps.
    now: () => clock,
    stopRequested: () => stop,
  };

  return {
    deps,
    emitted,
    checkpoints,
    attempts,
    requestStop: () => {
      stop = true;
    },
    tick: (ms: number) => {
      clock += ms;
    },
    get peakInFlight() {
      return peakInFlight;
    },
    options: { ...DEFAULT_OPTIONS, rate: 1e6, ...options } as BatchOptions,
  };
}

async function* rowsOf(queries: string[], start = 1): AsyncIterable<BatchRow> {
  for (let i = 0; i < queries.length; i++) {
    yield { index: start + i, values: [queries[i]!], query: queries[i]! };
  }
}

describe("classifyError", () => {
  it("retries what could succeed later", () => {
    expect(classifyError({ status: 429, message: "" })).toBe("retry");
    expect(classifyError({ status: 500, message: "" })).toBe("retry");
    expect(classifyError({ status: 503, message: "" })).toBe("retry");
    expect(classifyError({ status: 0, message: "network" })).toBe("retry");
  });

  it("never retries credentials, because hammering a bad key gets an account blocked", () => {
    expect(classifyError({ status: 401, message: "" })).toBe("stop_credentials");
    expect(classifyError({ status: 403, message: "" })).toBe("stop_credentials");
  });

  it("stops rather than retries when the budget is gone", () => {
    for (const code of ["quota_exceeded", "spend_cap", "billing_required"]) {
      expect(classifyError({ status: 429, code, message: "" })).toBe("stop_budget");
    }
  });

  it("fails the row, not the run, on a bad request", () => {
    expect(classifyError({ status: 400, message: "" })).toBe("row_failed");
  });
});

describe("parseRetryAfter", () => {
  it("reads the seconds form the gateway sends", () => {
    expect(parseRetryAfter("60")).toBe(60);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("treats an absent or blank header as no header, not as zero", () => {
    // `Headers.get` answers null when the header is not there and `Number(null)` is 0, which
    // would say "retry immediately" for every 429 and 5xx that carries no Retry-After — i.e.
    // for all of them except our own rate limiter — and make the exponential unreachable.
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("   ")).toBeUndefined();
    expect(backoffMs(1, parseRetryAfter(null), () => 1)).toBe(500);
  });

  it("falls through to the exponential on the HTTP-date form rather than to no wait", () => {
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
    expect(parseRetryAfter("-5")).toBeUndefined();
  });
});

describe("backoffMs", () => {
  it("obeys Retry-After when the server sent one", () => {
    expect(backoffMs(1, 60)).toBe(60_000);
    expect(backoffMs(3, 5)).toBe(5000);
  });

  it("caps an absurd Retry-After rather than sleeping for an hour", () => {
    expect(backoffMs(1, 86_400)).toBe(60_000);
  });

  it("grows and then caps without one", () => {
    expect(backoffMs(1, undefined, () => 1)).toBe(500);
    expect(backoffMs(2, undefined, () => 1)).toBe(1000);
    expect(backoffMs(9, undefined, () => 1)).toBe(30_000);
  });

  it("jitters, so concurrent retries do not resend in lockstep", () => {
    expect(backoffMs(4, undefined, () => 0)).toBe(2000);
    expect(backoffMs(4, undefined, () => 1)).toBe(4000);
  });
});

describe("RateLimiter", () => {
  it("lets a full bucket through and then meters", () => {
    const rl = new RateLimiter(2, 0);
    expect(rl.take(0)).toBe(0);
    expect(rl.take(0)).toBe(0);
    expect(rl.take(0)).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    const rl = new RateLimiter(2, 0);
    rl.take(0);
    rl.take(0);
    expect(rl.take(1000)).toBe(0);
  });

  it("never banks more than one second of tokens", () => {
    const rl = new RateLimiter(2, 0);
    rl.take(60_000);
    rl.take(60_000);
    expect(rl.take(60_000)).toBeGreaterThan(0);
  });
});

describe("runBatch", () => {
  it("emits one record per row, in input order, even at concurrency", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { concurrency: 8 });
    const result = await runBatch(rowsOf(["a", "b", "c", "d", "e"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(h.emitted.map((o) => o.index)).toEqual([1, 2, 3, 4, 5]);
    expect(result.counts.rows).toBe(5);
    expect(result.stop).toEqual({ kind: "complete" });
  });

  it("honours the concurrency cap", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { concurrency: 3 });
    await runBatch(rowsOf(Array.from({ length: 20 }, (_, i) => `q${i}`)), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(h.peakInFlight).toBeLessThanOrEqual(3);
  });

  it("writes an ineligible row without spending a request", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }));
    const result = await runBatch(
      (async function* () {
        yield { index: 1, values: [""], query: "" };
        yield { index: 2, values: ["a"], query: "a" };
      })(),
      h.options,
      h.deps,
      { ...EMPTY_COUNTS },
    );
    expect(h.emitted[0]?.status).toBe("invalid");
    expect(h.emitted[0]?.requests).toBe(0);
    expect(result.counts.invalid).toBe(1);
    expect(result.counts.requests).toBe(1);
  });

  it("retries a transient failure and counts the retry separately from the row", async () => {
    const h = harness((_q, attempt) =>
      attempt < 3 ? { ok: false, error: { status: 503, message: "busy" } } : { ok: true, results: [hit("x")] },
    );
    const result = await runBatch(rowsOf(["a"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(result.counts.rows).toBe(1);
    expect(result.counts.requests).toBe(3);
    expect(result.counts.retries).toBe(2);
    expect(h.emitted[0]?.status).toBe("matched");
  });

  it("gives up on a row after maxAttempts and marks it failed, not matched", async () => {
    const h = harness(() => ({ ok: false, error: { status: 503, message: "busy" } }), { maxAttempts: 3 });
    const result = await runBatch(rowsOf(["a"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(h.emitted[0]?.status).toBe("failed");
    expect(result.counts.requests).toBe(3);
    expect(result.counts.failed).toBe(1);
  });

  it("does not retry a bad request", async () => {
    const h = harness(() => ({ ok: false, error: { status: 400, message: "q required" } }));
    await runBatch(rowsOf(["a"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(h.attempts.get("a")).toBe(1);
    expect(h.emitted[0]?.status).toBe("failed");
  });

  it("stops the whole run on bad credentials without marking the row as a bad address", async () => {
    const h = harness(() => ({ ok: false, error: { status: 401, message: "invalid key" } }));
    const result = await runBatch(rowsOf(["a", "b", "c"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(result.stop.kind).toBe("credentials");
    // Nothing is written as failed: the address was never the problem.
    expect(h.emitted).toEqual([]);
    expect(result.counts.failed).toBe(0);
  });

  it("stops on an exhausted budget rather than retrying into it", async () => {
    const h = harness(() => ({
      ok: false,
      error: { status: 429, code: "quota_exceeded", message: "over quota", retryAfter: 3600 },
    }));
    const result = await runBatch(rowsOf(["a", "b"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(result.stop.kind).toBe("budget");
    expect(h.attempts.get("a")).toBe(1);
  });

  it("stops after the sample size, and says so", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { sample: 2 });
    const result = await runBatch(rowsOf(["a", "b", "c", "d"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(result.stop).toEqual({ kind: "sample", after: 2 });
    expect(result.counts.rows).toBe(2);
  });

  it("stops between rows when the operator asks", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { concurrency: 1 });
    let n = 0;
    const rows = (async function* () {
      for (const q of ["a", "b", "c", "d"]) {
        if (++n === 3) h.requestStop();
        yield { index: n, values: [q], query: q };
      }
    })();
    const result = await runBatch(rows, h.options, h.deps, { ...EMPTY_COUNTS });
    expect(result.stop).toEqual({ kind: "interrupted" });
    expect(result.counts.rows).toBeLessThan(4);
  });

  it("checkpoints only rows it has already emitted", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { concurrency: 4 });
    const result = await runBatch(rowsOf(["a", "b", "c"]), h.options, h.deps, { ...EMPTY_COUNTS });
    const last = h.checkpoints.at(-1)!;
    expect(last.through).toBe(result.committedThrough);
    expect(last.through).toBe(h.emitted.at(-1)!.index);
  });

  it("does not fsync in a burst when rows arrive faster than the time floor", async () => {
    // The case the floor exists for: a local gateway or a warm cache answers 1,000 rows in
    // milliseconds, and the row rule alone would checkpoint five times in that instant, each one
    // waiting on the disk. With no time passing, only the unconditional final checkpoint runs.
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { concurrency: 4 });
    const queries = Array.from({ length: CHECKPOINT_EVERY * 5 }, (_, i) => `q${i}`);
    await runBatch(rowsOf(queries), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(h.checkpoints).toHaveLength(1);
  });

  it("still checkpoints during a long run, once both rules are satisfied", async () => {
    // And the case the floor must not break: a run slow enough that real time passes still gets
    // its intermediate checkpoints, so a crash costs a bounded amount of work.
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { concurrency: 1 });
    let n = 0;
    const rows = (async function* () {
      for (const q of Array.from({ length: CHECKPOINT_EVERY * 3 }, (_, i) => `q${i}`)) {
        // Enough time per row that the floor is cleared well before the row count is.
        h.tick(CHECKPOINT_MIN_MS / 10);
        yield { index: ++n, values: [q], query: q };
      }
    })();
    await runBatch(rows, h.options, h.deps, { ...EMPTY_COUNTS });
    expect(h.checkpoints.length).toBeGreaterThan(1);
  });

  it("never checkpoints a row it has not emitted, whichever rule fired", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }), { concurrency: 4 });
    const queries = Array.from({ length: CHECKPOINT_EVERY * 2 }, (_, i) => `q${i}`);
    await runBatch(rowsOf(queries), h.options, h.deps, { ...EMPTY_COUNTS });
    const highestEmitted = h.emitted.at(-1)!.index;
    for (const c of h.checkpoints) expect(c.through).toBeLessThanOrEqual(highestEmitted);
  });

  it("carries counts forward from a resumed run", async () => {
    const h = harness(() => ({ ok: true, results: [hit("x")] }));
    const result = await runBatch(rowsOf(["c"], 3), h.options, h.deps, {
      ...EMPTY_COUNTS,
      rows: 2,
      requests: 2,
      matched: 2,
    });
    expect(result.counts.rows).toBe(3);
    expect(result.counts.matched).toBe(3);
    expect(result.committedThrough).toBe(3);
  });

  it("routes a fallback to review and an empty answer to no_match", async () => {
    const h = harness((q) =>
      q === "fallback"
        ? {
            ok: true,
            results: [hit("s", { layer: "street", match_type: "fallback", match_reasons: ["housenumber_not_matched"] })],
          }
        : { ok: true, results: [] },
    );
    const result = await runBatch(rowsOf(["fallback", "nothing"]), h.options, h.deps, { ...EMPTY_COUNTS });
    expect(h.emitted[0]?.status).toBe("review");
    expect(h.emitted[0]?.reasons).toContain("fallback_match");
    expect(h.emitted[1]?.status).toBe("no_match");
    expect(result.counts.review).toBe(1);
    expect(result.counts.noMatch).toBe(1);
  });
});
