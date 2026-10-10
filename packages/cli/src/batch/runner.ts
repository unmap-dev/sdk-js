import { classify, outputValues, type GeocodeResult, type ReviewReason, type RowStatus } from "@unmap/geocoding";

/** Same ceiling as `POST /geocode/batch`. */
const GEOCODE_BATCH_MAX = 100;
import type { BatchCounts } from "./checkpoint";
import type { BatchOptions } from "./plan";

/**
 * The part of a batch run that is neither file system nor HTTP: pacing, retry policy, and the
 * ordering rule that makes a crash recoverable.
 *
 * Everything here takes its effects as parameters — `geocode`, `emit`, `checkpoint`, `sleep` —
 * so the whole policy is testable against a fake server with no sockets and no clock.
 */

/** One row on its way through the run. */
export interface BatchRow {
  index: number;
  /** The customer's original fields, carried through to the output untouched. */
  values: string[];
  /** The mapped address, trimmed. Empty means the row is ineligible. */
  query: string;
}

export interface RowOutcome {
  index: number;
  status: RowStatus;
  reasons: ReviewReason[];
  /** Ten values in OUTPUT_COLUMNS order. */
  columns: string[];
  /** Requests spent on this row, including retries. This is what maps to the bill. */
  requests: number;
  retries: number;
}

/** Why a run stopped, when it stopped early. */
export type StopReason =
  | { kind: "complete" }
  | { kind: "sample"; after: number }
  | { kind: "interrupted" }
  | { kind: "credentials"; message: string }
  | { kind: "budget"; message: string }
  | { kind: "row_failures"; message: string };

export interface GeocodeError {
  status: number;
  /** The gateway's machine-readable code, when it sent one. */
  code?: string;
  message: string;
  /** Seconds, from `Retry-After`. */
  retryAfter?: number;
}

export type GeocodeOutcome =
  | { ok: true; results: GeocodeResult[] }
  | { ok: false; error: GeocodeError };

export type BatchGeocodeOutcome =
  | { ok: true; results: GeocodeResult[][] }
  | { ok: false; error: GeocodeError };

export interface RunnerDeps {
  geocode(query: string, signal: AbortSignal): Promise<GeocodeOutcome>;
  /** When set, eligible rows go out in chunks of {@link GEOCODE_BATCH_MAX} instead of one GET each. */
  geocodeBatch?(queries: string[], signal: AbortSignal): Promise<BatchGeocodeOutcome>;
  /** Called with completed rows IN INPUT ORDER, never out of order and never twice. */
  emit(outcome: RowOutcome): Promise<void>;
  /** Called after `emit` has been made durable. Receives the last index committed. */
  checkpoint(through: number, counts: BatchCounts): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** True once the operator has asked to stop (Ctrl-C). Checked between rows. */
  stopRequested(): boolean;
}

/**
 * How often the checkpoint is rewritten: at least this many rows AND at least this long since
 * the last one.
 *
 * Every row would fsync a file per address; never would make a crash cost the whole run. What
 * the interval is really trying to bound is TIME, and a row count is only a proxy for it. The
 * proxy holds at the default pace of ten rows a second, where 200 rows is twenty seconds of
 * work. It breaks whenever the run is faster than that: against a warm cache or a local gateway,
 * 200 rows arrive in milliseconds and the row rule turns into a burst of fsyncs, each one
 * waiting on the disk. Measured on a 10,000-row local run, that was six seconds of pure fsync.
 *
 * So both, joined by AND, which means a crash costs whichever of the two is satisfied LAST --
 * not whichever came first. At the default ten rows a second that is the row rule, and the cost
 * is the ~200 rows a resume re-asks. On a run fast enough to break the proxy it is the 2-second
 * floor instead, and two seconds at that pace is many thousands of rows: that is the trade the
 * floor makes, and it is a trade in the unit the interval was always trying to bound. The floor
 * cannot make a slow run any riskier, because at ten rows a second the row rule is still the
 * binding one.
 */
export const CHECKPOINT_EVERY = 200;
export const CHECKPOINT_MIN_MS = 2000;

/**
 * Which HTTP outcomes are worth sending again.
 *
 * The distinction is whether the SAME request could succeed later. A 429 or a 5xx says the
 * server was busy or broken; a 400 says the request was wrong and will be wrong every time; a
 * 401 or 403 says the credentials are wrong, and hammering a bad key is how an account gets
 * blocked. Quota and spend-cap errors are also permanent within the run — the budget does not
 * come back in the next few seconds — so they stop the run rather than retry the row.
 */
export function classifyError(error: GeocodeError): "retry" | "row_failed" | "stop_credentials" | "stop_budget" {
  if (error.status === 401 || error.status === 403) {
    // 403 is also how an add-on gate answers. Either way the run cannot proceed as configured.
    return "stop_credentials";
  }
  if (error.code === "quota_exceeded" || error.code === "spend_cap" || error.code === "billing_required") {
    return "stop_budget";
  }
  if (error.status === 429) return "retry";
  if (error.status >= 500 || error.status === 408 || error.status === 0) return "retry";
  return "row_failed";
}

/**
 * Seconds from a `Retry-After` header, or undefined when the server did not send a usable one.
 *
 * It exists because `Headers.get` answers `null` for an absent header and `Number(null)` is 0,
 * so reading the header straight through a `Number()` made every error response look like
 * "retry immediately" and left the exponential backoff below unreachable. That is the same
 * empty-string-is-zero shape the coordinate parsers were fixed for: a plausible value where
 * there was no value at all.
 *
 * The HTTP-date form is deliberately not parsed. It arrives as NaN and falls through to the
 * exponential, which waits rather than not waiting — the safe direction to be wrong in.
 */
export function parseRetryAfter(raw: string | null | undefined): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Backoff before attempt `attempt` (1-based; attempt 1 never waits).
 *
 * `Retry-After` wins when the server sent one — it knows, and ignoring it is how a client turns
 * a busy server into a down one. Otherwise exponential from 500 ms, capped at 30 s, with jitter
 * so a concurrent batch does not resend every in-flight request in the same millisecond.
 */
export function backoffMs(attempt: number, retryAfter: number | undefined, random = Math.random): number {
  if (retryAfter != null && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, 60_000);
  }
  const base = Math.min(500 * 2 ** (attempt - 1), 30_000);
  return Math.round(base * (0.5 + random() * 0.5));
}

/**
 * A token bucket, so `rate` means requests per second on average rather than "in bursts of
 * `concurrency` whenever the server is fast".
 *
 * Rate and concurrency are separate controls because they bound different things. Concurrency
 * bounds how much work the server is doing for you at once; rate bounds how fast you ask.
 * Deriving one from the other gets it wrong in both directions: four in flight against a slow
 * endpoint is a trickle, and four in flight against a cached one is a flood.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = perSecond;
    this.last = now;
  }

  /** Milliseconds to wait before the next request may go out. 0 when one may go now. */
  take(now: number): number {
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.perSecond, this.tokens + elapsed * this.perSecond);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.perSecond) * 1000);
  }
}

export interface RunResult {
  stop: StopReason;
  counts: BatchCounts;
  /** Last input index whose output is durable. */
  committedThrough: number;
}

/**
 * Run the rows.
 *
 * Completion is out of order (that is what concurrency is for) but EMISSION is in order: a
 * finished row waits in `pending` until every row before it has been emitted. That is what makes
 * "truncate the output to the checkpointed byte length and carry on" a correct resume — the file
 * is always a prefix of the answer, never a prefix with holes.
 */
export async function runBatch(
  rows: AsyncIterable<BatchRow>,
  options: BatchOptions,
  deps: RunnerDeps,
  startCounts: BatchCounts,
): Promise<RunResult> {
  const counts: BatchCounts = { ...startCounts };
  const limiter = new RateLimiter(options.rate, deps.now());
  const controller = new AbortController();

  const pending = new Map<number, RowOutcome>();
  let nextToEmit = -1;
  let committedThrough = -1;
  let sinceCheckpoint = 0;
  let lastCheckpointAt = deps.now();
  let stop: StopReason = { kind: "complete" };
  let stopping = false;
  let attempted = 0;

  const inFlight = new Set<Promise<void>>();

  /** Emit every consecutive finished row starting at `nextToEmit`, then maybe checkpoint. */
  const drain = async () => {
    while (pending.has(nextToEmit)) {
      const outcome = pending.get(nextToEmit)!;
      pending.delete(nextToEmit);
      await deps.emit(outcome);
      committedThrough = outcome.index;
      nextToEmit++;
      sinceCheckpoint++;
    }
    if (
      sinceCheckpoint >= CHECKPOINT_EVERY &&
      deps.now() - lastCheckpointAt >= CHECKPOINT_MIN_MS &&
      committedThrough >= 0
    ) {
      await deps.checkpoint(committedThrough, counts);
      sinceCheckpoint = 0;
      lastCheckpointAt = deps.now();
    }
  };

  const record = (outcome: RowOutcome) => {
    counts.rows++;
    counts.requests += outcome.requests;
    counts.retries += outcome.retries;
    if (outcome.status === "matched") counts.matched++;
    else if (outcome.status === "review") counts.review++;
    else if (outcome.status === "no_match") counts.noMatch++;
    else if (outcome.status === "invalid") counts.invalid++;
    else if (outcome.status === "failed") counts.failed++;
    pending.set(outcome.index, outcome);
  };

  const runBatchChunk = async (chunk: BatchRow[]): Promise<void> => {
    let requests = 0;
    let retries = 0;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      if (attempt > 1) retries++;
      for (;;) {
        const wait = limiter.take(deps.now());
        if (wait === 0) break;
        await deps.sleep(wait);
      }

      requests++;
      const outcome = await deps.geocodeBatch!(
        chunk.map((row) => row.query),
        controller.signal,
      );

      if (outcome.ok) {
        chunk.forEach((row, i) => {
          const results = outcome.results[i] ?? [];
          const { status, reasons } = classify(results);
          record({
            index: row.index,
            status,
            reasons,
            columns: outputValues(status, reasons, results[0]),
            requests: i === 0 ? requests : 0,
            retries: i === 0 ? retries : 0,
          });
        });
        return;
      }

      const verdict = classifyError(outcome.error);
      if (verdict === "stop_credentials" || verdict === "stop_budget") {
        stopping = true;
        stop =
          verdict === "stop_credentials"
            ? { kind: "credentials", message: outcome.error.message }
            : { kind: "budget", message: outcome.error.message };
        controller.abort();
        counts.requests += requests;
        counts.retries += retries;
        return;
      }
      if (verdict === "row_failed" || attempt === options.maxAttempts) {
        for (const row of chunk) {
          record({
            index: row.index,
            status: "failed",
            reasons: ["invalid_input"],
            columns: outputValues("failed", [], undefined),
            requests: 0,
            retries: 0,
          });
        }
        counts.requests += requests;
        counts.retries += retries;
        return;
      }
      await deps.sleep(backoffMs(attempt, outcome.error.retryAfter));
    }
  };

  const runRow = async (row: BatchRow): Promise<void> => {
    let requests = 0;
    let retries = 0;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      if (attempt > 1) retries++;

      // Pace, then go. The wait is inside the per-row task so concurrency and rate compose:
      // `concurrency` tasks queue at the bucket and leave it one at a time.
      for (;;) {
        const wait = limiter.take(deps.now());
        if (wait === 0) break;
        await deps.sleep(wait);
      }

      requests++;
      const outcome = await deps.geocode(row.query, controller.signal);

      if (outcome.ok) {
        const { status, reasons } = classify(outcome.results);
        record({
          index: row.index,
          status,
          reasons,
          columns: outputValues(status, reasons, outcome.results[0]),
          requests,
          retries,
        });
        return;
      }

      const verdict = classifyError(outcome.error);
      if (verdict === "stop_credentials" || verdict === "stop_budget") {
        // The row is NOT written as failed: it was never answered, and the run is stopping, so
        // it is unprocessed like every row behind it. Writing it as failed would tell the
        // customer their address is bad when their account is.
        stopping = true;
        stop =
          verdict === "stop_credentials"
            ? { kind: "credentials", message: outcome.error.message }
            : { kind: "budget", message: outcome.error.message };
        controller.abort();
        counts.requests += requests;
        counts.retries += retries;
        return;
      }
      if (verdict === "row_failed" || attempt === options.maxAttempts) {
        record({
          index: row.index,
          status: "failed",
          reasons: ["invalid_input"],
          columns: outputValues("failed", [], undefined),
          requests,
          retries,
        });
        return;
      }
      await deps.sleep(backoffMs(attempt, outcome.error.retryAfter));
    }
  };

  const batchBuffer: BatchRow[] = [];

  const flushBatch = async () => {
    if (batchBuffer.length === 0) return;
    const chunk = batchBuffer.splice(0, batchBuffer.length);
    const task = runBatchChunk(chunk).finally(() => inFlight.delete(task));
    inFlight.add(task);
    if (inFlight.size >= options.concurrency) await Promise.race(inFlight);
    await drain();
  };

  for await (const row of rows) {
    if (nextToEmit < 0) nextToEmit = row.index;
    if (stopping) break;
    if (deps.stopRequested()) {
      stop = { kind: "interrupted" };
      break;
    }

    if (row.query === "") {
      // Never a request, never a charge, never silently dropped: it gets its own row in the
      // output saying why.
      record({
        index: row.index,
        status: "invalid",
        reasons: ["invalid_input"],
        columns: outputValues("invalid", ["invalid_input"], undefined),
        requests: 0,
        retries: 0,
      });
      await drain();
      continue;
    }

    if (options.sample != null && attempted >= options.sample) {
      stop = { kind: "sample", after: attempted };
      break;
    }
    attempted++;

    if (deps.geocodeBatch) {
      batchBuffer.push(row);
      if (batchBuffer.length >= GEOCODE_BATCH_MAX || (options.sample != null && attempted >= options.sample)) {
        await flushBatch();
      }
      continue;
    }

    const task = runRow(row).finally(() => inFlight.delete(task));
    inFlight.add(task);
    if (inFlight.size >= options.concurrency) await Promise.race(inFlight);
    await drain();
  }

  if (!stopping && !deps.stopRequested() && deps.geocodeBatch) {
    await flushBatch();
  }

  await Promise.allSettled([...inFlight]);
  await drain();
  if (committedThrough >= 0) await deps.checkpoint(committedThrough, counts);

  return { stop, counts, committedThrough };
}
