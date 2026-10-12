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

## Optimize tours

`optimizeTours()` is Unmap Optimize (`POST /optimize`): it assigns shipments to vehicles and orders
their visits under time windows, capacities, breaks and route limits. The request is Google Route
Optimization's `OptimizeToursRequest`, camelCase or snake_case, and `response` is its
`OptimizeToursResponse`, unchanged. It is not `router.optimize()`, which orders the stops of one
vehicle.

```ts
import { optimizeTours, UnmapOptimizeError } from '@unmap/routing'

try {
  const { response, warnings, billableShipments } = await optimizeTours(
    {
      model: {
        shipments: [{ deliveries: [{ arrivalLocation: { latitude: 51.05, longitude: -114.07 } }] }],
        vehicles: [{ startLocation: { latitude: 51.04, longitude: -114.06 } }],
      },
    },
    { key: 'um_live_...' },
  )
  response.routes          // one ShipmentRoute per vehicle that was used
  response.skippedShipments
} catch (e) {
  if (e instanceof UnmapOptimizeError) console.error(e.googleStatus, e.details)
}
```

The same call is `router.optimizeTours(request)` on a `Router`, and `unmap.router.optimizeTours(request)`
from `@unmap/sdk`. The key is sent in the `X-API-Key` header, not in the URL.

What Unmap knows beyond Google's response comes back beside it, never inside it:

- `warnings`: the parsed `X-Unmap-Optimize-Warnings` header, an array of
  `{ code, field?, path?, count?, message }` for fields Unmap accepts but cannot honour, road travel
  the routing budget decided, and route polylines that could not be drawn. Empty when there are none.
- `billableShipments`: the shipments this request billed (the `X-Unmap-Billable-Shipments` header).
  `0` for `solvingMode: 'VALIDATE_ONLY'`, for a shipment re-solved within 24 hours, and when the
  header is absent.
- `timeoutClamped` and `clampedTimeoutSeconds`: whether your `timeout` was over the plan's cap, and
  the seconds the solve ran with instead.

A failure throws `UnmapOptimizeError`, which extends `UnmapError`. `status` is the HTTP status,
`code` the gateway's string code (`bad_request`, `rate_limited`, `quota_exceeded`),
`retryAfterSeconds` comes from `Retry-After`, `googleStatus` is Google's status name
(`INVALID_ARGUMENT`, `FAILED_PRECONDITION`, `RESOURCE_EXHAUSTED`) and `details` is Google's
`error.details`: a `google.rpc.BadRequest` lists each field violation, and a `PreconditionFailure`
lists the mandatory shipments no vehicle can serve. Retries follow the `retry` option, on by default
for `429`, `502`, `503` and transport failures. A failed request is never billed. Until Unmap
Optimize is enabled on the gateway, every call is a `404` with `code: 'not_found'` and no
`googleStatus`.

Parameters, response shapes, and error bodies are documented at
[unmap.dev/docs/apis/routing](https://unmap.dev/docs/apis/routing).
