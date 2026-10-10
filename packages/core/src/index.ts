/** unmap tile math and gateway URL helpers. Zero-dependency, isomorphic. */

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export const DEFAULT_GATEWAY = "https://api.unmap.dev";
export const MAX_ZOOM = 14;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Longitude/latitude (degrees) + zoom -> XYZ tile coordinate (Web Mercator). */
export function lngLatToTile(lng: number, lat: number, z: number): TileCoord {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { z, x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
}

/** XYZ tile -> [west, south, east, north] bounds in degrees. */
export function tileToBBox({ z, x, y }: TileCoord): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (t: number) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n)));
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

const trimGateway = (g?: string) => (g ?? DEFAULT_GATEWAY).replace(/\/+$/, "");

/** Tile-source URL template for the gateway (clients substitute {z}/{x}/{y}). */
export function tileUrl(key: string, opts: { gateway?: string } = {}): string {
  return `${trimGateway(opts.gateway)}/tiles/{z}/{x}/{y}?key=${encodeURIComponent(key)}`;
}

/** Industry composition presets. Not styles, modes, or themes. */
export const MAP_PROFILES = ["energy", "agriculture", "remote", "mining"] as const;
export type MapProfile = (typeof MAP_PROFILES)[number];

/** MapLibre style URL for a named style (`base`, `muted`, `outdoor`, `blueprint`, `blush`, `orchid`, `canopy`, `lagoon`, `tropic`, `sunset`, `bold`, `pastel`, `atlas`, `swiss`). */
export function styleUrl(
  key: string,
  style: string,
  opts: {
    gateway?: string;
    mode?: string;
    lang?: string;
    theme?: string;
    overlays?: readonly string[];
    /** Composition preset. Not a style. Explicit overlays replace the profile list. */
    profile?: MapProfile;
  } = {},
): string {
  const q = new URLSearchParams({ key });
  // Style and mode are orthogonal, so a theme toggle sets one param rather than rewriting
  // the path. It selects the light/dark half of the named style.
  if (opts.mode) q.set("mode", opts.mode);
  // Omitted rather than defaulted to "en": with no param the gateway reads Accept-Language, so
  // an embedded map lands in the reader's language without the host page asking. Sending "en"
  // here would silently override that for every visitor.
  if (opts.lang) q.set("lang", opts.lang);
  // Compact `ut1.` theme code from unmap.dev/create. The gateway validates and composes; this
  // client only forwards. A theme carries the cartography, so it wins over the path style.
  if (opts.theme) q.set("theme", opts.theme);
  // Named catalog layers composed above roads and below labels. Unknown ids 400; gated
  // overlays without the add-on 403. Omitted when empty so the style URL stays unchanged.
  if (opts.overlays && opts.overlays.length > 0) q.set("overlays", opts.overlays.join(","));
  if (opts.profile) q.set("profile", opts.profile);
  return `${trimGateway(opts.gateway)}/styles/${encodeURIComponent(style)}.json?${q}`;
}

export * from "./http";
