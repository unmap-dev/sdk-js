import { BATCH_SCHEMA_VERSION } from "./plan";

/**
 * The file that makes an interrupted run resumable, and the rule that makes resuming safe.
 *
 * The hard part is not remembering which row we reached. It is that two files and one record of
 * them cannot be written atomically together, so a crash always lands between them. The design
 * chooses which way to be wrong:
 *
 *   1. Completed rows are flushed to the output IN INPUT ORDER and fsynced.
 *   2. Only then is the checkpoint written — atomically, via a temp file and a rename — recording
 *      the byte length of each output file at that moment.
 *   3. On resume, each output is TRUNCATED to its recorded length before anything is appended.
 *
 * So a crash between (1) and (2) leaves output rows the checkpoint does not know about, and step
 * (3) throws them away and redoes them. The alternative ordering would leave a checkpoint
 * claiming rows the file does not contain, which loses results silently. Redoing a few rows is
 * visible, bounded and correct; losing them is none of those.
 *
 * What this explicitly does NOT promise: exactly-once execution. A request in flight when the
 * process died may already have been served and billed, and will be sent again on resume. No
 * client-side checkpoint can prevent that, and claiming otherwise would be a lie about somebody's
 * invoice.
 *
 * The checkpoint holds no API key and no row content — only counts, offsets and fingerprints.
 * It is written next to a customer's addresses and there is no reason for it to carry either.
 */
export interface Checkpoint {
  /** Bumped when an old checkpoint becomes unsafe to resume. */
  schema: number;
  /** Which tool wrote it, for a human reading the file. */
  tool: string;
  /** Identity of the input file. A mismatch refuses the resume. */
  input: string;
  /** Identity of the mapping and the answer-affecting options. A mismatch refuses the resume. */
  mapping: string;
  /** Highest input row index whose output line is durably written. Rows resume from this + 1. */
  committedThrough: number;
  /** Byte length of the main output at the moment this was written. */
  outputBytes: number;
  /** Byte length of the review output at the moment this was written. */
  reviewBytes: number;
  /** Counters, kept distinct because they answer different questions. */
  counts: BatchCounts;
  /** ISO timestamp, for a human. Not used in any decision. */
  updatedAt: string;
}

/**
 * Four numbers that people routinely conflate, and a batch tool must not.
 *
 * `rows` is how much of the customer's file is done. `requests` is what was sent, which is more
 * than `rows` whenever anything retried, and it is the number that maps to the bill. `retries`
 * says how much of that gap was retries. `errors` counts rows that ended badly, which is
 * unrelated to either — one row can fail after four requests.
 */
export interface BatchCounts {
  rows: number;
  requests: number;
  retries: number;
  matched: number;
  review: number;
  noMatch: number;
  invalid: number;
  failed: number;
}

export const EMPTY_COUNTS: BatchCounts = {
  rows: 0,
  requests: 0,
  retries: 0,
  matched: 0,
  review: 0,
  noMatch: 0,
  invalid: 0,
  failed: 0,
};

export type ResumeVerdict =
  | { ok: true; checkpoint: Checkpoint }
  | { ok: false; reason: string };

/**
 * Decide whether a checkpoint may be resumed against this input and mapping.
 *
 * Every refusal here is a case where continuing would produce a file that is wrong in a way
 * nobody would notice: rows geocoded under two different mappings, or row indices pointing into
 * a different file. Refusing costs a rerun; continuing costs trust in the output.
 */
export function checkpointCompatible(
  raw: unknown,
  expect: { input: string; mapping: string },
): ResumeVerdict {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "the checkpoint file is not valid JSON" };
  }
  const cp = raw as Partial<Checkpoint>;

  if (cp.schema !== BATCH_SCHEMA_VERSION) {
    return {
      ok: false,
      reason:
        `the checkpoint was written by schema ${String(cp.schema)}, this tool writes ` +
        `${BATCH_SCHEMA_VERSION}. Start the run again rather than mixing two output formats.`,
    };
  }
  if (cp.input !== expect.input) {
    return {
      ok: false,
      reason: "the input file has changed since the checkpoint was written. Row numbers would no longer line up.",
    };
  }
  if (cp.mapping !== expect.mapping) {
    return {
      ok: false,
      reason:
        "the mapping or an answer-affecting option has changed since the checkpoint was written. " +
        "Resuming would leave one file geocoded two different ways.",
    };
  }
  if (
    typeof cp.committedThrough !== "number" ||
    typeof cp.outputBytes !== "number" ||
    typeof cp.reviewBytes !== "number" ||
    cp.committedThrough < 0 ||
    cp.outputBytes < 0 ||
    cp.reviewBytes < 0
  ) {
    return { ok: false, reason: "the checkpoint is missing its offsets, so the outputs cannot be reconciled" };
  }
  return { ok: true, checkpoint: { ...EMPTY_CHECKPOINT, ...(cp as Checkpoint) } };
}

const EMPTY_CHECKPOINT: Checkpoint = {
  schema: BATCH_SCHEMA_VERSION,
  tool: "@unmap/cli geocode csv",
  input: "",
  mapping: "",
  committedThrough: 0,
  outputBytes: 0,
  reviewBytes: 0,
  counts: EMPTY_COUNTS,
  updatedAt: "",
};

export function newCheckpoint(input: string, mapping: string): Checkpoint {
  return { ...EMPTY_CHECKPOINT, input, mapping, counts: { ...EMPTY_COUNTS }, updatedAt: new Date().toISOString() };
}

export function serializeCheckpoint(cp: Checkpoint): string {
  return JSON.stringify({ ...cp, updatedAt: new Date().toISOString() }, null, 2) + "\n";
}
