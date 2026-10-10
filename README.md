# Unmap SDKs · JavaScript & TypeScript

Add a map, search Canadian places, and calculate routes with one API key. Built on MapLibre GL JS, with TypeScript types and integrations for React, Next.js, Vue, and Nuxt. The basemap is worldwide; geocoding and routing cover Canada.

[Docs](https://unmap.dev/docs) · [Get a browser key](https://unmap.dev/dashboard) · [Runnable examples](https://github.com/unmap-dev/examples) · [Maps reference app](https://github.com/unmap-dev/maps) · [Agent prompt](AGENT_PROMPT.md)

## Your first map in under 60 seconds

Have **Git, Node.js 24+, and a browser key** ready. Allow `http://localhost:8080` on that key in the dashboard. This path uses the published SDK; it needs no package install or build.

```sh
git clone --depth 1 https://github.com/unmap-dev/sdk-js.git
cd sdk-js
node scripts/serve.mjs examples 8080
```

Open **[localhost:8080/basic-map.html](http://localhost:8080/basic-map.html)**, paste your browser key, and click **Run example**. You should see Calgary with zoom controls. The key stays in page memory; these examples do not save it. Stop the server with `Ctrl+C`.

Then try [geocoding](http://localhost:8080/geocoding.html) or [walking directions](http://localhost:8080/routing.html). Edit [`examples/basic-map.html`](examples/basic-map.html) and [`examples/example.js`](examples/example.js); refresh to see your changes. The server serves only the examples directory on your own computer.

The 60-second target starts with these prerequisites installed and your key created. CDN access and connection speed affect the first map load.

## Add Unmap to your existing app

Start with the unified SDK. You do not need to clone this repository to use it.

```sh
npm install @unmap/sdk maplibre-gl
```

Create an element with a height, then mount the map after it exists:

```html
<div id="map" style="height: 400px"></div>
```

```ts
import { Unmap, maplibregl } from '@unmap/sdk'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
const unmap = new Unmap({ key: browserKey, container: '#map', center: [-114.07, 51.05] })
```

Copy the worker from your installed MapLibre before starting the app (repeat this after upgrading MapLibre):

```sh
mkdir -p public/maplibre
cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/maplibre/
```

`browserKey` is your browser key from your application's configuration. Coordinates are **[longitude, latitude]**. On unmount, call `unmap.map?.remove()`. For bundlers that require an explicit MapLibre worker URL, follow the [worker setup](packages/sdk/README.md) or copy the worker setup from the [runnable TypeScript starter](https://github.com/unmap-dev/examples/tree/main/sdk).

You can use the API clients without creating a map:

```ts
const client = new Unmap({ key: browserKey })
const places = await client.geocoder.search('Calgary Tower')
const route = await client.router.route([-114.07, 51.05], [-114.06, 51.04], { mode: 'pedestrian' })
```

Prefer framework lifecycle handling? Start with the matching package:

| Your app | Install | Guide |
| --- | --- | --- |
| JavaScript / TypeScript | `npm install @unmap/sdk` | [SDK API and browser CDN](packages/sdk/README.md) |
| React | `npm install @unmap/react` | [Hooks and provider](packages/react/README.md) |
| Next.js | `npm install @unmap/next` | [App Router map component](packages/next/README.md) |
| Vue | `npm install @unmap/vue` | [Composables](packages/vue/README.md) |
| Nuxt | `npm install @unmap/nuxt` | [Module and runtime config](packages/nuxt/README.md) |

React and Next.js use `apiKey`; the plain SDK uses `key`. Import MapLibre's stylesheet once at the application root. See [examples](https://github.com/unmap-dev/examples) for complete projects, copied UI blocks, and templates you can adapt.

## Build with an agent

Paste this into Codex, Claude Code, Cursor, or another coding agent in your app:

```text
Add an Unmap map to this project using https://github.com/unmap-dev/sdk-js.
Read the README and the package guide matching our existing framework. Use
published @unmap packages and the smallest working integration. Give the map
an explicit height, load MapLibre CSS and its worker correctly, and clean up
on unmount. Keep my browser key in ignored environment configuration, never
in source or logs. Tell me the exact localhost origin to allow on my key.
Run the relevant checks and report the local URL and files changed.
```

[AGENT_PROMPT.md](AGENT_PROMPT.md) has a more detailed prompt; [AGENTS.md](AGENTS.md) supplies repository instructions automatically to compatible tools.

## Packages and source

| Package | Purpose |
| --- | --- |
| [@unmap/sdk](packages/sdk) | Unified map and API client |
| [@unmap/core](packages/core) | Configuration and shared utilities |
| [@unmap/maps](packages/maps) | MapLibre renderer and styles |
| [@unmap/geocoding](packages/geocoding) | Search, autocomplete, reverse geocoding, places |
| [@unmap/routing](packages/routing) | Routes, matrices, travel-time areas |
| [@unmap/elevation](packages/elevation) | Elevation and profiles |
| [@unmap/themes](packages/themes) | Theme recipes, validation, sharing codes |
| [@unmap/react](packages/react) / [@unmap/next](packages/next) | React hooks / Next.js component |
| [@unmap/vue](packages/vue) / [@unmap/nuxt](packages/nuxt) | Vue composables / Nuxt module |
| [@unmap/cli](packages/cli) | Scaffolding and component installation |

All twelve packages share a release version. Install only what you need. `examples/` contains the no-build demos; `fixtures/` contains public registry contracts used by the CLI tests.

## Work on the SDK itself

Use **Node.js 24 and pnpm 10.29.3**. With Corepack installed, `corepack enable` enables the package manager pinned by this repository. Otherwise install `pnpm@10.29.3` using your normal package-manager setup.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` builds the packages, checks types, and runs tests. It requires no API credentials. This contributor workflow takes longer than the no-build quickstart. For a focused change, use `pnpm --filter @unmap/geocoding test` or the corresponding package's scripts.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Empty map area | Give the container a nonzero height; mount after it exists; import MapLibre CSS. |
| Key or origin rejected | Use a browser key and allow the exact origin, including port. `localhost` and `127.0.0.1` are different origins. |
| Worker cannot load | Use the pinned CDN demo, or follow the worker setup in the SDK guide. Avoid mixing worker and MapLibre versions. |
| Search / routing has no result | Try the Calgary examples first; these services cover Canada. |
| Layer denied | Check the layer's required add-on and your key's enabled permissions. |
| Port occupied | Use another port in the server command and allow that origin on your key. |
| pnpm version mismatch | Run pnpm from this repository directory, where `packageManager` pins its version. |

Browser keys are visible to the browser by design; restrict their allowed origins. Keep server credentials server-side. API access uses the hosted service's terms and quotas.

## Contributing and license

[Issues](https://github.com/unmap-dev/sdk-js/issues) and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). This repository receives verified source snapshots from Unmap's product monorepo. Maintainers backport accepted upstream contributions there so the hourly sync preserves them. Your own fork can be customized normally. npm and CDN releases use Unmap's trusted publishing workflow.

Source code is [MIT](LICENSE); dependencies retain their licenses. Open-sourcing the SDK does not require running the hosted API infrastructure yourself.
