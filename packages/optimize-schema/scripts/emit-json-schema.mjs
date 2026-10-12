#!/usr/bin/env node
// Writes dist/optimize-tours-request.schema.json from the built field table. Runs after tsup in `build`.
import { writeFileSync } from "node:fs";
import { buildJsonSchema } from "../dist/index.js";

const out = new URL("../dist/optimize-tours-request.schema.json", import.meta.url);
writeFileSync(out, `${JSON.stringify(buildJsonSchema(), null, 2)}\n`);
console.log(`wrote ${out.pathname}`);
