# @unmap/themes

The data model behind custom [unmap](https://unmap.dev) map themes: the `ThemeDoc` document,
its compact `ut1.` code, the validator, and the composer the gateway uses to turn a theme into
cartography. A theme is data only, colours, bounded numbers and one enum, so it is safe to carry
on a public URL.

Most applications never import this package. Design a theme at
[unmap.dev/create](https://unmap.dev/create), copy the code, and pass it as `theme` to
`@unmap/sdk`, `@unmap/maps`, or a style URL. Install this when you generate or validate theme
codes yourself.

```bash
npm i @unmap/themes
```

```ts
import { encodeTheme, decodeTheme, validateTheme, ThemeError } from '@unmap/themes'

const code = await encodeTheme({
  v: 1,
  name: 'copper',
  base: 'outdoor',                                  // base | muted | outdoor | blueprint | blush | orchid | canopy | lagoon | tropic | sunset | bold | pastel | atlas | swiss
  light: { basemap: { water: '#9CCFD2' }, route: { color: '#B85C00', width: 4 } },
  dark:  { basemap: { water: '#12303A' }, route: { color: '#FFA24D', width: 4 } },
})
// 'u00' for a bare style, or 'ut1.eJy…' once you leave the curated set.

const doc = await decodeTheme(code)                 // validated ThemeDoc, or throws ThemeError
```

## What is in a theme

- `base` picks the style: `base`, `muted`, `outdoor`, `blueprint`, `blush`, `orchid`, `canopy`, `lagoon`, `tropic`, `sunset`, `bold`, `pastel`, `atlas` or `swiss`. Each of `light` and `dark` carries
  sparse overrides on that style, so a theme with no overrides renders exactly like the style
  itself at `/styles/<style>.json`.
- `basemap` overrides are colours on the style's recipe (land, water, vegetation, roads, labels,
  points of interest, landcover). `marker` styles the geocoding pin (`color`, `scale` 0.5 to 2).
  `route` styles the routing line (`color`, `width` 1 to 12, `opacity`, and a casing).
- Colours are `#RRGGBB` or `#RRGGBBAA`. Unknown fields, URLs, and expressions are rejected: a
  theme can never point a map at another host.

## Exports

- `encodeTheme(doc)` and `decodeTheme(code)`: async, validate on both sides, throw `ThemeError`
  with a `detail` array naming each problem. Simple themes encode as a short `u…` preset
  (three characters and up); advanced overrides stay `ut1.` + deflate. Codes are at most 4096
  characters. The `ut1` prefix is the wire version and bumps on a breaking change to the
  document format. The short codes pack a style slot and a preset index; both tables grow only
  at the end and keep their positions, and a retired slot is a tombstone that does not decode.
- `validateTheme(input)`: the synchronous validator, returns a typed `ThemeDoc`.
- `resolveTheme(doc, mode)`: what the gateway calls. Returns the style's flavor name, the
  composed colour flavor, and the resolved `marker` and `route` styles with defaults filled in.
- `STYLE_THEMES`: the shipped styles as zero-override documents.
- `generateTheme(base, seeds)` and `contrastWarnings(doc)`: the pieces the builder uses to
  derive a coherent light and dark pair from a few seed colours, and to flag label contrast
  below 4.5:1 and 3:1.
- `RECIPES`, `makeFlavor`, `THEME_BASES`, `MODES`: the shipped cartography the gateway and the
  themes are both built from.

Runs in browsers, Cloudflare Workers, and Node 18 or later (it uses the web `CompressionStream`).
Docs: [unmap.dev/docs/apis/maps](https://unmap.dev/docs/apis/maps) covers the
`?theme=` parameter and the `invalid_theme` error.
