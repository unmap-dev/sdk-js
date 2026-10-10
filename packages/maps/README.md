# @unmap/maps

MapLibre GL wired to the [unmap](https://unmap.dev) gateway: worldwide vector tiles, twelve
cartographic styles in light and dark, fonts and sprites, all from one style URL. The basemap
supports 41 upstream Protomaps label-language tags, including native Japanese, Korean, and
Simplified/Traditional Chinese glyph stacks. Labels depend on names present in the map data;
language support does not guarantee every feature has a translation. Geocoding and routing remain
Canada-scoped. Part of
`@unmap/sdk`; install this alone when you want a map and nothing else.

```bash
npm i @unmap/maps
```

```ts
import { createMap } from "@unmap/maps";
import "maplibre-gl/dist/maplibre-gl.css";

const map = createMap({
  key: "um_live_...",
  container: "#map",
  style: "base",
  mode: "dark",
});
```

`createMap()` returns a plain MapLibre GL `Map`, so everything you know about MapLibre applies.
Options are `key`, `container`, `gateway`, `style` (`base`, `muted`, `outdoor`, `blueprint`, `blush`, `orchid`, `canopy`, `lagoon`, `tropic`, `sunset`, `bold`, `pastel`, or a style
URL), `mode`, `lang`, `theme`, `center`, `zoom`, `projection`, `controls`, and
`maplibre` for any extra `maplibre-gl` `MapOptions`, merged last.

`projection: "globe"` draws the map as a sphere; omit it, or pass `"mercator"`, for the flat map.
A city centre with no zoom still frames the city rather than the planet.

Arabic and Hebrew labels need no plugin. MapLibre 6.9 and later draw right-to-left and
complex scripts on their own, which is why `maplibre-gl` `^6.9.0` is the peer dependency.

`controls` defaults to `true`, which adds MapLibre's navigation control (zoom in, zoom out, and a
compass) at `top-right`. Pass `controls: { position: "bottom-left" }` to move it, or
`controls: false` for a bare canvas.

Also exported:

- `unmapStyle(opts)` resolves those options to the style URL without creating a map.
- `DEMO_CITIES`, the three launch cities.
- `maplibregl`, the `maplibre-gl` module, for `new maplibregl.Marker()` and friends without a
  second import.

## Stylesheet

MapLibre's CSS is needed for controls, attribution, markers, and popups. Import
`maplibre-gl/dist/maplibre-gl.css` once, near the root of your app. `maplibre-gl` arrives as a
transitive dependency; under pnpm's strict layout add it as a direct dependency so the import
resolves.

## Web worker

MapLibre 6 is ESM-only and parses tiles in a module worker, which it locates through
`import.meta.url`. MapLibre's [migration guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
states that this does not reliably resolve inside a bundler's module graph, so bundler users make
a one-time `setWorkerUrl()` call. `@unmap/maps` does not make it for you: the URL is a path on your
own site, and only you know it.

Copy the worker out of the package and serve it yourself:

```js
// scripts/copy-maplibre-worker.mjs, run before `dev` and `build`
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json")), "dist");
const dest = path.join(process.cwd(), "public", "maplibre");

mkdirSync(dest, { recursive: true });
copyFileSync(path.join(dist, "maplibre-gl-worker.mjs"), path.join(dest, "maplibre-gl-worker.mjs"));
```

```ts
import { maplibregl } from "@unmap/maps";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
```

Skip it and the failure is silent: the worker never starts, so MapLibre never parses a tile, never
requests one, and the map waits forever for a load event. No error is thrown and no request fails —
the only sign is `Failed to load module script: ... MIME type of "text/html"` in the console.
Next.js with Turbopack is the common case ([maplibre-gl-js#8126](https://github.com/maplibre/maplibre-gl-js/issues/8126));
Vite, webpack, esbuild, rspack and Rollup need the same call. A plain CDN module import does not.

Styles, `mode`, `lang`, and `theme` are documented at
[unmap.dev/docs/apis/maps](https://unmap.dev/docs/apis/maps).
