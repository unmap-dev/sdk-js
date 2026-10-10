import { createReadStream } from "node:fs";
import { open, rename, readFile, stat, truncate, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { DEFAULT_GATEWAY } from "@unmap/core";
import {
  CsvParser,
  alignRow,
  encodeRow,
  resolveOutputHeader,
  type GeocodeResult,
} from "@unmap/geocoding";
import {
  checkpointCompatible,
  newCheckpoint,
  serializeCheckpoint,
  EMPTY_COUNTS,
  type BatchCounts,
  type Checkpoint,
} from "./batch/checkpoint";
import {
  BATCH_SCHEMA_VERSION,
  DEFAULT_OPTIONS,
  columnIndex,
  estimate,
  inputFingerprint,
  mappingFingerprint,
  validateMapping,
  type BatchMapping,
  type BatchOptions,
} from "./batch/plan";
import { parseRetryAfter, runBatch, type BatchRow, type GeocodeOutcome, type RowOutcome } from "./batch/runner";

/**
 * `unmap geocode csv` — geocode a CSV on this machine.
 *
 * What stays local and what does not, stated once here and printed to the operator before the
 * first request: the FILE never leaves this machine, and neither do the columns that were not
 * mapped. The mapped address column is sent to the unmap API in chunks of 100 via
 * `POST /geocode/batch`. The output and the checkpoint are written next to the input
 * and can contain addresses; neither is ever uploaded anywhere.
 *
 * The API key is read from `--key`, `UNMAP_KEY`, or `unmap.config.json`, and is never written to
 * the output, the review file, the checkpoint, or any log line.
 */

export interface GeocodeCsvArgs {
  input: string;
  queryColumn: string;
  output: string;
  reviewOutput?: string;
  checkpoint?: string;
  key?: string;
  gateway?: string;
  options: BatchOptions;
  /** Count and validate without sending anything. */
  estimateOnly: boolean;
  /** Replace an existing output instead of refusing. */
  overwrite: boolean;
  resume: boolean;
}

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

const enc = new TextEncoder();
const byteLength = (s: string) => enc.encode(s).length;

/** Resolve the key without ever putting it in a message. */
export async function resolveKey(explicit: string | undefined, cwd: string): Promise<string | undefined> {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.UNMAP_KEY?.trim()) return process.env.UNMAP_KEY.trim();
  try {
    const raw = await readFile(join(cwd, "unmap.config.json"), "utf8");
    const parsed = JSON.parse(raw) as { key?: unknown };
    return typeof parsed.key === "string" && parsed.key.trim() ? parsed.key.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the header and stream data rows.
 *
 * `start` skips rows already committed on a resume. They are still PARSED — a CSV cannot be
 * seeked into, because a quoted field may contain newlines and there is no way to know where a
 * record begins without reading from the front — but they are not yielded and not sent.
 */
async function* readRows(
  path: string,
  queryColumn: string,
  start: number,
  onHeader: (header: string[]) => void,
  onProblem: (message: string) => void,
): AsyncIterable<BatchRow> {
  const parser = new CsvParser();
  const decoder = new TextDecoder("utf-8");
  let header: string[] | undefined;
  let queryIdx = -1;
  let index = 0;

  const handle = (raw: string[]): BatchRow | undefined => {
    if (!header) {
      header = raw.map((h) => h.trim());
      queryIdx = columnIndex(header, queryColumn);
      onHeader(header);
      return undefined;
    }
    index++;
    const { record, problem } = alignRow(header, raw, index);
    if (problem) onProblem(problem.message);
    if (index <= start) return undefined;
    return { index, values: record.values, query: (record.values[queryIdx] ?? "").trim() };
  };

  for await (const chunk of createReadStream(path)) {
    for (const raw of parser.write(decoder.decode(chunk as Buffer, { stream: true }))) {
      const row = handle(raw);
      if (row) yield row;
    }
  }
  for (const raw of [...parser.write(decoder.decode()), ...parser.end()]) {
    const row = handle(raw);
    if (row) yield row;
  }
  if (parser.unterminated) {
    onProblem("the file ends inside a quoted field; the last row may be truncated");
  }
}

/**
 * An append-only text file that knows how many DURABLE bytes it holds.
 *
 * Buffered, because a row is a line and a line is not a syscall's worth of work: writing each one
 * straight through cost 10,000 `write()` calls on a 10,000-row file, for no benefit that survives
 * a crash anyway.
 *
 * `bytes` counts only what has been handed to the file, never what is sitting in the buffer, and
 * that is the property the whole recovery story rests on. The checkpoint records `bytes` after
 * `sync()`, which flushes first, so the number it stores is always bytes the kernel has. A crash
 * with a full buffer loses those rows, and they were not checkpointed either, so a resume
 * truncates to the last recorded offset and redoes them. Same contract as before; fewer syscalls.
 */
const WRITE_BUFFER_BYTES = 64 * 1024;

class CountingWriter {
  private buffer: string[] = [];
  private buffered = 0;

  private constructor(
    private readonly handle: Awaited<ReturnType<typeof open>>,
    public bytes: number,
  ) {}

  static async open(path: string, startBytes: number): Promise<CountingWriter> {
    // Truncate FIRST, then append. On a resume this is what discards rows the checkpoint does
    // not know about, so the file is always a prefix of the answer and never a prefix with holes.
    await truncate(path, startBytes).catch(() => {});
    const handle = await open(path, "a");
    return new CountingWriter(handle, startBytes);
  }

  async write(text: string): Promise<void> {
    this.buffer.push(text);
    this.buffered += byteLength(text);
    if (this.buffered >= WRITE_BUFFER_BYTES) await this.flush();
  }

  /** Hand the buffer to the file. `bytes` only moves here. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const text = this.buffer.join("");
    this.buffer = [];
    this.buffered = 0;
    await this.handle.write(text);
    this.bytes += byteLength(text);
  }

  /** Make everything written so far survive a power cut, before the checkpoint claims it has. */
  async sync(): Promise<void> {
    await this.flush();
    await this.handle.sync();
  }

  async close(): Promise<void> {
    // Flush before closing, or a completed run loses its tail. A crash still loses the buffer,
    // which is correct: those rows were never checkpointed.
    await this.flush().catch(() => {});
    await this.handle.close();
  }
}

/** Write the checkpoint atomically: a half-written one is worse than none. */
async function writeCheckpoint(path: string, cp: Checkpoint): Promise<void> {
  const tmp = join(dirname(path), `.${basename(path)}.tmp`);
  const handle = await open(tmp, "w");
  try {
    await handle.write(serializeCheckpoint(cp));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function runGeocodeCsv(args: GeocodeCsvArgs, io: Io): Promise<number> {
  const input = resolve(args.input);
  const output = resolve(args.output);
  const reviewPath = args.reviewOutput ? resolve(args.reviewOutput) : undefined;
  const checkpointPath = resolve(args.checkpoint ?? `${args.output}.checkpoint.json`);

  if (!(await exists(input))) {
    io.err(`error: no such file: ${args.input}`);
    return 1;
  }
  // Writing the output over the input destroys the source of truth mid-run, and there is no
  // reading of the request that makes it what someone meant.
  if (output === input || reviewPath === input) {
    io.err("error: the output would overwrite the input file");
    return 1;
  }
  // Two writers on one path is worse than an error, because it does not look like one: the two
  // CountingWriters interleave lines, their byte counts diverge from the file, and the
  // checkpoint records offsets that no longer mean anything, so the resume is broken too.
  if (reviewPath && reviewPath === output) {
    io.err("error: --review-output and --output are the same file");
    return 1;
  }
  if (checkpointPath === output || checkpointPath === reviewPath || checkpointPath === input) {
    io.err("error: --checkpoint points at the input or an output file");
    return 1;
  }

  const stats = await stat(input);
  const mapping: BatchMapping = { queryColumn: args.queryColumn };
  const inputFp = inputFingerprint(stats.size, stats.mtimeMs);
  const mappingFp = mappingFingerprint(mapping, args.options);

  // --- resume, or refuse to ------------------------------------------------------------
  let checkpoint: Checkpoint = newCheckpoint(inputFp, mappingFp);
  let resuming = false;
  if (await exists(checkpointPath)) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(checkpointPath, "utf8"));
    } catch {
      raw = null;
    }
    const verdict = checkpointCompatible(raw, { input: inputFp, mapping: mappingFp });
    if (!verdict.ok) {
      io.err(`error: cannot resume: ${verdict.reason}`);
      io.err(`Delete ${args.checkpoint ?? `${args.output}.checkpoint.json`} to start over.`);
      return 1;
    }
    if (!args.resume) {
      io.err(`error: a checkpoint for this run already exists at ${checkpointPath}`);
      io.err("Pass --resume to continue it, or delete it to start over.");
      return 1;
    }
    checkpoint = verdict.checkpoint;
    resuming = true;
  } else if ((await exists(output)) && !args.overwrite && !args.estimateOnly) {
    io.err(`error: ${args.output} already exists. Pass --overwrite to replace it.`);
    return 1;
  }

  // --- header and mapping, before anything is sent -------------------------------------
  let header: string[] | undefined;
  const problems: string[] = [];
  const noteProblem = (m: string) => {
    if (problems.length < 20) problems.push(m);
  };

  if (args.estimateOnly) {
    let rows = 0;
    let eligible = 0;
    for await (const row of readRows(input, args.queryColumn, 0, (h) => (header = h), noteProblem)) {
      rows++;
      if (row.query !== "") eligible++;
    }
    if (!header) {
      io.err("error: the file is empty");
      return 1;
    }
    const mappingProblems = validateMapping(header, mapping);
    for (const p of mappingProblems) io.err(`error: ${p.message}`);
    if (mappingProblems.length) return 1;

    const e = estimate(rows, eligible, args.options);
    io.out(`${e.rows} rows, ${e.eligible} with an address, ${e.ineligible} without.`);
    io.out(`${e.requests} requests if nothing retries; up to ${e.maxRequests} if every request uses all ${args.options.maxAttempts} attempts.`);
    io.out("Each request geocodes up to 100 addresses. Every successful address is one billed call. Retries are billed.");
    // The CLI authenticates with an API key, and the usage API is a dashboard session endpoint,
    // so there is nothing to read here. Saying "unknown" beats printing a number we cannot see.
    io.out("Remaining allowance: unknown from the CLI. Check the dashboard at unmap.dev/dashboard/usage.");
    for (const p of problems) io.err(`warning: ${p}`);
    return 0;
  }

  const key = await resolveKey(args.key, process.cwd());
  if (!key) {
    io.err("error: no API key. Pass --key, set UNMAP_KEY, or run this in a directory with unmap.config.json.");
    return 1;
  }
  const gateway = (args.gateway?.trim() || DEFAULT_GATEWAY).replace(/\/+$/, "");

  // --- open the outputs, reconciled against the checkpoint -----------------------------
  const out = await CountingWriter.open(output, resuming ? checkpoint.outputBytes : 0);
  const review = reviewPath
    ? await CountingWriter.open(reviewPath, resuming ? checkpoint.reviewBytes : 0)
    : undefined;

  let outHeader: string[] = [];
  let renamedNote: string | undefined;

  const counts: BatchCounts = resuming ? { ...checkpoint.counts } : { ...EMPTY_COUNTS };
  const controller = new AbortController();
  let stopRequested = false;
  const onSignal = () => {
    if (stopRequested) return;
    stopRequested = true;
    io.err("\nStopping after the rows already in flight. Re-run with --resume to continue.");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const readError = async (res: Response) => {
    let body: { error?: unknown; code?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* a non-JSON error body is still an error */
    }
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    return {
      status: res.status,
      code: typeof body.code === "string" ? body.code : undefined,
      message: typeof body.error === "string" ? body.error : `HTTP ${res.status}`,
      ...(retryAfter != null ? { retryAfter } : {}),
    };
  };

  const geocode = async (query: string, signal: AbortSignal): Promise<GeocodeOutcome> => {
    const url = new URL(`${gateway}/geocode/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "2"); // 2, so the ambiguity check has a runner-up to compare.
    if (args.options.lang) url.searchParams.set("lang", args.options.lang);
    url.searchParams.set("key", key);
    try {
      const res = await fetch(url, { signal, headers: { accept: "application/json" } });
      if (!res.ok) return { ok: false, error: await readError(res) };
      const parsed = (await res.json()) as GeocodeResult[] | { results?: GeocodeResult[] };
      return { ok: true, results: Array.isArray(parsed) ? parsed : (parsed.results ?? []) };
    } catch (cause) {
      // status 0 means "never reached the server": retryable, and never a row's own fault.
      return { ok: false, error: { status: 0, message: cause instanceof Error ? cause.message : "network error" } };
    }
  };

  const geocodeBatch = async (queries: string[], signal: AbortSignal) => {
    try {
      const res = await fetch(`${gateway}/geocode/batch?key=${encodeURIComponent(key)}`, {
        method: "POST",
        signal,
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          queries,
          limit: 2,
          ...(args.options.lang ? { lang: args.options.lang } : {}),
        }),
      });
      if (!res.ok) return { ok: false as const, error: await readError(res) };
      const parsed = (await res.json()) as GeocodeResult[][];
      if (!Array.isArray(parsed) || parsed.length !== queries.length) {
        return { ok: false as const, error: { status: res.status, message: "batch response was not aligned" } };
      }
      return { ok: true as const, results: parsed };
    } catch (cause) {
      return { ok: false as const, error: { status: 0, message: cause instanceof Error ? cause.message : "network error" } };
    }
  };

  // The runner does not carry the customer's fields — it has no reason to know about them — so
  // they wait here, keyed by row index, until that row is emitted. Emission is in order and each
  // entry is dropped as it is used, so this holds the in-flight window, not the file.
  const originals = new Map<number, string[]>();

  const emit = async (outcome: RowOutcome) => {
    const values = originals.get(outcome.index) ?? [];
    originals.delete(outcome.index);
    const line = encodeRow([...values, ...outcome.columns], {
      spreadsheetSafe: args.options.spreadsheetSafe,
    });
    await out.write(line);
    if (review && outcome.status !== "matched") await review.write(line);
  };

  const persist = async (through: number, c: BatchCounts) => {
    // Order matters and is the whole recovery story: durable bytes first, then the record that
    // claims them. See batch/checkpoint.ts.
    await out.sync();
    await review?.sync();
    await writeCheckpoint(checkpointPath, {
      ...checkpoint,
      schema: BATCH_SCHEMA_VERSION,
      committedThrough: through,
      outputBytes: out.bytes,
      reviewBytes: review?.bytes ?? 0,
      counts: c,
      updatedAt: new Date().toISOString(),
    });
  };

  const rows = (async function* () {
    for await (const row of readRows(
      input,
      args.queryColumn,
      checkpoint.committedThrough,
      (h) => {
        header = h;
        const resolved = resolveOutputHeader(h);
        outHeader = resolved.header;
        if (resolved.renamed.length) {
          renamedNote = resolved.renamed.map((r) => `${r.column} -> ${r.to}`).join(", ");
        }
      },
      noteProblem,
    )) {
      originals.set(row.index, row.values);
      yield row;
    }
  })();

  try {
    // Peek one row so the header exists before anything is written, and so a bad mapping is
    // caught before the first request rather than after the file is a thousand rows long.
    const iterator = rows[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (!header) {
      io.err("error: the file is empty");
      return 1;
    }
    const mappingProblems = validateMapping(header, mapping);
    for (const p of mappingProblems) io.err(`error: ${p.message}`);
    if (mappingProblems.length) return 1;
    if (renamedNote) io.err(`warning: output column collision, renamed: ${renamedNote}`);

    if (!resuming) {
      const headerLine = encodeRow(outHeader);
      await out.write(headerLine);
      await review?.write(headerLine);
    }

    io.out(`Geocoding ${basename(input)} column "${args.queryColumn}" against ${gateway}.`);
    io.out("Only that column is sent. The file stays on this machine.");
    if (resuming) io.out(`Resuming after row ${checkpoint.committedThrough}.`);
    if (args.options.sample != null) io.out(`Sample run: stopping after ${args.options.sample} rows. This uses requests.`);

    const replay = (async function* () {
      if (!first.done && first.value) yield first.value;
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      }
    })();

    const result = await runBatch(replay, args.options, {
      geocode,
      geocodeBatch,
      emit,
      checkpoint: persist,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      stopRequested: () => stopRequested,
    }, counts);

    const c = result.counts;
    io.out("");
    io.out(`rows written      ${c.rows}`);
    io.out(`  matched         ${c.matched}`);
    io.out(`  needs review    ${c.review}`);
    io.out(`  no match        ${c.noMatch}`);
    io.out(`  invalid input   ${c.invalid}`);
    io.out(`  failed          ${c.failed}`);
    io.out(`requests sent     ${c.requests}  (${c.retries} of them retries; every one is billed)`);
    io.out(`output            ${args.output}`);
    if (reviewPath) io.out(`review            ${args.reviewOutput}`);

    switch (result.stop.kind) {
      case "complete":
        io.out("");
        io.out(`Done. Delete ${checkpointPath} when you no longer need to resume.`);
        return 0;
      case "sample":
        io.out("");
        io.out(`Sample of ${result.stop.after} rows complete. Re-run with --resume (and no --sample) to finish.`);
        return 0;
      case "interrupted":
        io.err("");
        io.err("Interrupted. Re-run the same command with --resume to continue.");
        return 130;
      case "credentials":
        io.err("");
        io.err(`error: ${result.stop.message}`);
        io.err("The run stopped without marking any address as bad. Fix the key and re-run with --resume.");
        return 1;
      case "budget":
        io.err("");
        io.err(`error: ${result.stop.message}`);
        io.err("The run stopped rather than retrying into an exhausted budget. Re-run with --resume once it lifts.");
        return 1;
      default:
        return 1;
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    controller.abort();
    await out.close().catch(() => {});
    await review?.close().catch(() => {});
    for (const p of problems) io.err(`warning: ${p}`);
  }
}

/** Remove a checkpoint, used by `--clean`. Missing is success. */
export async function removeCheckpoint(path: string): Promise<void> {
  await unlink(path).catch(() => {});
}
