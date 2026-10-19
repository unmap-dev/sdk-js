import {
  createMap,
  type Map as MaplibreMap,
  type MapProfile,
  type UnmapControlsOptions,
  type UnmapMapOptions,
} from "@unmap/maps";
import { Geocoder, Places, type IdentifyOptions, type IdentifyResponse, type QueryOptions, type QueryResponse } from "@unmap/geocoding";
import { Feedback, Roads } from "./roads";
import { Transit } from "./transit";
import { Coverage } from "./coverage";
import { Timezone } from "./timezone";
import { Byod, Catalog } from "./catalog";
import { Router } from "@unmap/routing";
import { Elevation } from "@unmap/elevation";
import type { RetryPolicy } from "@unmap/core";

export * from "@unmap/geocoding";
export * from "@unmap/routing";
export * from "@unmap/elevation";
export * from "./roads";
export * from "./transit";
export * from "./coverage";
export * from "./timezone";
export * from "./catalog";
export { createMap, unmapStyle, DEMO_CITIES, STYLE_NAMES, maplibregl } from "@unmap/maps";
export type {
  Map,
  UnmapMapOptions,
  UnmapControlsOptions,
  DemoCity,
  StyleName,
  StyleInput,
  Projection,
  MapProfile,
} from "@unmap/maps";

export interface UnmapOptions {
  key: string;
  gateway?: string;
  /** Override the fetch implementation (tests, non-global environments). */
  fetch?: typeof fetch;
  /**
   * Retry policy shared by every client on this instance. `false` disables it.
   *
   * On by default for `429`, `502`, `503` and transport failures. `Retry-After` is on a `429`
   * other than `billing_required`, and on a container `503`. A `502` has none. A wait longer
   * than `maxDelayMs` (10 s) is not slept through; the error carries `retryAfterSeconds`
   * instead, because a cold land or energy container asks for 60 and parking a request handler
   * for a minute is a worse surprise than an error. Feedback submissions are never retried:
   * they create a record and carry no idempotency key.
   */
  retry?: RetryPolicy | false;
  /** If provided, a map is mounted in this container. */
  container?: string | HTMLElement;
  style?: string;
  /** "light" or "dark", light by default. Applies to a bare style name; a `<style>-<mode>` string is passed through as written and `mode` does not change it. */
  mode?: string;
  /** Label language, e.g. "fr". Omit to follow the request's Accept-Language. */
  lang?: string;
  /** Compact `ut1.` theme code from unmap.dev/create. Wins over the path style on the gateway. */
  theme?: string;
  /** Catalog layer ids composed onto the style (`municipalities`, `survey.dls`, …). */
  overlays?: readonly string[];
  /** Composition preset. Not a style. Explicit overlays replace the profile list. */
  profile?: MapProfile;
  /** `"globe"` (the default) or `"mercator"`. See `@unmap/maps` `UnmapMapOptions.projection`. */
  projection?: UnmapMapOptions["projection"];
  center?: [number, number];
  zoom?: number;
  /** On-map controls. `true` (the default) adds zoom and compass buttons; `false` adds none. */
  controls?: boolean | UnmapControlsOptions;
}

/**
 * One Stripe-style key, the whole platform. With a `container` you get a rendered map.
 * `geocoder`, `router`, `elevation`, and `timezone` are always available.
 *
 *   const map = new Unmap({ key: "um_live_...", container: "#map", center: [-75.69, 45.42] });
 */
export class Unmap {
  readonly geocoder: Geocoder;
  readonly router: Router;
  readonly elevation: Elevation;
  /** IANA timezone and the UTC offset at an instant. One call, anywhere. */
  readonly timezone: Timezone;
  /** Canadian points of interest. Same corpus as the geocoder, in the Place shape. */
  readonly places: Places;
  /** Closures, incidents, construction and road conditions. */
  readonly roads: Roads;
  /** Report wrong data. Never metered. */
  readonly feedback: Feedback;
  /** Scheduled public-transit agencies, stops, routes and departures. */
  readonly transit: Transit;
  /**
   * Where each capability actually works. Unauthenticated and unmetered, so checking costs
   * nothing: read it before promising a user an answer, because transit routing covers only the feeds
   * marked routing-ready and road events cover two provinces.
   */
  readonly coverage: Coverage;
  /** The named Canadian layer catalog: what exists, its licence, and what it does not cover. */
  readonly layers: Catalog;
  /** Your own GeoJSON and PMTiles overlays, stored against this key. */
  readonly byod: Byod;
  readonly data: { query(opts: QueryOptions): Promise<QueryResponse> };
  readonly map?: MaplibreMap;

  constructor(opts: UnmapOptions) {
    this.geocoder = new Geocoder(opts);
    this.router = new Router(opts);
    this.elevation = new Elevation(opts);
    this.timezone = new Timezone(opts);
    this.places = new Places(opts);
    this.roads = new Roads(opts);
    this.feedback = new Feedback(opts);
    this.transit = new Transit(opts);
    this.coverage = new Coverage(opts);
    this.layers = new Catalog(opts);
    this.byod = new Byod(opts);
    this.data = { query: (queryOpts) => this.geocoder.queryLayer(queryOpts) };
    if (opts.container) {
      this.map = createMap({ ...opts, container: opts.container } as UnmapMapOptions);
    }
  }

  /** Which catalog features contain a point. See `Geocoder.identify`. */
  identify(opts: IdentifyOptions): Promise<IdentifyResponse> {
    return this.geocoder.identify(opts);
  }
}

// The shared error type and retry policy, re-exported so a caller who installed only this
// package can `catch (e) { if (e instanceof UnmapError) }` without adding @unmap/core.
export { UnmapError, parseRetryAfter, type RetryPolicy } from "@unmap/core";
