# GMPRO-shape sample requests

Every file here is an `OptimizeToursRequest` body written by Unmap for these tests. None is copied
or adapted from Google's documentation, so no CC BY 4.0 attribution applies. They follow the field
names and structure of the public GMPRO REST reference (v1,
https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1) and cover the
same shapes its examples cover. Coordinates are Canadian cities, chosen by hand.

| File | Shape it covers |
| --- | --- |
| `simple.json` | One shipment with one delivery, one vehicle, no times (GMPRO's defaults apply). |
| `time-windows.json` | Hard visit time windows (including one-sided ones), vehicle start and end windows, hourly costs, a timeout. |
| `pickup-delivery.json` | Paired pickups and deliveries, labels, `displayName`, a penalty cost, `travelMode: DRIVING`, an open-ended vehicle. |
| `loads.json` | `loadDemands` and `loadLimits` with several load types, int64 as strings and numbers, `allowedVehicleIndices`, an optional pickup-only shipment. |
| `breaks.json` | `breakRule.breakRequests` with route duration, travel duration and distance limits. |
| `matrices-with-tags.json` | Caller-supplied `durationDistanceMatrices` with source and destination tags, vehicle start and end tags, visits without locations. |
| `snake-case.json` | The same kind of request with snake_case field names, including a snake_case load type name that must not be rewritten. |
| `validate-only.json` | `solvingMode: VALIDATE_ONLY`, waypoints with `location.latLng`, geodesic distances, the `unmapProfile` extension. |
| `protojson-forms.json` | Timestamps as `{seconds, nanos}` and with a UTC offset, fractional durations, the largest safe int64. |

Every sample must validate with no errors and no warnings, and must pass the emitted JSON Schema
(`test/validate.test.ts`, `test/json-schema.test.ts`). Task 7's conformance corpus reuses the
solvable ones.
