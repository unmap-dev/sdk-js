# @unmap/themes

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

### Minor Changes

- 1dab6bc: Breaking. `style` is the one option that names a map style: `flavor` is removed from `createMap`, `new Unmap()`, `useUnmap()` and `<Map>`, and a string that is neither a style name nor a URL is passed through unchanged. `router.isochrone`, `geocoder.reverse` and `elevation.get` send `near=lng,lat` (`POST /isochrone` sends `near`), and the React and Vue `useDirections` isochrone call names its point `near`. `parseIdentifyAt(at)` takes one argument. In `@unmap/themes`, `validateTheme` refuses retired style names, the `u03` preset code no longer decodes, and `isThemeBase` replaces `normalizeThemeBase`. `@unmap/sdk`'s coverage types read freshness and provenance from `provenance` and `freshness_status`, `freshness_basis` is `{ en, fr }`, and document-level `jurisdictions` is `string[]`.

## 0.16.0

## 0.15.0

### Minor Changes

- d15501c: Add Atlas and Swiss map styles in light and dark modes, including shareable style presets.

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.0

### Minor Changes

- 34c5674: A sixteenth theme preset, `tamarack`: the larch that turns gold across the boreal every autumn. It is the one Canadian landscape colour the set was missing, since `nature` is a green in all fifteen before it, and its cold violet accent is the only occupant of the 210 to 320 hue band. It is also the first preset to cost a fourth character: a preset code packs its index above the style slot, and index 15 clears what two base62 digits hold, so `tamarack` encodes as `u10S` on `base` rather than three characters. Every existing preset keeps its code.

## 0.9.1

## 0.9.0

### Patch Changes

- fa6c122: `pastel`'s dark water is periwinkle again. It drew cobalt[950], a near-black navy, so the style stopped matching its own name after sundown and land against water sat at 1.13. Lifting it to cobalt[800] takes that to 1.87 and frees the ground to drop to lilac[950], which stops `pastel` and `orchid` sharing an earth: twelve styles now draw twelve land colours in both modes.

## 0.8.0

### Minor Changes

- 8a2d5a2: The `decimal` style is retired: it read as the same map as `blueprint`. `THEME_BASES` and `STYLE_NAMES` list eight styles. A theme document with `base: "decimal"`, the `flavor=decimal` URL forms and the `u03` preset code all resolve to `blueprint`, so nothing already printed breaks.
- 8b2c705: Seven new theme presets, each built to be unlike the others: `magma`, `neon`, `candy`, `ultraviolet`, `noir`, `sepia`, `ultramarine`. `THEME_PRESETS` is append-only, so every existing preset code keeps its meaning.
- 7008baa: Four new styles, sketched from CARTOColors: `tropic` (teal water, spring greens, cream land, coral highway), `sunset` (a warm duotone with indigo water), `bold` (the saturated street map) and `pastel`. `THEME_BASES` and `STYLE_NAMES` list twelve styles; the preset codes `u09` to `u0C` name them. Six new ramps ship with them: `linen`, `coral`, `peach`, `indigo`, `azure`, `amber`.

### Patch Changes

- 381c1db: Twelve styles now draw twelve land colours in light, and eleven in dark. `bold` shared `base`'s lightest paper and `tropic` shared `sunset`'s lightest cream in light; `bold` and `canopy` shared `outdoor` and `base`'s grounds in dark. Every style's background/earth/scrub ladder stays intact: where a ramp had a free step the earth moved down it, and where the ramp was packed solid the ground moved to its nearest neighbour (`canopy` to the straw-tinted `linen`, `bold` to the warm `paper` its light half already sits on). `orchid` and `pastel` still share a dark ground; the one free lilac step erases pastel's coastline, so separating them is a design decision rather than a step move.
- bf28a2c: New `fern` ramp (leaf green, hue 136, verdant's lightness steps); `outdoor` draws its vegetation from it. Street styles keep `verdant`.
- 7889afc: `outdoor-light` land is warm paper (`paper[100]`) rather than near-white ink, so vegetation reads as vegetation against it.

## 0.7.0

## 0.6.0

### Minor Changes

- 5acc077: Short `u…` theme codes now pack hidden and reordered layer groups, so a style with one group
  switched off is six characters instead of a 118-character `ut1.` document. The layout was re-cut
  into one formula (style, kind, layers flag, payload, layers); codes printed by the earlier
  region-and-lane scheme no longer decode. `MAP_THEMES` in the registry carries the new codes.

## 0.5.0

## 0.4.0

## 0.3.0

### Minor Changes

- 1a5806e: Themes gain a structural half: `layers` hides or reorders the seven major layer groups (land, water, buildings, roads, boundaries, 3D buildings, labels) for both modes at once. `applyThemeLayers` applies it to an expanded style; `LAYER_GROUPS`, `DEFAULT_LAYER_VISIBILITY`, `layerGroupOf`, `isLayerVisible`, `effectiveLayerOrder` and `isStockLayers` are exported alongside. A document carrying a non-stock `layers` field always encodes as a `ut1.` code, never a short preset.

## 0.2.0

## 0.1.3

### Patch Changes

- 8853c50: Licensed under MIT. Every package declares `"license": "MIT"` and ships the LICENSE file, so
  the npm page no longer shows "License: none".

## 0.1.2

### Patch Changes

- 300bb41: Documentation only. Every package now ships a README that npm renders (install, a minimal
  example, the option and method surface, and links to the matching unmap.dev docs page), a
  first README for `@unmap/themes`, and manifest metadata npm shows: `keywords`, `homepage`,
  `repository` (with the package directory), and `bugs`. The map-bearing packages all carry the
  same note about importing MapLibre's stylesheet and pnpm's strict layout.

## 0.1.1
