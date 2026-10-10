import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

// `__dirname` is not defined here: packages/sdk is "type": "module" and vitest transforms this
// file to ESM.
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist-browser");
const read = (f: string) => readFileSync(path.join(OUT, f), "utf8");

/** The ceiling, not the measurement. MapLibre alone is ~278 KB gzip; this catches the day a
 *  dependency is added to @unmap/sdk and silently multiplies what every CDN page downloads. */
const GZIP_CEILING_BYTES = 320 * 1024;

describe("the browser bundle", () => {
  it("emits exactly the three files the CDN publishes", () => {
    for (const f of ["unmap.js", "unmap.css", "maplibre-gl-worker.mjs"]) {
      expect(existsSync(path.join(OUT, f)), `${f} is missing from dist-browser/`).toBe(true);
    }
  });

  it("defines the `unmap` global as an IIFE, not a module", () => {
    const js = read("unmap.js");
    expect(js).toContain("var unmap");
    expect(js).not.toContain("export{");
    expect(js).not.toContain("export {");
  });

  it("points MapLibre at the worker beside it", () => {
    const js = read("unmap.js");
    expect(js).toContain("setWorkerUrl");
    expect(js).toContain("maplibre-gl-worker.mjs");
    expect(js).toContain("currentScript");
  });

  // An IIFE has no `import.meta.url`. esbuild substitutes an empty string, and MapLibre's own
  // worker setup does `new URL(path, thatBase)`, which throws on "". A bare `import.meta` left
  // in the output means the very first map dies inside MapLibre with a TypeError.
  it("leaves no bare import.meta in the output", () => {
    expect(read("unmap.js")).not.toContain("import.meta");
  });

  it("carries MapLibre's BSD-3-Clause notice", () => {
    const js = read("unmap.js");
    expect(js).toContain("MapLibre");
    expect(js).toContain("3-Clause BSD");
  });

  it("carries that notice on the stylesheet too, which is MapLibre's under another name", () => {
    // unmap.css is maplibre-gl.css renamed. It is the one redistributed file a user pastes into
    // their own page, so it must not be the one with no attribution on it.
    const css = read("unmap.css");
    expect(css.startsWith("/*!")).toBe(true);
    expect(css).toContain("MapLibre");
    expect(css).toContain("3-Clause BSD");
    // Renamed, not edited: the upstream rules are still all there under the banner.
    expect(css).toContain(".maplibregl-map");
  });

  it("ships a self-contained worker with no sibling import", () => {
    // MapLibre 6.13 inlined what the worker used to import from ./maplibre-gl-shared.mjs. If a
    // later release splits it again, the CDN must publish that sibling beside the worker.
    expect(read("maplibre-gl-worker.mjs")).not.toMatch(/from\s*["']\.\//);
  });

  it("stays under the gzip ceiling", () => {
    const gz = gzipSync(readFileSync(path.join(OUT, "unmap.js"))).byteLength;
    expect(gz, `unmap.js is ${(gz / 1024).toFixed(0)} KB gzip`).toBeLessThan(GZIP_CEILING_BYTES);
  });
});
