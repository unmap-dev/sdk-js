# @unmap/elevation

DEM elevation from the active unmap terrain release.

```ts
import { Elevation } from "@unmap/elevation";

const elevation = new Elevation({ key: "um_live_..." });
const [metres] = await elevation.get([-114.0719, 51.0447]);
```

Heights are metres. After global Mapterhorn activation, source datums, native resolutions and
terrain/surface models vary; this is not a uniform bare-earth DTM. Before activation or after
Canadian rollback, MRDEM reports CGVD2013 and 30 m resolution. Check `/coverage.json` for the
active release. The client keeps returning an ordered `(number | null)[]`; `null` is missing data.
Direct HTTP responses expose `datum: "mixed"`, `resolution: null`, `model: "mixed"` and sampling
metadata for Mapterhorn. Its z12 0.5 m height increment is encoding precision, not accuracy.

An unconfigured terrain archive throws `ElevationError` with status `404` and code `not_found`
(`terrain archive not configured`). A terrain tile that will not decode is status `502` and code
`upstream_error` (`elevation sample failed`). That `502` has no `Retry-After`. The client still
retries it, on its own backoff. A coordinate the archive does not cover stays `null`. An unavailable selected global release
throws status `503`, code `service_unavailable`, without falling back to another DEM.

`@unmap/sdk` exposes the same object as `unmap.elevation`. Full documentation:
<https://unmap.dev/docs/apis/elevation>.

## Sight lines

`@unmap/elevation/view` is the model the registry's `view-explorer` block runs: what a window can
see over the terrain tiles, with the Earth's curve and standard refraction. It is pure functions;
you supply the tile loader, so the browser decodes with `OffscreenCanvas` and Node with an image
library. Take the tile template from a `terrain=on` style's `raster-dem` source.

```ts
import { fanRays, groundHeights, readRay, viewShare } from "@unmap/elevation/view";

const home: [number, number] = [-114.2005, 51.0575];
const rays = fanRays(home, { from: 200, to: 305, step: 3 }, 130_000, 72);
const { ground, perRay } = await groundHeights(home, rays, loadTerrainTile);
const results = rays.map((ray, i) => readRay(ray, perRay[i]!, ground!, ground! + 4.5));
const share = viewShare(results); // 0 to 1 of the fan that reaches the mountains
```

Each tile is one billed `/terrain` call and is loaded once per `groundHeights` call however many
samples fall in it; cache tiles in your loader to share them across homes. The terrain is bare
ground in most Canadian cities, so buildings and trees do not block a view unless you add their
heights to the samples.
