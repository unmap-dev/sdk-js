# @unmap/vue

Vue 3 composables over `@unmap/sdk`: a map bound to a template ref, plus a reactive geocoder and
router. SSR-safe: the map is created on the client after mount, and the geocoder and router never
touch the DOM.

```bash
npm i @unmap/vue
```

```vue
<script setup lang="ts">
import { useUnmap } from '@unmap/vue'
import 'maplibre-gl/dist/maplibre-gl.css'

const { mapContainer, map, geocoder, router, ready } = useUnmap({
  key: 'um_live_...',
  center: [-114.07, 51.05],
})
</script>

<template>
  <div ref="mapContainer" style="height: 400px" />
</template>
```

`useUnmap(options)` takes the same options as `new Unmap()` (minus `container`) and returns
`mapContainer`, `map` (a shallow ref, `null` until mounted), `geocoder`, `router`, and `ready`.

`useGeocoder(options)` and `useDirections(options)` wrap the standalone clients and expose
`results` / `result`, `loading`, and `error` refs that track the most recent call, alongside
the same methods as `@unmap/geocoding` (`search`, `autocomplete`, `nearby`, `reverse`) and
`@unmap/routing` (`route`, `isochrone`).

## Stylesheet

MapLibre's CSS is needed for controls, attribution, markers, and popups. Import
`maplibre-gl/dist/maplibre-gl.css` once, near the root of your app. `maplibre-gl` arrives as a
transitive dependency; under pnpm's strict layout add it as a direct dependency so the import
resolves.

Nuxt users should install [`@unmap/nuxt`](https://www.npmjs.com/package/@unmap/nuxt), which
auto-imports these composables and reads the key from runtime config.

Requires Vue 3.4 or later. Docs: [unmap.dev/docs](https://unmap.dev/docs/start/overview).
