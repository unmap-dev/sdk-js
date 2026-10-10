import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { runGeocodeCsv, resolveKey } from "./geocode";
import { DEFAULT_OPTIONS } from "./batch/plan";
import { checkpointCompatible } from "./batch/checkpoint";

/**
 * End-to-end over real files against a controlled test server: the parts a unit test cannot
 * reach are the ones that matter here — bytes on disk, and whether an interrupted run resumes
 * into a file identical to one that was never interrupted.
 */
let dir: string;
let server: Server;
let gateway: string;
let served = 0;
let behaviour: (q: string, n: number) => { status: number; body: unknown; headers?: Record<string, string> };

const ok = (name: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: [
    {
      id: `id-${name}`,
      name,
      layer: "address",
      lng: -114.073,
      lat: 51.036,
      score: 100,
      source: "openaddresses",
      match_type: "exact",
      precision: "point",
      ...extra,
    },
  ],
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "unmap-batch-"));
  served = 0;
  behaviour = (q) => ok(q);
  server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const reply = (r: { status: number; body: unknown; headers?: Record<string, string> }) => {
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body));
    };

    if (req.method === "POST" && url.pathname === "/geocode/batch") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        served++;
        let body: { queries?: unknown } = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { queries?: unknown };
        } catch {
          /* a malformed body is still an error the behaviour can answer */
        }
        const queries = Array.isArray(body.queries) ? body.queries : [];
        const first = typeof queries[0] === "string" ? queries[0] : "";
        const r = behaviour(first, served);
        if (r.status !== 200) {
          reply(r);
          return;
        }
        reply({
          status: 200,
          body: queries.map((q) => {
            const item = behaviour(typeof q === "string" ? q : "", served);
            return Array.isArray(item.body) ? item.body : [];
          }),
        });
      });
      return;
    }

    served++;
    const q = url.searchParams.get("q") ?? "";
    const r = behaviour(q, served);
    reply(r);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  gateway = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out: (l: string) => out.push(l), err: (l: string) => err.push(l), lines: out, errors: err };
};

const write = async (name: string, text: string) => {
  const path = join(dir, name);
  await writeFile(path, text, "utf8");
  return path;
};

const run = (over: Partial<Parameters<typeof runGeocodeCsv>[0]>, sink: ReturnType<typeof io>) =>
  runGeocodeCsv(
    {
      input: join(dir, "in.csv"),
      queryColumn: "address",
      output: join(dir, "out.csv"),
      key: "um_test_key",
      gateway,
      options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 4 },
      estimateOnly: false,
      overwrite: false,
      resume: false,
      ...over,
    },
    sink,
  );

const SIMPLE = 'address,city\n"101 17 Ave SW",Calgary\n"1 Yonge St",Toronto\n"1000 rue Sherbrooke",Montréal\n';

describe("unmap geocode csv", () => {
  it("annotates every input row and keeps the originals", async () => {
    await write("in.csv", SIMPLE);
    const sink = io();
    expect(await run({}, sink)).toBe(0);

    const text = await readFile(join(dir, "out.csv"), "utf8");
    const lines = text.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("address,city,unmap_status,unmap_id");
    expect(lines[1]).toContain("101 17 Ave SW,Calgary,matched,id-101 17 Ave SW");
    // Accents survive the round trip.
    expect(lines[3]).toContain("Montréal");
  });

  it("refuses to overwrite an existing output unless told to", async () => {
    await write("in.csv", SIMPLE);
    await write("out.csv", "do not lose me\n");
    const sink = io();
    expect(await run({}, sink)).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/already exists/);
    expect(await readFile(join(dir, "out.csv"), "utf8")).toBe("do not lose me\n");

    expect(await run({ overwrite: true }, io())).toBe(0);
  });

  it("refuses to write over its own input", async () => {
    await write("in.csv", SIMPLE);
    const sink = io();
    expect(await run({ output: join(dir, "in.csv") }, sink)).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/overwrite the input/);
  });

  it("refuses two writers on one path, which would interleave lines and break resume", async () => {
    await write("in.csv", SIMPLE);
    const same = io();
    expect(await run({ reviewOutput: join(dir, "out.csv") }, same)).toBe(1);
    expect(same.errors.join("\n")).toMatch(/--review-output and --output are the same file/);

    const cp = io();
    expect(await run({ checkpoint: join(dir, "out.csv") }, cp)).toBe(1);
    expect(cp.errors.join("\n")).toMatch(/--checkpoint points at the input or an output file/);
  });

  it("estimates without sending anything", async () => {
    await write("in.csv", 'address\n"1 Main"\n\n"2 Main"\n');
    const sink = io();
    expect(await run({ estimateOnly: true }, sink)).toBe(0);
    expect(served).toBe(0);
    expect(sink.lines.join("\n")).toMatch(/2 rows, 2 with an address/);
    // Two eligible rows fit in one batch POST; the ceiling is still retries times requests.
    expect(sink.lines.join("\n")).toMatch(/up to 4 if every request uses all 4 attempts/);
    expect(sink.lines.join("\n")).toMatch(/Remaining allowance: unknown/);
  });

  it("names a missing column instead of geocoding empty strings", async () => {
    await write("in.csv", "street,city\n1 Main,Calgary\n");
    const sink = io();
    expect(await run({}, sink)).toBe(1);
    expect(served).toBe(0);
    expect(sink.errors.join("\n")).toMatch(/no column named "address"/);
    expect(sink.errors.join("\n")).toMatch(/street, city/);
  });

  it("refuses an ambiguous duplicate column rather than picking one", async () => {
    await write("in.csv", "address,address\n1 Main,2 Main\n");
    const sink = io();
    expect(await run({}, sink)).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/2 columns named "address"/);
  });

  it("writes a row with no address as invalid, without a request", async () => {
    await write("in.csv", 'address,city\n"",Calgary\n"1 Main",Toronto\n');
    const sink = io();
    expect(await run({}, sink)).toBe(0);
    const lines = (await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n");
    expect(lines[1]).toContain(",invalid,");
    expect(served).toBe(1);
  });

  it("separates the review file without dropping anything from the main one", async () => {
    behaviour = (q) =>
      q.startsWith("1 ")
        ? ok(q, { layer: "street", match_type: "fallback", match_reasons: ["housenumber_not_matched"] })
        : ok(q);
    await write("in.csv", SIMPLE);
    const sink = io();
    expect(await run({ reviewOutput: join(dir, "review.csv") }, sink)).toBe(0);

    const main = (await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n");
    const review = (await readFile(join(dir, "review.csv"), "utf8")).trim().split("\r\n");
    expect(main).toHaveLength(4);
    expect(review).toHaveLength(2); // header + the one fallback
    expect(review[1]).toContain("fallback_match housenumber_not_matched");
  });

  it("produces the same file whether or not it was interrupted", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => `${i + 1} Main St`);
    await write("in.csv", `address\n${rows.join("\n")}\n`);

    // A clean run, for comparison.
    await run({ output: join(dir, "clean.csv") }, io());
    const clean = await readFile(join(dir, "clean.csv"), "utf8");

    // Now a run that stops partway, the way an interrupted one does: it checkpoints what it
    // committed and leaves the rest.
    await run(
      {
        output: join(dir, "resumed.csv"),
        options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 1, sample: 25 },
      },
      io(),
    );
    const partial = await readFile(join(dir, "resumed.csv"), "utf8");
    expect(partial.length).toBeLessThan(clean.length);

    const cp = JSON.parse(await readFile(join(dir, "resumed.csv.checkpoint.json"), "utf8"));
    expect(cp.committedThrough).toBe(25);
    expect(cp.outputBytes).toBe((await stat(join(dir, "resumed.csv"))).size);
    expect(JSON.stringify(cp)).not.toContain("um_test_key");

    // The crash case the ordering exists for: bytes in the output that the checkpoint does not
    // know about, because the process died between the fsync and the checkpoint write. A
    // resume must throw them away rather than build on them.
    await writeFile(join(dir, "resumed.csv"), partial + "garbage,row,from,a,crash\r\n", "utf8");

    expect(await run({ output: join(dir, "resumed.csv"), resume: true }, io())).toBe(0);

    // Byte-identical to the uninterrupted run: the crash tail was truncated, the remaining rows
    // were geocoded, and nothing was duplicated.
    expect(await readFile(join(dir, "resumed.csv"), "utf8")).toBe(clean);
  });

  it("finishes a file whose rows failed transiently, once the server recovers", async () => {
    // maxAttempts 1 means a 503 is terminal for that chunk, so the run COMPLETES with failures
    // rather than stopping. That is a different thing from an interruption, and a resume has
    // nothing to do: the rows already have a terminal outcome. Retrying them is a fresh run.
    const rows = Array.from({ length: 10 }, (_, i) => `${i + 1} Main St`);
    await write("in.csv", `address\n${rows.join("\n")}\n`);
    behaviour = () => ({ status: 503, body: { error: "gone" } });
    await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 1, maxAttempts: 1 } }, io());

    const lines = (await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n");
    expect(lines).toHaveLength(11);
    expect(lines.filter((l) => l.includes(",failed,"))).toHaveLength(10);
    expect(served).toBe(1);

    // Every row is present exactly once even though none of them have an answer: nothing is
    // silently dropped, which is the whole rule the review file rests on.
    for (const row of rows) expect(lines.filter((l) => l.startsWith(`${row},`))).toHaveLength(1);
  });

  it("sends a 250-row file as three batch POSTs", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => `${i + 1} Main St`);
    await write("in.csv", `address\n${rows.join("\n")}\n`);
    expect(await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 1 } }, io())).toBe(0);
    expect(served).toBe(3);
    expect((await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n")).toHaveLength(251);
  });

  it("allows a resume that only changes the pace", async () => {
    // rate, concurrency and max-attempts change how hard the client tries, not what a row
    // resolves to, and wanting to slow a long run down is normal.
    await write("in.csv", `address\n${Array.from({ length: 6 }, (_, i) => `${i} Main`).join("\n")}\n`);
    await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 4, maxAttempts: 1, sample: 2 } }, io());
    const sink = io();
    expect(await run({ resume: true, options: { ...DEFAULT_OPTIONS, rate: 2, concurrency: 1, maxAttempts: 8 } }, sink)).toBe(0);
    expect((await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n")).toHaveLength(7);
  });

  it("refuses to resume against a different mapping", async () => {
    await write("in.csv", "address,city\n1 Main,Calgary\n");
    await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, sample: 1 } }, io());
    const sink = io();
    const code = await run({ queryColumn: "city", resume: true }, sink);
    expect(code).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/mapping or an answer-affecting option has changed/);
  });

  it("refuses to resume against a different input file", async () => {
    await write("in.csv", "address\n1 Main\n");
    await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, sample: 1 } }, io());
    await write("in.csv", "address\n1 Main\n2 Main\n");
    const sink = io();
    expect(await run({ resume: true }, sink)).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/input file has changed/);
  });

  it("refuses to start on top of an existing checkpoint without --resume", async () => {
    await write("in.csv", "address\n1 Main\n2 Main\n");
    await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, sample: 1 } }, io());
    const sink = io();
    expect(await run({}, sink)).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/Pass --resume/);
  });

  it("stops on bad credentials without calling any address bad", async () => {
    behaviour = () => ({ status: 401, body: { error: "invalid key", code: "unauthorized" } });
    await write("in.csv", SIMPLE);
    const sink = io();
    expect(await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 1 } }, sink)).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/invalid key/);
    // One request, not four: a bad key is never retried, because hammering one is how an
    // account gets blocked. At concurrency > 1 the rows already in flight are still sent and
    // still billed — cancellation cannot un-send them, and the docs say so.
    expect(served).toBe(1);
    // Only the header: no row was written as failed, because no address was the problem.
    expect((await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n")).toHaveLength(1);
  });

  it("stops on an exhausted budget and says how to continue", async () => {
    behaviour = () => ({
      status: 429,
      body: { error: "monthly quota exhausted", code: "quota_exceeded" },
      headers: { "retry-after": "3600" },
    });
    await write("in.csv", SIMPLE);
    const sink = io();
    expect(await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 1 } }, sink)).toBe(1);
    expect(sink.errors.join("\n")).toMatch(/quota/);
    expect(sink.errors.join("\n")).toMatch(/--resume/);
    expect(served).toBe(1);
  });

  it("retries a 429 that is only a rate limit, and bills every attempt", async () => {
    behaviour = (q, n) =>
      n <= 2
        ? { status: 429, body: { error: "rate limit exceeded", code: "rate_limited" }, headers: { "retry-after": "0" } }
        : ok(q);
    await write("in.csv", "address\n1 Main\n");
    const sink = io();
    expect(await run({}, sink)).toBe(0);
    expect(served).toBe(3);
    expect(sink.lines.join("\n")).toMatch(/requests sent\s+3\s+\(2 of them retries/);
  });

  it("backs off a 429 that carries no Retry-After, instead of resending at once", async () => {
    // The header is absent here, which is the ordinary case: our own rate limiter sends one,
    // nothing else on the path does. Reading it through a bare `Number()` turned the missing
    // header into 0 seconds and skipped the wait entirely, so the whole exponential was dead.
    // A floor, not a window: the first backoff is 500 ms jittered down to at most half.
    behaviour = (q, n) => (n === 1 ? { status: 503, body: { error: "upstream busy" } } : ok(q));
    await write("in.csv", "address\n1 Main\n");
    const sink = io();
    const started = Date.now();
    expect(await run({}, sink)).toBe(0);
    expect(served).toBe(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
  });

  it("stops after a sample and resumes into the rest", async () => {
    await write("in.csv", `address\n${Array.from({ length: 10 }, (_, i) => `${i} Main`).join("\n")}\n`);
    const sink = io();
    expect(await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, concurrency: 1, sample: 3 } }, sink)).toBe(0);
    expect(sink.lines.join("\n")).toMatch(/Sample of 3 rows/);
    expect((await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n")).toHaveLength(4);

    expect(await run({ resume: true }, io())).toBe(0);
    expect((await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n")).toHaveLength(11);
  });

  it("suffixes rather than overwrites a colliding column, and says so", async () => {
    await write("in.csv", "address,unmap_status\n1 Main,keep me\n");
    const sink = io();
    expect(await run({}, sink)).toBe(0);
    const lines = (await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n");
    expect(lines[0]).toContain("unmap_status_2");
    expect(lines[1]).toContain("keep me");
    expect(sink.errors.join("\n")).toMatch(/renamed: unmap_status -> unmap_status_2/);
  });

  it("neutralises a formula only when asked", async () => {
    await write("in.csv", 'address,note\n1 Main,"=SUM(A1:A9)"\n');
    await run({ options: { ...DEFAULT_OPTIONS, rate: 1000, spreadsheetSafe: true } }, io());
    expect(await readFile(join(dir, "out.csv"), "utf8")).toContain('"\t=SUM(A1:A9)"');

    await run({ output: join(dir, "raw.csv"), options: { ...DEFAULT_OPTIONS, rate: 1000 } }, io());
    expect(await readFile(join(dir, "raw.csv"), "utf8")).toContain("=SUM(A1:A9)");
  });

  it("handles quoted newlines, a BOM and leading zeros", async () => {
    await write("in.csv", '﻿address,postcode,note\n"1 Main","0123","two\nlines"\n');
    expect(await run({}, io())).toBe(0);
    const text = await readFile(join(dir, "out.csv"), "utf8");
    expect(text).toContain("0123");
    expect(text).toContain('"two\nlines"');
    expect(text.startsWith("address,")).toBe(true);
  });

  it("reports a malformed row without abandoning the file", async () => {
    await write("in.csv", "address,city\n1 Main\n2 Main,Toronto\n");
    const sink = io();
    expect(await run({}, sink)).toBe(0);
    expect((await readFile(join(dir, "out.csv"), "utf8")).trim().split("\r\n")).toHaveLength(3);
    expect(sink.errors.join("\n")).toMatch(/row 1 has 1 fields/);
  });

  it("streams 10,000 rows without holding the file in memory", async () => {
    // The acceptance gate for scale. The point is not the wall clock, it is that heap use does
    // not track file size: the parser is a state machine over chunks and the only per-row state
    // that outlives a row is the in-flight window.
    const rows = Array.from({ length: 10_000 }, (_, i) => `${i + 1} Main Street, Calgary`);
    await write("in.csv", `address,note\n${rows.map((r) => `"${r}",n${r.length}`).join("\n")}\n`);

    // Both samples are taken after a forced collection, or the difference is GC timing rather
    // than retention: 10,000 rows leave tens of megabytes of garbage behind, and sampling before
    // it is swept put the same passing run anywhere between 40 MB and 122 MB. `--expose-gc` is
    // supplied by this package's vitest.config.ts, which is what makes `global.gc` defined here.
    global.gc?.();
    const before = process.memoryUsage().heapUsed;
    const sink = io();
    expect(
      await run({ options: { ...DEFAULT_OPTIONS, rate: 1e9, concurrency: 16 } }, sink),
    ).toBe(0);
    global.gc?.();
    const after = process.memoryUsage().heapUsed;

    const text = await readFile(join(dir, "out.csv"), "utf8");
    expect(text.trim().split("\r\n")).toHaveLength(10_001);
    expect(served).toBe(100);
    expect(sink.lines.join("\n")).toMatch(/rows written\s+10000/);
    // The input is ~400 KB and the output ~1.4 MB. Growth well under that says nothing is
    // accumulating per row; a parser that buffered the file would show several megabytes.
    expect(after - before).toBeLessThan(64 * 1024 * 1024);
  }, 120_000);

  it("never writes the key anywhere", async () => {
    await write("in.csv", SIMPLE);
    const sink = io();
    await run({ reviewOutput: join(dir, "review.csv") }, sink);
    for (const f of ["out.csv", "review.csv", "out.csv.checkpoint.json"]) {
      expect(await readFile(join(dir, f), "utf8")).not.toContain("um_test_key");
    }
    expect([...sink.lines, ...sink.errors].join("\n")).not.toContain("um_test_key");
  });
});

describe("resolveKey", () => {
  it("prefers the flag, then the environment, then the config file", async () => {
    const d = await mkdtemp(join(tmpdir(), "unmap-key-"));
    try {
      await writeFile(join(d, "unmap.config.json"), JSON.stringify({ key: "um_from_config" }), "utf8");
      expect(await resolveKey("um_explicit", d)).toBe("um_explicit");

      const prev = process.env.UNMAP_KEY;
      process.env.UNMAP_KEY = "um_from_env";
      expect(await resolveKey(undefined, d)).toBe("um_from_env");
      delete process.env.UNMAP_KEY;
      expect(await resolveKey(undefined, d)).toBe("um_from_config");
      if (prev != null) process.env.UNMAP_KEY = prev;
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("is undefined rather than throwing when there is nothing to find", async () => {
    const d = await mkdtemp(join(tmpdir(), "unmap-key-"));
    const prev = process.env.UNMAP_KEY;
    delete process.env.UNMAP_KEY;
    try {
      expect(await resolveKey(undefined, d)).toBeUndefined();
    } finally {
      if (prev != null) process.env.UNMAP_KEY = prev;
      await rm(d, { recursive: true, force: true });
    }
  });
});

describe("checkpointCompatible", () => {
  it("rejects a checkpoint from a future schema rather than guessing", () => {
    const v = checkpointCompatible({ schema: 99, input: "a", mapping: "b" }, { input: "a", mapping: "b" });
    expect(v.ok).toBe(false);
  });

  it("rejects something that is not a checkpoint at all", () => {
    expect(checkpointCompatible(null, { input: "a", mapping: "b" }).ok).toBe(false);
    expect(checkpointCompatible("nope", { input: "a", mapping: "b" }).ok).toBe(false);
  });
});
