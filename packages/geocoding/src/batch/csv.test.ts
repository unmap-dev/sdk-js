import { describe, it, expect } from "vitest";
import { CsvParser, alignRow, encodeRow, encodeField, looksLikeFormula } from "./csv";

/** Parse a whole string, optionally split into chunks, and return the rows. */
const parse = (text: string, chunkSize?: number): string[][] => {
  const p = new CsvParser();
  const rows: string[][] = [];
  if (chunkSize) {
    for (let i = 0; i < text.length; i += chunkSize) rows.push(...p.write(text.slice(i, i + chunkSize)));
  } else {
    rows.push(...p.write(text));
  }
  rows.push(...p.end());
  return rows;
};

describe("CsvParser", () => {
  it("parses a plain file", () => {
    expect(parse("a,b\n1,2\n3,4\n")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("strips a BOM from the first header only", () => {
    expect(parse("﻿address,city\n1 Main,Calgary\n")[0]).toEqual(["address", "city"]);
    // Anywhere else U+FEFF is a zero-width space and somebody's data.
    expect(parse("a\n﻿x\n")[1]).toEqual(["﻿x"]);
  });

  it("keeps commas and newlines inside quotes", () => {
    expect(parse('a,b\n"Gatineau, QC","line1\nline2"\n')[1]).toEqual(["Gatineau, QC", "line1\nline2"]);
  });

  it("unescapes doubled quotes", () => {
    expect(parse('a\n"she said ""hi"""\n')[1]).toEqual(['she said "hi"']);
  });

  it("handles CRLF, LF and a lone CR, mixed", () => {
    expect(parse("a,b\r\n1,2\r3,4\n5,6")).toEqual([["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]]);
  });

  it("returns the last record when there is no trailing newline", () => {
    expect(parse("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("skips blank lines but keeps a genuinely empty quoted field", () => {
    expect(parse("a\n1\n\n2\n")).toEqual([["a"], ["1"], ["2"]]);
    expect(parse('a\n""\n')).toEqual([["a"], [""]]);
  });

  it("preserves leading zeros and accents exactly", () => {
    const rows = parse("postcode,city\n0123,Montréal\n");
    expect(rows[1]).toEqual(["0123", "Montréal"]);
  });

  it("gives the same answer however the bytes are chunked", () => {
    const text = '﻿a,b,c\r\n"x, 1","y\ny",003\r\n"q""q",,z\n';
    const whole = parse(text);
    for (const size of [1, 2, 3, 5, 7, 13]) expect(parse(text, size)).toEqual(whole);
  });

  it("reports an unterminated quoted field rather than inventing an end", () => {
    const p = new CsvParser();
    p.write('a\n"never closed\n');
    p.end();
    expect(p.unterminated).toBe(true);
  });

  it("does not treat a quote in the middle of a field as a quoted field", () => {
    expect(parse('a\n5" pipe\n')[1]).toEqual(['5" pipe']);
  });
});

describe("alignRow", () => {
  const header = ["address", "city", "note"];

  it("passes a well-formed row through", () => {
    expect(alignRow(header, ["1 Main", "Calgary", ""], 1)).toEqual({
      record: { index: 1, values: ["1 Main", "Calgary", ""] },
    });
  });

  it("pads a short row and says so, rather than dropping it", () => {
    const { record, problem } = alignRow(header, ["1 Main"], 4);
    expect(record.values).toEqual(["1 Main", "", ""]);
    expect(problem?.code).toBe("too_few_fields");
  });

  it("keeps the extra fields of a long row, rather than truncating customer data", () => {
    const { record, problem } = alignRow(header, ["a", "b", "c", "d"], 9);
    expect(record.values).toHaveLength(4);
    expect(problem?.code).toBe("too_many_fields");
  });
});

describe("encoding", () => {
  it("quotes only what has to be quoted", () => {
    expect(encodeField("plain")).toBe("plain");
    expect(encodeField("a,b")).toBe('"a,b"');
    expect(encodeField('say "hi"')).toBe('"say ""hi"""');
    expect(encodeField("line\nline")).toBe('"line\nline"');
    expect(encodeField("")).toBe("");
  });

  it("round-trips anything the parser can read", () => {
    const rows = [["a", "b"], ["x, 1", 'q"q'], ["line\nline", "003"], ["", "Montréal"]];
    const text = rows.map((r) => encodeRow(r)).join("");
    expect(parse(text)).toEqual(rows);
  });

  it("terminates rows with CRLF", () => {
    expect(encodeRow(["a", "b"])).toBe("a,b\r\n");
  });

  it("recognises the values a spreadsheet would evaluate", () => {
    for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\ttab"]) expect(looksLikeFormula(v)).toBe(true);
    for (const v of ["1 Main St", "Montréal", "T2S 0P5", ""]) expect(looksLikeFormula(v)).toBe(false);
  });

  it("neutralises them only when asked, and leaves the value otherwise untouched", () => {
    expect(encodeRow(["=1+1"], { spreadsheetSafe: true })).toBe('"\t=1+1"\r\n');
    expect(encodeRow(["=1+1"])).toBe("=1+1\r\n");
  });
});
