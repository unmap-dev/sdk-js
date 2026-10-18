# @unmap/geocoding

Typed client for the [unmap](https://unmap.dev) geocoding API: full-text search, type-ahead
autocomplete, category search, and reverse lookup over Canadian addresses and places, with
English, French, and Indigenous-language names on the same record. No map dependency; works in
Node and the browser.

```bash
npm i @unmap/geocoding
```

```ts
import { Geocoder } from '@unmap/geocoding'

const geocoder = new Geocoder({ key: 'um_live_...' })

await geocoder.search('Château Frontenac', { lang: 'fr', limit: 5 })
await geocoder.autocomplete('rue sainte-cath', { lang: 'fr' })
await geocoder.nearby('pharmacy', { near: [-114.07, 51.05], radius: 2000 })
await geocoder.reverse(-68.517, 63.749)
await geocoder.identify({ at: [-114.07, 51.05] })
await geocoder.queryLayer({ layer: 'energy.wells', bbox: [-114.3, 50.9, -113.8, 51.2] })
```

Every method resolves to a `GeocodeResult[]`: `id`, `name`, `layer`, `lng`, `lat`, plus `score`
(search and autocomplete), `distance` in metres and `category` (nearby), `names` when the record
carries language-keyed labels, a structured `address` when one exists, and `legal_land` / `bbox`
on a survey-description hit (`layer: "legal_land"`). Pass `{ geometry: true }` to include the
polygon when the lookup row has one.

`search` and `autocomplete` take `{ limit, lang, bbox, signal }`; `nearby` takes exactly one of
`near: [lng, lat]` or `bbox`, plus `{ radius, limit, lang, signal }`; `reverse` takes
`{ lang, signal }`; `identify` takes `{ at: [lng, lat], layers?, geometry?, signal }` and
returns `{ at, results }` (default layer `municipalities`; empty until
`municipalities.copy` is baked into the Land image).
`queryLayer` takes `{ layer, bbox, limit?, geometry?, signal }` and returns
`{ layer, bbox, results }` (`GET /data/query`; tile-only catalog ids are a 501).
The SDK name is `unmap.data.query`.
`category` accepts taxonomy ids (`health.pharmacy`) or plain English or French words
(`pharmacy`, `pharmacie`), one at a time or up to eight as an array. A non-2xx response
throws a `GeocoderError` carrying the HTTP `status` and, when the body has one, `code`.
A coordinate outside Canada on `nearby` or `reverse` is status `422` and code `outside_coverage`.
A longitude or latitude outside WGS84, including a bbox corner, is status `400` and code
`bad_request`. A text search with no match is an empty list.

Parameters, defaults, the category list, and error bodies are documented at
[unmap.dev/docs/apis/geocoding](https://unmap.dev/docs/apis/geocoding).
