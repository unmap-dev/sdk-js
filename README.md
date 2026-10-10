# Unmap SDKs for JavaScript and TypeScript

Maps, geocoding, routing, elevation, and Canadian layers through one API key.
Built on MapLibre GL JS. The basemap is worldwide; geocoding and routing cover Canada.

```sh
npm install @unmap/sdk maplibre-gl
```

```ts
import { Unmap } from '@unmap/sdk'
import 'maplibre-gl/dist/maplibre-gl.css'

const unmap = new Unmap({
  key: 'YOUR_UNMAP_KEY',
  container: '#map', // an existing element with a height
  center: [-114.07, 51.05],
})
```

Get a key from the [Unmap dashboard](https://unmap.dev/dashboard).
See the [quickstart](https://unmap.dev/docs/start/quickstart),
[API documentation](https://unmap.dev/docs), and [Maps reference app](https://github.com/unmap-dev/maps).

## Packages

| Package | Purpose |
| --- | --- |
| [@unmap/sdk](packages/sdk) | Unified map and API client |
| [@unmap/core](packages/core) | Shared configuration and utilities |
| [@unmap/maps](packages/maps) | MapLibre renderer and styles |
| [@unmap/geocoding](packages/geocoding) | Search, autocomplete, reverse geocoding, places |
| [@unmap/routing](packages/routing) | Routes, matrices, travel-time areas |
| [@unmap/elevation](packages/elevation) | Elevation and profiles |
| [@unmap/themes](packages/themes) | Theme recipes, validation, and sharing codes |
| [@unmap/react](packages/react) | React hooks and provider |
| [@unmap/next](packages/next) | Next.js map component |
| [@unmap/vue](packages/vue) | Vue composables |
| [@unmap/nuxt](packages/nuxt) | Nuxt module |
| [@unmap/cli](packages/cli) | Project scaffolding and component installation |

The packages share one release version. Install the packages you need.

## Runnable examples

The [examples](examples) directory contains complete HTML pages for a map,
geocoding, and routing. Each uses the published browser SDK and asks for your own key.

```sh
python3 -m http.server 8080 --directory examples
```

Open [localhost:8080](http://localhost:8080). No build step is needed.
The [documentation gallery](https://unmap.dev/docs/guides/examples) has more examples.

## Develop

Use Node.js 24 and pnpm 10.29.3.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` builds all twelve packages, checks their types, and runs their tests.
The CLI's registry contract snapshot lets its parity tests run without the Unmap service repository.

## Contributing and releases

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
This repository is automatically exported from Unmap's product monorepo, which remains
the authoritative source during the release migration. Maintainers apply accepted changes
there and the export updates this repository. npm and CDN releases continue through the
existing trusted publishing workflow; this repository does not publish packages independently.

## License

[MIT](LICENSE). Dependencies retain their own licenses. The license covers this source code;
using the hosted Unmap API requires an API key and is subject to its service terms and quotas.
