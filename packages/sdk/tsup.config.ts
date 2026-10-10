import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require_ = createRequire(import.meta.url);
const version = require_("./package.json").version as string;

const MAPLIBRE_DIST = path.join(path.dirname(require_.resolve("maplibre-gl/package.json")), "dist");
const BROWSER_OUT = "dist-browser";

/**
 * Copied verbatim out of maplibre-gl, never rebuilt.
 *
 * Since MapLibre 6.13 the worker is self-contained and `maplibre-gl-shared.mjs` ships empty, so
 * the worker is the only file copied. It keeps its upstream name, which no user ever types.
 */
const COPIES: ReadonlyArray<readonly [string, string]> = [
  ["maplibre-gl-worker.mjs", "maplibre-gl-worker.mjs"],
];

const BANNER = `/*! unmap ${version} | MIT | https://unmap.dev
 * Bundles MapLibre GL JS, (c) MapLibre contributors, 3-Clause BSD.
 * https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt
 */`;

/**
 * unmap.css is maplibre-gl.css under a different name, so it carries the same notice unmap.js
 * does. Without this the only redistributed file with no attribution on it would be the one a
 * user pastes into their `<link>` tag.
 */
const CSS_BANNER = `/*! unmap ${version} | https://unmap.dev
 * This file is MapLibre GL JS's stylesheet, redistributed unmodified under the name unmap.css.
 * (c) MapLibre contributors, 3-Clause BSD.
 * https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt
 */
`;

/**
 * Hand MapLibre the worker that shipped beside this script.
 *
 * MapLibre 6 runs a module worker it locates through `import.meta.url`, which an IIFE does not
 * have, so without this the worker never starts: MapLibre parses no tile, therefore requests
 * none, `load` never fires, and the map waits forever with nothing thrown and no failed request
 * in the network panel. Deriving the URL from the running script also means a 0.10.0 bundle can
 * never load a 0.11.0 worker.
 */
const FOOTER = `(function(){var s=document.currentScript&&document.currentScript.src;
if(s&&unmap.maplibregl&&unmap.maplibregl.setWorkerUrl){
unmap.maplibregl.setWorkerUrl(new URL("maplibre-gl-worker.mjs",s).href);}})();`;

export default defineConfig([
  // The npm library build, unchanged.
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // The CDN build. Not in `files`, so it never enters the npm tarball.
  {
    entry: { unmap: "src/index.ts" },
    outDir: BROWSER_OUT,
    format: ["iife"],
    globalName: "unmap",
    platform: "browser",
    minify: true,
    sourcemap: false,
    dts: false,
    clean: true,
    // tsup's default iife extension is ".global.js" (to disambiguate from a cjs/esm build of the
    // same entry name). This build only ever produces one format, and the publish script and the
    // CDN URL both need the plain "unmap.js" name, so override it back to ".js".
    outExtension: () => ({ js: ".js" }),
    banner: { js: BANNER },
    footer: { js: FOOTER },
    esbuildOptions(options) {
      // `import.meta.url` is only ever used as a base URL here, and the worker URL we pass to
      // setWorkerUrl is already absolute, so any valid absolute URL works. esbuild's default for
      // IIFE is an empty string, and `new URL(path, "")` throws. `document.baseURI` is always a
      // valid absolute URL and is evaluated lazily, so it cannot be null the way
      // `document.currentScript` can be by the time MapLibre reads it.
      options.define = { ...options.define, "import.meta.url": "document.baseURI" };
    },
    async onSuccess() {
      mkdirSync(BROWSER_OUT, { recursive: true });
      for (const [from, to] of COPIES) {
        copyFileSync(path.join(MAPLIBRE_DIST, from), path.join(BROWSER_OUT, to));
      }
      // The stylesheet is the one copy that is renamed, so it is the one that needs the notice
      // written in rather than inherited. Byte-identical to maplibre-gl.css below the banner.
      writeFileSync(
        path.join(BROWSER_OUT, "unmap.css"),
        CSS_BANNER + readFileSync(path.join(MAPLIBRE_DIST, "maplibre-gl.css"), "utf8"),
      );
    },
  },
]);
