# @unmap/sdk

One key, the whole [unmap](https://unmap.dev) platform: a worldwide MapLibre GL basemap, Canadian
geocoding and routing, and the rest of the API behind a single `um_live_` or `um_test_` key.
The basemap supports 41 upstream Protomaps label-language tags; geocoding and routing remain
Canada-scoped. Canadian-built, privacy-first.

```bash
npm i @unmap/sdk
```

```ts
import { Unmap } from '@unmap/sdk'
import 'maplibre-gl/dist/maplibre-gl.css'

const map = new Unmap({ key: 'um_live_...', container: '#map', center: [-114.07, 51.05] })
```

That is the whole Hello World: a worldwide basemap initially centered on Calgary in the `#map`
element. Without a `container`
you still get the geocoder and router:

```ts
const unmap = new Unmap({ key: 'um_live_...' })

await unmap.geocoder.search('Calgary Tower')
await unmap.geocoder.nearby('pharmacy', { near: [-114.07, 51.05] })
await unmap.router.route([-114.07, 51.05], [-113.99, 51.05], { mode: 'bicycle' })
await unmap.router.isochrone([-114.07, 51.05], { minutes: [10, 20] })
```

The SDK also carries the departure-time transit contract:

```ts
await unmap.router.route(from, to, { mode: 'transit', departAt: new Date() })
```

`unmap.router.isochrone(near, { minutes, mode: 'transit', departAt })` draws transit travel-time
bands the same way. Production routes the agencies `/coverage.json` lists as routing-ready. The type
requires `departAt`; there is no `arriveBy`, transit matrix, or realtime claim.

Static transit data has its own release gate and client:

```ts
const stops = await unmap.transit.nearbyStops([-79.3832, 43.6532], { radius: 800 })
const departures = stops.data[0]
  ? await unmap.transit.departures(stops.data[0].id, { at: new Date(), window: 60 })
  : undefined

await unmap.transit.agencies()
await unmap.transit.getStop('um:transit:stop:ttc:1234')
await unmap.transit.getRoute('um:transit:route:ttc:1')
```

Those methods return `{ data, meta }`, where `meta` carries source, freshness and attribution.
They return a retryable `503` until a versioned GTFS release is enabled. Departures are scheduled,
including service after midnight and `calendar_dates.txt` exceptions; they are not realtime.

The named Canadian layer catalog and your own overlays:

```ts
const layers = await unmap.layers.list({ jurisdiction: 'CA-AB' })
const dls = await unmap.layers.get('survey.dls') // licence, attribution, known_gaps, addon

const { overlay } = await unmap.byod.upload(file, { name: 'Service areas' })
new Unmap({ key: 'um_live_...', container: '#map', overlays: [overlay] })
```

`upload()` returns the whole record; `overlay` is the `byod:<id>` token that `overlays` takes.
A `File` goes as multipart, a plain object as GeoJSON, raw bytes as PMTiles.

## Without a build step

The same SDK loads from a script tag, with MapLibre already inside it:

```html
<link rel="stylesheet" href="https://cdn.unmap.dev/sdk/0.20.0/unmap.css">
<div id="map" style="height: 400px"></div>
<script src="https://cdn.unmap.dev/sdk/0.20.0/unmap.js"></script>
<script>
  unmap.createMap({ key: 'um_live_...', container: '#map', center: [-114.07, 51.05] })
</script>
```

Everything above is on the `unmap` global: `unmap.Unmap`, `unmap.Geocoder`, `unmap.Router`, `unmap.maplibregl`. Pin the exact version in production; `/sdk/0.20/` follows patches and `/sdk/latest/` follows everything.

## Options

| Option      | Type                    | Notes                                                                        |
| ----------- | ----------------------- | ---------------------------------------------------------------------------- |
| `key`       | `string`                | Required.                                                                    |
| `gateway`   | `string`                | API base URL. Defaults to `https://api.unmap.dev`.                            |
| `container` | `string \| HTMLElement` | Mount a map here. Omit for geocoding and routing only.                        |
| `style`     | `string`                | `base` (default), `muted`, `outdoor`, `blueprint`, `blush`, `orchid`, `canopy`, `lagoon`, `tropic`, `sunset`, `bold`, `pastel`, or a full style URL. |
| `mode`      | `string`                | `light` or `dark`. Selects the mode of the named style.                       |
| `lang`      | `string`                | Basemap label language. Supports the 41 Protomaps language tags (including `ja`, `ko`, `zh-Hans`, and `zh-Hant`); omit to follow the browser's `Accept-Language`. |
| `theme`     | `string`                | A theme code (`u…` or `ut1.`) from [unmap.dev/create](https://unmap.dev/create). |
| `center`    | `[lng, lat]`            | Initial centre.                                                              |
| `zoom`      | `number`                | Initial zoom.                                                                |
| `projection` | `'globe' \| 'mercator'` | `'globe'` draws the map as a sphere. Defaults to `'mercator'`.              |
| `controls`  | `boolean \| { position }` | Zoom and compass buttons. `true` by default; `false` for a bare canvas.     |

The instance exposes `.map` (MapLibre GL `Map`, only with a `container`), `.geocoder`
(`@unmap/geocoding`), `.router` (`@unmap/routing`), `.transit`, `.places`, `.roads`, `.feedback`
and `.elevation`. Everything from the packages and `@unmap/maps` is re-exported here, including
`maplibregl` for markers and popups.

## Stylesheet

MapLibre's CSS is needed for controls, attribution, markers, and popups. Import
`maplibre-gl/dist/maplibre-gl.css` once, near the root of your app. `maplibre-gl` arrives as a
transitive dependency; under pnpm's strict layout add it as a direct dependency so the import
resolves.

## Web worker

MapLibre 6 parses tiles in a module worker and locates it through `import.meta.url`, which does not
reliably resolve inside a bundler's module graph. Bundler users make a one-time `setWorkerUrl()`
call after copying `maplibre-gl-worker.mjs` into their own `public/`.
Skip it and the map never finishes loading, with no error thrown and no failed request — see
[@unmap/maps](https://www.npmjs.com/package/@unmap/maps#web-worker) for the script and the call, or
[the quickstart](https://unmap.dev/docs/start/quickstart#if-the-map-never-finishes-loading).

## Docs

- [Quickstart](https://unmap.dev/docs/start/quickstart) and [Overview](https://unmap.dev/docs/start/overview)
- [Tiles & Styles](https://unmap.dev/docs/apis/maps), [Geocoding API](https://unmap.dev/docs/apis/geocoding), [Routing API](https://unmap.dev/docs/apis/routing), [Transit API](https://unmap.dev/docs/apis/transit)
- [Errors](https://unmap.dev/docs/reference/errors) and [Plans & Limits](https://unmap.dev/docs/reference/plans)

Documentation en français : [unmap.dev/fr/docs](https://unmap.dev/fr/docs/start/quickstart).
