# @unmap/core

Zero-dependency helpers shared by every `@unmap/*` package: gateway URL builders and Web
Mercator tile math. Isomorphic; nothing here touches the DOM.

```bash
npm i @unmap/core
```

```ts
import { styleUrl, tileUrl, lngLatToTile, tileToBBox, DEFAULT_GATEWAY, MAX_ZOOM } from '@unmap/core'

styleUrl('um_live_...', 'muted', { mode: 'dark', lang: 'fr' })
// https://api.unmap.dev/styles/muted.json?key=…&mode=dark&lang=fr

tileUrl('um_live_...')
// https://api.unmap.dev/tiles/{z}/{x}/{y}?key=…

lngLatToTile(-114.07, 51.05, 11)   // { z: 11, x: 375, y: 685 }
tileToBBox({ z: 11, x: 375, y: 685 }) // [west, south, east, north]
```

`styleUrl` also accepts `gateway` and `theme`. `MAX_ZOOM` is 14, the depth of the tile
archive. The gateway endpoints these URLs point at are documented at
[unmap.dev/docs/apis/maps](https://unmap.dev/docs/apis/maps).
