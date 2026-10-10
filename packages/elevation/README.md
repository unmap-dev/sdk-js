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
