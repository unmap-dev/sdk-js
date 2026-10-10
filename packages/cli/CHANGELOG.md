# @unmap/cli

## 0.20.0

### Patch Changes

- a1dfd17: Require `maplibre-gl` `^6.9.0` and stop loading the right-to-left text plugin. MapLibre 6.9 and later draw Arabic and Hebrew without it and deprecate `setRTLTextPlugin`, so `createMap` no longer calls it and `rtlPluginUrl` is removed from `@unmap/maps`. `unmap init` now prints `import { Map } from "maplibre-gl"`: MapLibre 6 has no default export, so the old `import maplibregl from "maplibre-gl"` snippet threw at load.

  The CDN browser bundle now publishes three files per version, not four: MapLibre 6.13's worker is self-contained and its `maplibre-gl-shared.mjs` is empty. Bundler users copy only `maplibre-gl-worker.mjs`.

  - @unmap/core@0.20.0
  - @unmap/geocoding@0.20.0

## 0.19.0

### Patch Changes

- @unmap/core@0.19.0
- @unmap/geocoding@0.19.0

## 0.18.0

### Patch Changes

- @unmap/core@0.18.0
- @unmap/geocoding@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [1dab6bc]
  - @unmap/geocoding@0.17.0
  - @unmap/core@0.17.0

## 0.16.0

### Minor Changes

- c3ff7f3: `unmap add` installs four more page blocks in React and Vue: `census-choropleth`, `land-treaty-inspector`, `address-playground` and `energy-explorer`. It also installs React-only items: the scroll-driven `map-story-01` template, and example blocks for single items (`map-measure-01`, `map-inspect-01`, `map-timeline-01`, `map-draw-01`, `map-compare-01`, `map-elevation-01`, `map-geojson-01`, `map-clusters-01`, `map-heatmap-01`, `map-arcs-01`, `map-flows-01`). In a Vue or Nuxt project it refuses a React-only template or example before changing anything, links its preview and setup page on unmap.dev, and for an example links the docs section of the items it is built on, which ship in Vue too. After an install it lists each item's agent page on registry.unmap.dev, and for a page block, template or example its gallery page too. When an item name is missing or unknown, the error names `llms.txt`, which says what each item is.

### Patch Changes

- @unmap/core@0.16.0
- @unmap/geocoding@0.16.0

## 0.15.0

### Minor Changes

- b82e6dc: `unmap add` installs the five blocks (`store-locator`, `directions`, `flow-map`, `elevation-explorer`, `delivery-tracker`): it wires the Nuxt key through `.env` and runtime config, moves a page into `pages/` on the Nuxt 3 layout, and says how to render a block where its page cannot go and how to pass it the key where the framework reads neither env line. `create --only` refuses a block.
- c7c9754: Support installing the business locator, local guide, public notices, and marker example registry blocks with `unmap add`. Reject React-only blocks in Vue/Nuxt projects before modifying configuration or scaffolding.

### Patch Changes

- 44f2c2c: `unmap add` knows `compare-swipe`.
- fcbc666: `unmap add` knows `map-controls`.
- aef070f: `unmap add` knows `draw`.
- 4066269: `unmap add` knows `elevation-profile`.
- fcbd102: `unmap add` knows `arc-layer` and `flow-layer`.
- 666871c: `unmap add` now knows the `route-line`, `map-layers` and `treaty-context` registry items; before, it refused them as unknown.
- f9c6a01: `unmap add` knows `geojson-layer`, `cluster-layer` and `heatmap-layer`.
- 123dcfe: `unmap add` knows `layer-legend`.
- 5a61ba9: `unmap add` knows `measure`, `feature-inspector` and `time-slider`.
  - @unmap/core@0.15.0
  - @unmap/geocoding@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [897f993]
- Updated dependencies [897f993]
- Updated dependencies [5d65d3d]
- Updated dependencies [f0f6236]
  - @unmap/geocoding@0.14.0
  - @unmap/core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [ac02791]
  - @unmap/geocoding@0.13.0
  - @unmap/core@0.13.0

## 0.12.0

### Patch Changes

- @unmap/core@0.12.0
- @unmap/geocoding@0.12.0

## 0.11.0

### Minor Changes

- 1d5e90e: Let `unmap add` install the energy and legal-land registry items, and share one MapProfile union that includes agriculture.
- 35145a6: Add `unmap geocode csv`: geocode a local CSV, with review output and resume.

  ```bash
  npx @unmap/cli geocode csv addresses.csv \
    --query-column address --output geocoded.csv --review-output review.csv
  ```

  The file stays on the machine; only the mapped column is sent. Ten `unmap_`-prefixed columns are
  appended to a copy, and every input row appears exactly once no matter what happened to it, so
  nothing is dropped quietly. `--review-output` writes the subset worth a human look: fallbacks,
  partial matches, near-ties, no-matches and failures.

  `--estimate` counts and validates the mapping with no network and no charge, and reports both
  the floor and the ceiling, because a retried row is billed per attempt. Ctrl-C checkpoints and
  `--resume` continues; the resume truncates the output to the last durably recorded byte first,
  so a crash cannot leave duplicated or missing rows. It does not claim exactly-once execution: a
  request in flight when the process died may have been served already.

  `@unmap/geocoding` gains the pieces both this and the hosted service will share: a streaming
  RFC 4180 CSV codec that handles BOMs, quoted newlines, mixed line endings and leading zeros, and
  the output schema and review rules (`classify`, `outputValues`, `resolveOutputHeader`).

### Patch Changes

- 3b80742: `unmap geocode csv` refuses two writers on one path. `--review-output` equal to `--output`, or a
  `--checkpoint` pointing at either, used to be accepted: the two writers then interleaved lines,
  their byte counts diverged from the file, and the checkpoint recorded offsets that no longer
  meant anything, so the resume was broken too. Worse than an error because it did not look like
  one.
- b937c9f: `unmap geocode csv` writes less often and checkpoints on time as well as row count.

  Output rows are buffered rather than each one being its own write syscall, which changes nothing
  about durability: a row was only ever safe once the checkpoint had fsynced and recorded its
  offset, and the buffer is flushed before every sync, so the recorded byte count is still bytes
  the kernel has.

  The checkpoint interval now has a time floor alongside its row count. "Every 200 rows" is trying
  to bound how much work a crash costs, and 200 rows is twenty seconds only at the default pace of
  ten a second. Against a local gateway or a warm cache the same rule fires in milliseconds and
  becomes a burst of fsyncs, each waiting on the disk, which measured at six seconds on a
  10,000-row run. A slow run is unaffected, because there the row rule is still the binding one.

- Updated dependencies [31fdec2]
- Updated dependencies [1d5e90e]
- Updated dependencies [31fdec2]
- Updated dependencies [35145a6]
- Updated dependencies [ed99e21]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [e881470]
- Updated dependencies [6e364e6]
- Updated dependencies [bcb5354]
- Updated dependencies [e3e7a9a]
- Updated dependencies [b2159a0]
- Updated dependencies [31fdec2]
- Updated dependencies [31fdec2]
- Updated dependencies [8c39407]
- Updated dependencies [8c39407]
- Updated dependencies [ed99e21]
- Updated dependencies [31fdec2]
- Updated dependencies [ab0ac6e]
- Updated dependencies [31fdec2]
  - @unmap/core@0.11.0
  - @unmap/geocoding@0.11.0

## 0.10.0

### Patch Changes

- @unmap/core@0.10.0

## 0.9.1

### Patch Changes

- @unmap/core@0.9.1

## 0.9.0

### Patch Changes

- @unmap/core@0.9.0

## 0.8.0

### Minor Changes

- 8a2d5a2: The `decimal` style is retired: it read as the same map as `blueprint`. `THEME_BASES` and `STYLE_NAMES` list eight styles. A theme document with `base: "decimal"`, the `flavor=decimal` URL forms and the `u03` preset code all resolve to `blueprint`, so nothing already printed breaks.
- 8b2c705: Seven new theme presets, each built to be unlike the others: `magma`, `neon`, `candy`, `ultraviolet`, `noir`, `sepia`, `ultramarine`. `THEME_PRESETS` is append-only, so every existing preset code keeps its meaning.
- 7008baa: Four new styles, sketched from CARTOColors: `tropic` (teal water, spring greens, cream land, coral highway), `sunset` (a warm duotone with indigo water), `bold` (the saturated street map) and `pastel`. `THEME_BASES` and `STYLE_NAMES` list twelve styles; the preset codes `u09` to `u0C` name them. Six new ramps ship with them: `linen`, `coral`, `peach`, `indigo`, `azure`, `amber`.

### Patch Changes

- Updated dependencies [8a2d5a2]
- Updated dependencies [8b2c705]
- Updated dependencies [7008baa]
  - @unmap/core@0.8.0

## 0.7.0

### Patch Changes

- @unmap/core@0.7.0

## 0.6.0

### Patch Changes

- 771f057: `unmap add --dry-run` on the React lane now prints a note pointing at the equivalent `npx shadcn add --dry-run <url>` form when `components.json` has no `@unmap` entry yet, since shadcn's own `--dry-run` cannot resolve `@unmap` until that entry exists.
  - @unmap/core@0.6.0

## 0.5.0

### Minor Changes

- cb664ef: `unmap create <name>` scaffolds a shadcn or shadcn-vue project with the map components, your key in the env file, and a demo page. `unmap add` now registers the `@unmap` registry and hands both lanes to `shadcn add` / `shadcn-vue add`; the Vue-lane file copier, `--dir` and `--no-install` are gone.

### Patch Changes

- 280ea9a: `unmap create`/`add` fixes: `--accent` without `--theme` now errors instead of silently doing nothing, a non-empty `.env` file gets the key appended (or left alone if already set) instead of skipped outright, creating into an existing file name errors clearly, both lanes now write the `registries["@unmap"]` entry into `components.json` themselves (shadcn's `registry add` skips a name that is already configured, so `--registry` could never rebase the namespace through it), `--dry-run` on the Vue lane prints the `shadcn-vue add` it would run rather than passing a flag shadcn-vue 2.8 rejects, and the Vue demo page imports the components from their new `components/ui/<item>` directories.
  - @unmap/core@0.5.0

## 0.4.0

### Patch Changes

- @unmap/core@0.4.0

## 0.3.0

### Patch Changes

- @unmap/core@0.3.0

## 0.2.0

### Minor Changes

- f7d6f2a: Add `unmap add <item...>`, which installs components from registry.unmap.dev into the current project. React projects are handed to `npx shadcn add`; Vue and Nuxt projects receive the registry's new plain Vue lane (`components/unmap/Unmap*.vue`, `lib/unmap/*.ts`) and have the items' npm dependencies installed with the package manager the lockfile points at.

### Patch Changes

- @unmap/core@0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".
- Updated dependencies [8853c50]
  - @unmap/core@0.1.3

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.
- Updated dependencies [300bb41]
  - @unmap/core@0.1.2

## 0.1.1

### Patch Changes

- @unmap/core@0.1.1

## 0.0.2

### Patch Changes

- Updated dependencies [93e99b5]
  - @unmap/core@0.1.0
