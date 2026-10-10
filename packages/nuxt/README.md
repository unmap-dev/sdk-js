# @unmap/nuxt

Nuxt 3 module for [unmap](https://unmap.dev). Publishes `unmap: { key, gateway }` to public
runtime config and auto-imports the `@unmap/vue` composables (`useUnmap`, `useGeocoder`,
`useDirections`) into every component.

```bash
npm i @unmap/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@unmap/nuxt'],
  unmap: { key: 'um_live_...' },
  css: ['maplibre-gl/dist/maplibre-gl.css'],
})
```

The key can also come from the environment as `NUXT_PUBLIC_UNMAP_KEY`, and the gateway as
`NUXT_PUBLIC_UNMAP_GATEWAY`. Then, in any component:

```vue
<script setup lang="ts">
const { mapContainer } = useUnmap({ key: useRuntimeConfig().public.unmap.key, center: [-73.57, 45.5] })
</script>

<template>
  <div ref="mapContainer" style="height: 400px" />
</template>
```

Add MapLibre's stylesheet once, for controls, attribution, markers, and popups:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@unmap/nuxt'],
  unmap: { key: 'um_live_...' },
  css: ['maplibre-gl/dist/maplibre-gl.css'],
})
```

`maplibre-gl` arrives as a transitive dependency; under pnpm's strict layout add it as a direct
dependency so the import resolves.

Requires Nuxt 3.13 or later. Docs: [unmap.dev/docs](https://unmap.dev/docs/start/overview).
