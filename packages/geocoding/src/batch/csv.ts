/**
 * RFC 4180 CSV, streaming, with the Canadian-address-file details that break naive splitters.
 *
 * Hand-written rather than a dependency for two reasons that both matter here. `@unmap/cli` is
 * deliberately a zero-runtime-dependency Node tool, and the hosted batch consumer is a
 * Cloudflare Worker — one codec that runs in both, with no bundler shims, is worth the ~150
 * lines. The other reason is that the failure modes below are the whole job: a parser that gets
 * them wrong corrupts a customer's file silently, which is worse than refusing it.
 *
 * What it handles, and why each one is here:
 *
 *  - **A UTF-8 BOM.** Excel writes one. Left in place it becomes part of the first header name,
 *    so `--query-column address` fails to find `﻿address` and the error blames the user.
 *  - **Quoted commas and quoted newlines.** "Gatineau, QC" and a multi-line note field are
 *    ordinary in address exports. A record can therefore span several lines, which is why a
 *    hosted job cannot chunk a CSV at arbitrary newlines.
 *  - **Escaped quotes** (`""` inside a quoted field).
 *  - **CRLF, LF and a lone CR** as record separators, mixed within one file.
 *  - **Leading zeros** — postal codes and civic numbers. Everything stays a string, always.
 *  - **Ragged rows.** A row with fewer or more fields than the header is a fact about the file,
 *    not a crash: it is reported as an error for that row and the rest of the file continues.
 *
 * The parser is a state machine over chunks, so a 50 MiB file never has to be a 50 MiB string.
 */

export interface CsvRecord {
  /** 1-based index among data records, excluding the header. Stable across resumes. */
  index: number;
  /** Field values in header order, exactly as they appeared. Never coerced. */
  values: string[];
}

export interface CsvProblem {
  index: number;
  code: "too_few_fields" | "too_many_fields";
  message: string;
}

const QUOTE = 34; // "
const COMMA = 44; // ,
const CR = 13;
const LF = 10;

/**
 * Incremental parser. Feed it strings; it yields complete records.
 *
 * Deliberately not an async iterator: the caller owns the read loop, which is what lets the CLI
 * and the Worker use their own very different stream APIs over the same state machine.
 */
export class CsvParser {
  private field = "";
  private row: string[] = [];
  private inQuotes = false;
  /** A quote seen inside a quoted field: either an escape or the close. */
  private pendingQuote = false;
  /** A CR seen outside quotes: end of record, and a following LF is part of the same break. */
  private pendingCr = false;
  private started = false;
  private rowHasContent = false;

  /**
   * Feed one chunk. Returns the records completed by it.
   *
   * A record that ends exactly at a chunk boundary is returned here; a partial one is held until
   * the next chunk, or until `end()`.
   */
  write(chunk: string): string[][] {
    const out: string[][] = [];
    // The BOM is only a BOM at the very start of the stream. Anywhere else U+FEFF is a
    // zero-width no-break space and part of somebody's data.
    if (!this.started) {
      this.started = true;
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
    }

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk.charCodeAt(i);

      if (this.pendingCr) {
        this.pendingCr = false;
        // CRLF is one break; a lone CR was already the break, so an LF here is consumed.
        if (ch === LF) continue;
      }

      if (this.inQuotes) {
        if (this.pendingQuote) {
          this.pendingQuote = false;
          if (ch === QUOTE) {
            this.field += '"';
            continue;
          }
          this.inQuotes = false;
          // Fall through: this character closes the field or the record.
        } else if (ch === QUOTE) {
          this.pendingQuote = true;
          continue;
        } else {
          this.field += chunk[i];
          continue;
        }
      }

      if (ch === QUOTE && this.field === "") {
        this.inQuotes = true;
        this.rowHasContent = true;
        continue;
      }
      if (ch === COMMA) {
        this.row.push(this.field);
        this.field = "";
        this.rowHasContent = true;
        continue;
      }
      if (ch === CR) {
        this.pendingCr = true;
        out.push(this.finishRow());
        continue;
      }
      if (ch === LF) {
        out.push(this.finishRow());
        continue;
      }
      this.field += chunk[i];
      this.rowHasContent = true;
    }
    return out.filter((r) => r !== EMPTY);
  }

  /** Flush a final record with no trailing newline. */
  end(): string[][] {
    if (this.inQuotes && this.pendingQuote) this.inQuotes = false;
    if (this.field !== "" || this.row.length > 0 || this.rowHasContent) {
      const row = this.finishRow();
      return row === EMPTY ? [] : [row];
    }
    return [];
  }

  /** True when the stream ended inside an unterminated quoted field. */
  get unterminated(): boolean {
    return this.inQuotes && !this.pendingQuote;
  }

  private finishRow(): string[] {
    this.row.push(this.field);
    const row = this.row;
    this.field = "";
    this.row = [];
    const hadContent = this.rowHasContent;
    this.rowHasContent = false;
    // A blank line between records is whitespace, not a row of one empty field. A line that is
    // genuinely one empty QUOTED field ("") has rowHasContent set and survives.
    if (!hadContent && row.length === 1 && row[0] === "") return EMPTY;
    return row;
  }
}

/** Sentinel for "this line was blank", distinguishable from a real one-empty-field row. */
const EMPTY: string[] = [];

/**
 * Align a raw row against the header.
 *
 * Ragged rows are reported, not repaired and not thrown: a short row is padded so the caller can
 * still carry its original values into the output, and a long row keeps its extra fields for the
 * same reason. Discarding either would lose customer data in a file we were only asked to
 * annotate.
 */
export function alignRow(
  header: readonly string[],
  values: readonly string[],
  index: number,
): { record: CsvRecord; problem?: CsvProblem } {
  if (values.length === header.length) return { record: { index, values: [...values] } };
  if (values.length < header.length) {
    return {
      record: { index, values: [...values, ...Array(header.length - values.length).fill("")] },
      problem: {
        index,
        code: "too_few_fields",
        message: `row ${index} has ${values.length} fields, header has ${header.length}`,
      },
    };
  }
  return {
    record: { index, values: [...values] },
    problem: {
      index,
      code: "too_many_fields",
      message: `row ${index} has ${values.length} fields, header has ${header.length}`,
    },
  };
}

/**
 * Quote a value for output: only when it has to be, and always the same way.
 *
 * The tab is in the set even though RFC 4180 does not require it. It is there for
 * `escapeForSpreadsheet` below, which neutralises a formula by prefixing one: unquoted, a
 * leading tab is read inconsistently across spreadsheet apps, and quoted it is unambiguous
 * everywhere. A tab anywhere else in a field is rare enough that quoting it costs nothing.
 */
export function encodeField(value: string): string {
  if (value === "") return "";
  if (/[",\r\n\t]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Whether a value would be read as a formula by a spreadsheet.
 *
 * Excel, Sheets and LibreOffice all evaluate a cell beginning `=`, `+`, `-`, `@`, and CSV is the
 * classic delivery vehicle for that (CSV injection). It matters here because a geocoder's output
 * is a file people open in a spreadsheet, and because Canadian address data really does contain
 * values that start this way — a negative latitude, "-123 Main St" in a malformed row.
 *
 * Detection is separated from mitigation on purpose: `escapeForSpreadsheet` prefixes a tab so
 * the cell displays as text, and the caller decides whether to apply it, because prefixing
 * changes the bytes and a pipeline reading the file programmatically wants the original.
 */
export function looksLikeFormula(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value);
}

export function escapeForSpreadsheet(value: string): string {
  return looksLikeFormula(value) ? `\t${value}` : value;
}

/** One output line, terminated with CRLF (what RFC 4180 specifies and Excel expects). */
export function encodeRow(values: readonly string[], opts: { spreadsheetSafe?: boolean } = {}): string {
  const prepared = opts.spreadsheetSafe ? values.map(escapeForSpreadsheet) : values;
  return prepared.map(encodeField).join(",") + "\r\n";
}
