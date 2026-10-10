# @unmap/routing

Typed client for the [unmap](https://unmap.dev) routing API: point-to-point routes and
travel-time isochrones over the Canadian road graph, for driving, trucking, cycling, and walking,
plus the departure-time transit route contract. No map dependency; works in Node and the browser.

```bash
npm i @unmap/routing
```

```ts
import { Router } from '@unmap/routing'

const router = new Router({ key: 'um_live_...' })

const route = await router.route([-114.07, 51.05], [-113.99, 51.05], { mode: 'auto' })
route.distanceMeters   // integer metres
route.durationSeconds  // integer seconds
route.geometry         // GeoJSON LineString, [lng, lat] coordinates

const bands = await router.isochrone([-114.07, 51.05], { minutes: [10, 20], mode: 'pedestrian' })
bands.features         // one GeoJSON polygon per minute value
```

Coordinates are always `[lng, lat]`. `mode` is `'auto' | 'car' | 'bicycle' | 'pedestrian' | 'truck' | 'transit'` and defaults
to `'auto'`; `minutes` is required and takes up to four values of at most 120 minutes. Driving modes accept
`useHighways` (`0` avoid motorways and trunks, `1` prefer); cycling and walking accept `useHills`
(`0` avoid climbs even for a longer route, `1` indifferent) and already account for terrain
without it. Driving times do not vary with grade at all, which is Valhalla's model, so
`useHills` on a driving mode is a `400` rather than a no-op. Both methods accept an
`AbortSignal` as `signal`. A non-2xx response throws a `RouterError` carrying the HTTP `status`
and, when the body has one, `code`. An endpoint outside Canada is `422` `outside_coverage`.
A longitude or latitude outside WGS84 is `400` `invalid_location`, not that code.
A Canadian trip the graph cannot connect, including Iqaluit to the mainland, is `422` `no_route`.

Transit requires `departAt` and works on `route()` and `isochrone()`; a transit band can be a
`MultiPolygon`, and a centre with no scheduled transit nearby throws a `RouterError` with code
`outside_coverage`. Production routes the agencies `/coverage.json` lists as routing-ready. There is
no `arriveBy`, transit matrix, or realtime claim.

Parameters, response shapes, and error bodies are documented at
[unmap.dev/docs/apis/routing](https://unmap.dev/docs/apis/routing).
