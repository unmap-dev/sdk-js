# @unmap/react

React hooks over `@unmap/sdk`: a map bound to a ref, plus a stateful geocoder and router.
SSR-safe: the map is created in an effect on the client, and the geocoder and router never
touch the DOM. Works with React 18 and 19, in any React framework; Next.js App Router users
should install [`@unmap/next`](https://www.npmjs.com/package/@unmap/next), which adds a
server-component-safe `<Map>` on top of these hooks.

```bash
npm i @unmap/react
```

```tsx
import { useUnmap } from '@unmap/react'
import 'maplibre-gl/dist/maplibre-gl.css'

export function Map() {
  const { mapContainer, map, ready } = useUnmap({
    apiKey: 'um_live_...',
    center: [-114.07, 51.05],
  })
  return <div ref={mapContainer} style={{ height: 400 }} />
}
```

`useUnmap(options)` takes the same options as `new Unmap()` with `key` spelled `apiKey` (React
reserves `key` as a JSX prop) and no `container`. It returns `mapContainer` (a callback ref for
the element the map mounts into), `map` (`null` until mounted), `geocoder`, `router`, and
`ready` (true once the map has fired `load`). Changing `center` or `zoom` moves the existing map;
changing anything else recreates it.

`useGeocoder(options)` and `useDirections(options)` wrap the standalone clients and expose
`results` / `result`, `loading`, and `error` state that track the most recent call, alongside
the same methods as `@unmap/geocoding` (`search`, `autocomplete`, `nearby`, `reverse`) and
`@unmap/routing` (`route`, `isochrone`).

## Set the key once

Wrap the tree in `UnmapProvider` and every hook below can omit `apiKey` (and `gateway`). An
explicit option always wins over the provider, and a hook with no key from either source throws
rather than rendering an empty map.

```tsx
import { UnmapProvider } from '@unmap/react'

<UnmapProvider apiKey="um_live_...">
  <App />
</UnmapProvider>
```

## Stylesheet

MapLibre's CSS is needed for controls, attribution, markers, and popups. Import
`maplibre-gl/dist/maplibre-gl.css` once, near the root of your app. `maplibre-gl` arrives as a
transitive dependency; under pnpm's strict layout add it as a direct dependency so the import
resolves.

Docs: [unmap.dev/docs](https://unmap.dev/docs/start/overview).
