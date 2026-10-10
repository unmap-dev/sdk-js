# @unmap/next

Next.js App Router integration for [unmap](https://unmap.dev). Ships a `<Map>` Client
Component and re-exports every hook from `@unmap/react`, so this is the only unmap package a
Next.js app needs to install.

```bash
npm i @unmap/next
```

The whole package is a client boundary, so a Server Component page can render the map directly
with no `'use client'` file of its own:

```tsx
// app/page.tsx
import { Map } from '@unmap/next'

export default function Page() {
  return (
    <Map
      apiKey={process.env.NEXT_PUBLIC_UNMAP_KEY!}
      center={[-114.07, 51.05]}
      zoom={11}
      containerStyle={{ height: 480 }}
    />
  )
}
```

```tsx
// app/layout.tsx
import 'maplibre-gl/dist/maplibre-gl.css'
```

`<Map>` takes the `useUnmap()` options as props (`apiKey`, `gateway`, `style`,
`mode`, `lang`, `theme`, `center`, `zoom`, `projection`, `controls`) plus `className`, `containerStyle`, `children`
(overlays, rendered above the canvas inside a `position: relative` container), and `onReady(map)`.
`onReady` is a function, so pass it from a Client Component; functions cannot cross the Server
Component boundary.

## Set the key once

Put `UnmapProvider` in the root layout and drop `apiKey` from every `<Map>` and hook below it:

```tsx
// app/layout.tsx
import { UnmapProvider } from '@unmap/next'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <UnmapProvider apiKey={process.env.NEXT_PUBLIC_UNMAP_KEY!}>{children}</UnmapProvider>
      </body>
    </html>
  )
}
```

## Hooks

`useUnmap`, `useGeocoder`, and `useDirections` are re-exported from
[`@unmap/react`](https://www.npmjs.com/package/@unmap/react) for Client Components that need
the MapLibre instance or the geocoding and routing clients with loading and error state.

## Stylesheet

Import `maplibre-gl/dist/maplibre-gl.css` once in the root layout. `maplibre-gl` arrives as a
transitive dependency; under pnpm's strict layout add it as a direct dependency so the import
resolves.

Requires Next.js 13.4 or later (App Router). Docs: [unmap.dev/docs](https://unmap.dev/docs/start/overview).
