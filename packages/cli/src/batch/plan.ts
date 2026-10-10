import { createHash } from "node:crypto";

/** Same ceiling as `POST /geocode/batch`. */
const GEOCODE_BATCH_MAX = 100;

/**
 * What a batch run is, before any of it happens: which column carries the address, where the
 * output goes, and how hard to push the API.
 *
 * Kept pure and separate from the runner so the validation, the estimate and the
 * resume-compatibility check are all testable without a file system or a network — and so the
 * hosted service can reuse the same shape for a job's frozen mapping revision.
 */

/** Bumped when a change makes an old checkpoint unsafe to resume. See `checkpointCompatible`. */
export const BATCH_SCHEMA_VERSION = 1;

export interface BatchMapping {
  /** Header name of the column holding free-text addresses. */
  queryColumn: string;
}

export interface BatchOptions {
  /** Requests per second, averaged. Separate from concurrency on purpose — see the runner. */
  rate: number;
  /** Requests allowed in flight at once. */
  concurrency: number;
  /** Attempts per row, including the first. Retries are only for transient failures. */
  maxAttempts: number;
  /** Stop after this many eligible rows. `undefined` means the whole file. */
  sample?: number;
  /** Prefix a tab onto values a spreadsheet would evaluate as a formula. */
  spreadsheetSafe: boolean;
  /** Language for result labels. */
  lang?: string;
}

export const DEFAULT_OPTIONS: BatchOptions = {
  // Deliberately well under the published per-key burst limit (1,000 requests per 60 seconds per
  // Cloudflare location). A batch job is background work sharing an account's allowance with
  // whatever that account is serving to real users; the default should not be the ceiling.
  rate: 10,
  concurrency: 4,
  maxAttempts: 4,
  spreadsheetSafe: false,
};

export type MappingProblem =
  | { code: "column_missing"; message: string }
  | { code: "duplicate_column"; message: string }
  | { code: "empty_header"; message: string };

/**
 * Check the mapping against the file's own header, with no network.
 *
 * Every one of these is a mistake worth catching before the first request rather than after a
 * thousand: a misspelled column name geocodes an empty string for every row and bills for it.
 */
export function validateMapping(
  header: readonly string[],
  mapping: BatchMapping,
): MappingProblem[] {
  const problems: MappingProblem[] = [];
  if (header.length === 0 || header.every((h) => h.trim() === "")) {
    problems.push({ code: "empty_header", message: "the file has no header row" });
    return problems;
  }

  const normalised = header.map((h) => h.trim());
  const counts = new Map<string, number>();
  for (const h of normalised) counts.set(h, (counts.get(h) ?? 0) + 1);

  const wanted = mapping.queryColumn.trim();
  const found = counts.get(wanted) ?? 0;
  if (found === 0) {
    problems.push({
      code: "column_missing",
      message: `no column named "${wanted}". The file has: ${normalised.filter(Boolean).join(", ")}`,
    });
  } else if (found > 1) {
    // Which one did they mean? Guessing picks a column at random for every row in the file.
    problems.push({
      code: "duplicate_column",
      message: `the file has ${found} columns named "${wanted}"; rename one so the mapping is unambiguous`,
    });
  }
  return problems;
}

/** Zero-based position of the mapped column. */
export function columnIndex(header: readonly string[], name: string): number {
  return header.findIndex((h) => h.trim() === name.trim());
}

export interface Estimate {
  /** Data rows in the file. */
  rows: number;
  /** Rows whose mapped column is non-empty, so they can become a request. */
  eligible: number;
  /** Rows that cannot: they are written to the output as `invalid` and cost nothing. */
  ineligible: number;
  /** Requests this run would make if nothing is retried and nothing is sampled. */
  requests: number;
  /** Upper bound if every row exhausts its retries. Retries are billed. */
  maxRequests: number;
}

/**
 * Turn a count of rows into an estimate, stating its own assumptions.
 *
 * `requests` and `maxRequests` are both reported because one input row is NOT one billable
 * request: a retried row is billed per attempt, and a sampled run stops early. Quoting a single
 * number would be quoting the lucky case as if it were the price.
 */
export function estimate(
  rows: number,
  eligible: number,
  options: Pick<BatchOptions, "maxAttempts" | "sample">,
): Estimate {
  const attempted = options.sample != null ? Math.min(eligible, options.sample) : eligible;
  const requests = attempted === 0 ? 0 : Math.ceil(attempted / GEOCODE_BATCH_MAX);
  return {
    rows,
    eligible,
    ineligible: rows - eligible,
    requests,
    maxRequests: requests * options.maxAttempts,
  };
}

/**
 * Identity of the input file, for refusing an incompatible resume.
 *
 * Size and mtime, not a content hash: hashing a 50 MiB file on every resume to detect a change
 * that a size or timestamp difference already catches is work for nothing, and a file edited in
 * place without changing either is a case no cheap check catches anyway. The point is to stop an
 * obvious mismatch — resuming against a different file — not to be tamper-evident.
 */
export function inputFingerprint(size: number, mtimeMs: number): string {
  return createHash("sha256").update(`${size}:${Math.trunc(mtimeMs)}`).digest("hex").slice(0, 16);
}

/**
 * Identity of everything that changes what the output means: the mapping and the options that
 * affect the ANSWER, not the ones that affect the pace.
 *
 * `rate`, `concurrency` and `maxAttempts` are deliberately excluded. Slowing a resumed run down,
 * or giving a flaky network more attempts, are normal things to want partway through a large
 * file, and refusing them would push people into restarting it. None of the three changes what
 * any row RESOLVES to — they change how hard the client tries to get the answer, not what the
 * answer is. `sample` is excluded for the same reason: it stops the run early.
 *
 * `queryColumn`, `lang` and `spreadsheetSafe` are in, because each one changes the bytes that
 * end up in the file, and half a file written under one and half under another is wrong in a way
 * nobody would spot.
 */
export function mappingFingerprint(mapping: BatchMapping, options: BatchOptions): string {
  const material = JSON.stringify({
    schema: BATCH_SCHEMA_VERSION,
    queryColumn: mapping.queryColumn.trim(),
    spreadsheetSafe: options.spreadsheetSafe,
    lang: options.lang ?? null,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
