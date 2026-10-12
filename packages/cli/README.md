# @unmap/cli

Command-line starter for [unmap](https://unmap.dev). `init` verifies a key against the gateway
and writes a config file and a map-initialisation snippet into the current directory.

```bash
npx @unmap/cli init --key um_live_... --region montreal
```

Options:

- `--key <key>` (or the `UNMAP_KEY` environment variable), required.
- `--region <city>`: `calgary` (default), `montreal`, or `iqaluit`. The demo city the generated
  snippet opens on.
- `--gateway <url>`: override the API base URL.

It writes `unmap.config.json` and `unmap.init.js`, skipping either file if it already exists.
A key the gateway rejects stops the command; an unreachable gateway warns and continues.

For an application, `@unmap/sdk` is the normal starting point:
[unmap.dev/docs/start/quickstart](https://unmap.dev/docs/start/quickstart).

## `create`: a new project with a map in it

```bash
npx @unmap/cli create my-app --key um_live_...
```

Runs `npx shadcn init` (React: `next`, `vite`) or `npx shadcn-vue init` (`nuxt`, `vue`) with your
template and preset, registers the `@unmap` registry in `components.json`, adds `map`,
`geocoder`, `routing-panel` and `marker-popup`, writes the key to the framework's public env file
(`.env.local` as `NEXT_PUBLIC_UNMAP_KEY` or `VITE_UNMAP_KEY`, `.env` as `NUXT_PUBLIC_UNMAP_KEY`),
and replaces the home page with a map, a search box and a pin on Calgary. The key never lands in
source. On Vite (React or Vue) it also writes `src/vite-env.d.ts` if the template did not, so
`import.meta.env` typechecks.

Options:

- `--framework next|vite|nuxt|vue`: asked when omitted; default `next`.
- `--preset <code>`: a shadcn or shadcn-vue preset name or code, passed to `init` untouched.
- `--only <items>`: a comma-separated subset of items (`map` is always included).
- `--key <key>`: your unmap API key, or set `UNMAP_KEY`; written to the framework's public env
  file, appended if the file exists.
- `--theme <code>`: a theme from [unmap.dev/create](https://unmap.dev/create) for the demo page.
  The CLI then asks whether markers and routes take the theme's accent or your design system's
  `--primary`; `--accent theme|system` answers without a prompt (requires `--theme`).
- `--force`: scaffold into a non-empty directory.

## `add`: install registry components

```bash
npx @unmap/cli add map geocoder
```

Installs components from [registry.unmap.dev](https://registry.unmap.dev) the shadcn way. It reads
`package.json` to pick the lane, then writes `"registries": {"@unmap": "…"}` into `components.json`
itself if it is not there (keeping everything else) — on both lanes, because shadcn-vue has no
`registry add` and shadcn's skips a name that is already configured — and hands off:

- **React** (`react` or `next` in dependencies): `npx shadcn add @unmap/<item>`, against
  `…/r/{name}.json`.
- **Vue and Nuxt** (`vue` or `nuxt` in dependencies): `npx shadcn-vue add @unmap/<item>`, against
  `…/r/vue/{name}.json`.

Either CLI places the files through your aliases, rewrites imports, asks before overwriting, and
installs dependencies. Not on shadcn-vue? `@unmap/vue` and `@unmap/nuxt` provide the map, geocoder
and routing as composables for any UI.

Items: `map`, `geocoder`, `routing-panel`, `route-line`, `route-steps`, `geojson-layer`, `cluster-layer`,
`heatmap-layer`, `arc-layer`, `flow-layer`, `marker-popup`, `map-controls`, `map-themes`,
`map-context`, `map-layers`, `layer-legend`, `measure`, `feature-inspector`, `time-slider`,
`draw`, `compare-swipe`, `elevation-profile`, `store-locator`, `directions`, `flow-map`,
`elevation-explorer`, `delivery-tracker`, `census-choropleth`, `land-treaty-inspector`,
`address-playground`, `energy-explorer`, `energy-map`, `energy-layer-control`, `well-search`,
`legal-land-search`, `energy-popup`, `treaty-context`, `business-locator-01`, `local-guide-01`,
`public-notices-01`, `map-story-01`, `map-markers-01`, `map-measure-01`, `map-inspect-01`,
`map-timeline-01`, `map-draw-01`, `map-compare-01`, `map-elevation-01`, `map-geojson-01`,
`map-clusters-01`, `map-heatmap-01`, `map-arcs-01`, `map-flows-01`.
Adding a component pulls in `map-context` automatically.
Each item has a Markdown page at `registry.unmap.dev/llm/<item>.md` (Vue: `/llm/vue/<item>.md`)
with its install command, its props and, for most items, a working example, indexed by
[registry.unmap.dev/llms.txt](https://registry.unmap.dev/llms.txt). After a successful `add`, the
CLI prints the page for each item it installed in your project's lane (for a block, template or
example, its gallery page too), and it names `llms.txt` when an item name is missing or wrong.

`business-locator-01`, `local-guide-01`, `public-notices-01` and `map-story-01` are React-only
templates, and the other `map-*-01` items are React-only examples; in a Vue or Nuxt project
`unmap add` refuses them before changing anything. The refusal links the gallery page, and for an
example the docs section of the items it is built on, which ship in Vue too.

The nine from `store-locator` to `energy-explorer` are blocks: whole pages that compose the
components and run on your key. In a Next.js project, `unmap add store-locator` puts the page at
`app/store-locator/page.tsx` (or `src/app/…`) and the component in `components/ui/`, and shadcn
adds `NEXT_PUBLIC_UNMAP_KEY=` to `.env.local` or `.env`. In a Nuxt project the page lands in
`app/pages/` on the Nuxt 4 layout and in `pages/` where pages sit at the root (Nuxt 3, or Nuxt 4
without an `app/` directory), judged the way Nuxt judges it. On Nuxt, `unmap add` also writes
`NUXT_PUBLIC_UNMAP_KEY=` to `.env` unless `.env` or `.env.local` already sets it, and declares
`unmapKey` under `runtimeConfig.public` in nuxt.config, or says to when it cannot edit the file
safely. A nuxt.config that sets `srcDir` keeps the page where shadcn-vue wrote it, and the
command says so. If your framework has no page folder shadcn or shadcn-vue recognises, the page
is not installed and the command says how to render the component. `create --only` does not take
a block: create the project, then `add` the block.

Options:

- `--framework react|vue`: skip detection.
- `--registry <url>`: register a local or preview registry instead of the public one; also forces
  rewriting the `@unmap` entry even if `components.json` already names it at a different URL.
- `--overwrite`, `--dry-run`, `--yes`: passed through to the shadcn CLI. shadcn-vue 2.8 supports
  neither `--dry-run` nor `--diff` yet, so on the Vue lane `unmap add --dry-run` writes nothing at
  all — it prints the registry entry it would add and the `shadcn-vue add` it would run. On the
  React lane, a first-run `--dry-run` (no `@unmap` entry in `components.json` yet) prints a note
  pointing at the equivalent `npx shadcn add --dry-run <url>` form, because shadcn's own
  `--dry-run` cannot resolve `@unmap` until the entry actually exists.
