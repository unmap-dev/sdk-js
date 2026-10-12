import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIELDS, renderSpec } from "../src/index";

// The spec lives in the product repository's docs/. The public sdk-js export ships this package
// without docs/ (scripts/public/export.mjs), so there is nothing to compare against there.
const specUrl = new URL("../../../docs/optimize/spec.md", import.meta.url);
const present = existsSync(specUrl);
const committed = present ? readFileSync(specUrl, "utf8") : "";

describe.skipIf(!present)("docs/optimize/spec.md", () => {
  it("is generated from the field table and is not stale (run `pnpm --filter @unmap/optimize-schema gen-spec`)", () => {
    expect(committed).toBe(renderSpec());
  });

  it("has one table row per field", () => {
    for (const row of FIELDS) expect(committed, row.path).toContain(`| \`${row.path}\` |`);
  });

  it("contains no em dash", () => {
    expect(committed).not.toContain("—");
  });
});
