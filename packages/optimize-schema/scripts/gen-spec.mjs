#!/usr/bin/env node
// Regenerates docs/optimize/spec.md from the built field table. `pnpm --filter @unmap/optimize-schema gen-spec`.
import { writeFileSync } from "node:fs";
import { renderSpec } from "../dist/index.js";

const out = new URL("../../../docs/optimize/spec.md", import.meta.url);
writeFileSync(out, renderSpec());
console.log(`wrote ${out.pathname}`);
