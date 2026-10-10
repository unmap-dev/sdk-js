import type { GeocodeMatchReason, GeocodeResult } from "../index";

/**
 * The output schema a batch geocode writes, shared by the local CLI and the hosted service.
 *
 * One schema, one place, because the two are meant to be interchangeable: a customer who
 * prototypes with `unmap geocode csv` and then moves the job to the dashboard should get the
 * same columns in the same order with the same meanings, and diffing the two files should show
 * nothing but the coordinates.
 */

/** Prefix on every column this adds, so a customer's own `status` column is never shadowed. */
export const OUTPUT_PREFIX = "unmap_";

/**
 * What happened to one input row. Distinct from `match_type`, which is about the QUALITY of an
 * answer — a row can have `status: "matched"` and `match_type: "fallback"`, and that pairing is
 * the common case worth reviewing.
 */
export type RowStatus =
  /** A result came back and is good enough to use without looking at it. */
  | "matched"
  /** A result came back, but something about it should be looked at. See `unmap_review`. */
  | "review"
  /** The query ran and the corpus has nothing. Not an error, and it is billed. */
  | "no_match"
  /** The row never became a query: no address to send. Not billed. */
  | "invalid"
  /** The query ran and failed permanently (bad credentials, exhausted budget, repeated 5xx). */
  | "failed"
  /** Not attempted: the run was cancelled, paused or interrupted before reaching this row. */
  | "unprocessed";

/**
 * Why a row is in the review file. Row-level, and deliberately a superset of the result-level
 * `match_reasons`: two of these are about the SHAPE of the answer rather than its content.
 */
export type ReviewReason =
  | GeocodeMatchReason
  /** The result is coarser than the row asked for. */
  | "fallback_match"
  /** More than one candidate scored closely; the top one may not be the intended one. */
  | "ambiguous"
  /** Nothing came back at all. */
  | "no_match"
  /** The row could not be turned into a query. */
  | "invalid_input";

export const OUTPUT_COLUMNS = [
  "unmap_status",
  "unmap_id",
  "unmap_name",
  "unmap_lng",
  "unmap_lat",
  "unmap_layer",
  "unmap_source",
  "unmap_match_type",
  "unmap_precision",
  "unmap_review",
] as const;

export type OutputColumn = (typeof OUTPUT_COLUMNS)[number];

/**
 * Resolve a collision between the columns this writes and the customer's own header.
 *
 * Silently overwriting a column called `unmap_status` would destroy data; refusing the file
 * outright would strand anyone who ran the tool twice on its own output, which is exactly what
 * people do. So a collision is suffixed (`unmap_status_2`) and reported, and the caller decides
 * whether to say something. Comparison is case-insensitive because spreadsheets are.
 */
export function resolveOutputHeader(
  inputHeader: readonly string[],
): { header: string[]; renamed: Array<{ column: OutputColumn; to: string }> } {
  const taken = new Set(inputHeader.map((h) => h.trim().toLowerCase()));
  const renamed: Array<{ column: OutputColumn; to: string }> = [];
  const header = [...inputHeader];

  for (const column of OUTPUT_COLUMNS) {
    let name: string = column;
    if (taken.has(name.toLowerCase())) {
      let n = 2;
      while (taken.has(`${column}_${n}`.toLowerCase())) n++;
      name = `${column}_${n}`;
      renamed.push({ column, to: name });
    }
    taken.add(name.toLowerCase());
    header.push(name);
  }
  return { header, renamed };
}

/**
 * When the top result is close enough to the runner-up that picking it is a coin flip.
 *
 * Ratio, not a difference: BM25 scores are not on an absolute scale and are not comparable
 * across queries, so "within 5%" means something for every query while "within 2 points" means
 * something only for the query it was tuned on. 0.95 is deliberately tight — this flags a row
 * for a human to look at, and a review file that flags a third of the rows gets ignored whole.
 */
export const AMBIGUOUS_SCORE_RATIO = 0.95;

/**
 * Classify one row's outcome from what the API returned.
 *
 * The rule the whole review file rests on: **nothing is silently discarded.** Every input row
 * gets exactly one record in the main output, and every row that is not plainly usable gets a
 * reason here and a line in the review file. A row that "failed quietly" is the outcome this
 * function exists to make impossible.
 */
export function classify(results: readonly GeocodeResult[]): { status: RowStatus; reasons: ReviewReason[] } {
  if (results.length === 0) return { status: "no_match", reasons: ["no_match"] };

  const [top, second] = results;
  const reasons: ReviewReason[] = [];

  if (top!.match_type === "fallback") reasons.push("fallback_match");
  for (const r of top!.match_reasons ?? []) reasons.push(r);

  if (
    second &&
    typeof top!.score === "number" &&
    typeof second.score === "number" &&
    top!.score > 0 &&
    second.score / top!.score >= AMBIGUOUS_SCORE_RATIO
  ) {
    reasons.push("ambiguous");
  }

  return { status: reasons.length ? "review" : "matched", reasons };
}

/** The ten values, in `OUTPUT_COLUMNS` order, for one row. */
export function outputValues(
  status: RowStatus,
  reasons: readonly ReviewReason[],
  top: GeocodeResult | undefined,
): string[] {
  return [
    status,
    top?.id ?? "",
    top?.name ?? "",
    // Fixed precision rather than the float's own repr: a CSV of coordinates is read by humans
    // and by spreadsheets, and 51.04000000000001 is neither. 7 dp is ~1 cm, well beyond what any
    // source in the corpus actually resolves.
    top ? trimCoordinate(top.lng) : "",
    top ? trimCoordinate(top.lat) : "",
    top?.layer ?? "",
    top?.source ?? "",
    top?.match_type ?? "",
    top?.precision ?? "",
    reasons.join(" "),
  ];
}

function trimCoordinate(n: number): string {
  return n.toFixed(7).replace(/\.?0+$/, "");
}
