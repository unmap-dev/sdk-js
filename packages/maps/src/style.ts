import { styleUrl, DEFAULT_GATEWAY, type MapProfile } from "@unmap/core";

export { MAP_PROFILES, type MapProfile } from "@unmap/core";

/** The styles the gateway serves at `/styles/{style}.json`. */
export const STYLE_NAMES = [
  "base",
  "muted",
  "outdoor",
  "blueprint",
  "blush",
  "orchid",
  "canopy",
  "lagoon",
  "tropic",
  "sunset",
  "bold",
  "pastel",
  "atlas",
  "swiss",
] as const;
export type StyleName = (typeof STYLE_NAMES)[number];

/** The three launch demo cities. Viewports only — not style URL path segments. */
export const DEMO_CITIES = ["calgary", "montreal", "iqaluit"] as const;
export type DemoCity = (typeof DEMO_CITIES)[number];

export interface StyleInput {
  key: string;
  /** A style name, a full https style URL, or any other string (passed through). */
  style?: string;
  gateway?: string;
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
}

function isStyleName(s: string): s is StyleName {
  return (STYLE_NAMES as readonly string[]).includes(s);
}

/** Resolve the `style` option to a MapLibre style URL. Zero maplibre-gl dependency. */
export function unmapStyle(opts: StyleInput): string {
  const style = opts.style || "base";
  if (/^https?:\/\//.test(style) || !isStyleName(style)) return style;
  return styleUrl(opts.key, style, {
    gateway: opts.gateway,
    mode: opts.mode,
    lang: opts.lang,
    theme: opts.theme,
    overlays: opts.overlays,
    profile: opts.profile,
  });
}
