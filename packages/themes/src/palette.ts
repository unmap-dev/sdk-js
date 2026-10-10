/**
 * Named colour ramps: the single source of colour truth for unmap cartography.
 *
 * Moved here from apps/gateway/src/palette.ts (which now re-exports these) so themes, the
 * gateway, and the builder all draw from one vocabulary. Flavors and theme recipes reference
 * these by name and never inline a hex literal.
 *
 * Ramps run light to dark by ascending key.
 */

/**
 * Ember. Pre-rebrand brand accent; survives only as the `street` motorway orange, which is
 * cartographic convention (orange motorways) rather than brand. Never the interface accent —
 * that is magenta, which stays out of every basemap.
 */
export const ember = {
  200: "#ffe9c9",
  300: "#ffc08c",
  400: "#f7a35c",
  500: "#f97316",
  600: "#e07b2e",
  700: "#b45309",
} as const;

/* ── Process Ink ramps ─────────────────────────────────────────────────────────────────────
 *
 *
 * Generated in OKLCH rather than picked by eye, from three hues the brand already implies:
 * cool neutrals at 212, water at 200, vegetation at 152, with one warm family at 82 for sand
 * and farmland. OKLCH matters here because a ramp picked in sRGB has uneven perceived steps —
 * two adjacent greens can look identical while two adjacent greys look like a seam.
 *
 * Lightness is chosen so the label contrast the cartography tests enforce is a property of the
 * ramp rather than something rescued per flavour afterwards. `ink.700` on `ink.25` clears 4.5:1,
 * `ink.500` on `ink.1000` clears it inverted, and every flavour's labels are drawn from those
 * steps. That is the whole reason the generator solves for lightness instead of guessing.
 *
 * Magenta is deliberately absent. It is the interface accent — markers, selection, overlays —
 * and keeping it out of the basemap is what lets a customer's data always win the colour fight.
 *
 * Regenerate rather than hand-edit: the ramp is the source, the hex is the output.
 */

/** Cool neutrals, hue 212. The spine of every Process Ink flavour except `base`. */
export const ink = {
  25: "#F1F8FA",
  50: "#EAF2F3",
  100: "#E2E9EB",
  200: "#D6DEE0",
  300: "#C9D1D3",
  400: "#B7C0C2",
  500: "#9DA7A9",
  600: "#7E888B",
  700: "#5C6769",
  800: "#3D494B",
  850: "#2B3639",
  900: "#1A2628",
  950: "#0E191C",
  1000: "#030E10",
} as const;

/**
 * Warm off-white neutrals, hue 50, chroma 0.008. The `base` pair only.
 *
 * Same lightness ladder as `ink`, re-hued to the conventional street-map land tone `base`
 * follows (`hsl(20, 20%, 95%)`): a faint warm tint rather than the cream it had, so parks,
 * water and the motorway orange read as colour against it instead of competing with it.
 */
export const paper = {
  25: "#FBF5F2",
  50: "#F5EFEC",
  100: "#ECE6E3",
  200: "#E1DBD8",
  300: "#D4CECB",
  400: "#C3BDBA",
  500: "#A9A3A0",
  600: "#8A8582",
  700: "#696361",
  800: "#4A4543",
  850: "#373330",
  900: "#272220",
  950: "#1A1614",
  1000: "#0E0B09",
} as const;

/** Water, hue 200. Cooler and more chromatic than the land it meets. */
export const wave = {
  100: "#C7F1F3",
  200: "#B3E2E4",
  300: "#9CCFD2",
  400: "#7FB8BB",
  500: "#5F9FA2",
  600: "#368286",
  700: "#1C6265",
  800: "#024347",
  900: "#002A2C",
  950: "#001C1E",
  980: "#001012",
} as const;

/**
 * Sky water, hue 230. The `base` pair only.
 *
 * Same lightness ladder as `wave`, re-hued and brightened to the Streets reference's water
 * (`hsl(200, 100%, 80%)`). `sky.200` is that colour; the rest of the ladder is the dark-mode
 * inversion and the ocean-label step.
 */
export const sky = {
  100: "#CCEEFF",
  200: "#A7E2FF",
  300: "#8ACFF0",
  400: "#73B7D7",
  500: "#5A9CBC",
  600: "#387D9C",
  700: "#155F7C",
  800: "#004057",
  900: "#002837",
  950: "#001B27",
  980: "#000F17",
} as const;

/** Vegetation, hue 152: park, wood, scrub. */
export const verdant = {
  100: "#D3F1DA",
  200: "#C3E3CA",
  300: "#AFD2B7",
  400: "#96BC9F",
  500: "#76A281",
  600: "#50825E",
  700: "#366042",
  800: "#1E4128",
  900: "#0B2815",
} as const;

/**
 * Leaf green, hue 136: `outdoor`'s vegetation (2026-09-09). `verdant` is a mint that reads cool
 * and flat once it has to stand for a forest rather than a city park; the outdoor maps people
 * already read use a yellower, fuller green. Generated from verdant's own lightness step for
 * step (chroma ×1.6, capped at 0.14 to stay in gamut), so every contrast property the ramps were
 * solved for carries over and only the hue and chroma move. Outdoor alone; the street styles
 * keep verdant, where a park is a tint and a mint is right.
 */
export const fern = {
  100: "#D3F3C5",
  200: "#C3E6B3",
  300: "#AFD59E",
  400: "#96BF83",
  500: "#76A560",
  600: "#518535",
  700: "#37621E",
  800: "#1E4305",
  900: "#0F2900",
} as const;

/** Warm landcover, hue 82: sand, beach, farmland. */
export const sandstone = {
  100: "#F5E8D0",
  200: "#E7D9BF",
  300: "#D6C7AC",
  400: "#BFAF92",
  500: "#A19070",
} as const;

/**
 * Pure neutrals, zero chroma. Everything on `muted` except its water (see `mist`), plus the
 * road casings on `base`. Kept R=G=B so `muted` is greyscale in fact rather than in name.
 */
export const graphite = {
  25: "#FAFAFA",
  50: "#F2F2F2",
  100: "#E9E9E9",
  200: "#DEDEDE",
  300: "#D1D1D1",
  400: "#BEBEBE",
  500: "#A4A4A4",
  600: "#868686",
  700: "#656565",
  800: "#464646",
  900: "#232323",
  1000: "#0B0B0B",
} as const;

/**
 * Muted water: the `wave` lightness ladder at zero chroma. `muted` is greyscale end to end,
 * water included, so this ramp exists for one reason — it is the ramp the *water* seed
 * recolours when a theme is applied to `muted`, which the land ramp (`graphite`) is not.
 * `mist.200` is the light-mode fill; `mist.980` the dark-mode inversion so water stays darker
 * than land.
 */
export const mist = {
  100: "#E7E7E7",
  200: "#D7D7D7",
  300: "#C4C4C4",
  400: "#ACACAC",
  500: "#929292",
  600: "#757575",
  700: "#575757",
  800: "#3A3A3A",
  900: "#242424",
  950: "#171717",
  980: "#0D0D0D",
} as const;

/**
 * Jade, hue 163. The emerald and mint greens of `orchid`'s woods and landcover, the parks and woods of
 * `tropic`, the woods of `bold` and the parks and scrub of `pastel`. Same lightness ladder as `ink`, so every label step the other
 * styles rely on clears the floors here too. Chroma rises with lightness up to the mid steps
 * (`0.16·L`) and eases off toward white (`0.42·(1−L)`), which is the profile of the
 * reference's own four greens (`#142a21` → `#50a882`).
 */
export const jade = {
  25: "#F1F9F4",
  50: "#E6F4ED",
  100: "#D7EEE2",
  200: "#C3E6D4",
  300: "#ACDDC4",
  400: "#8BCFAF",
  500: "#56BB90",
  600: "#459975",
  700: "#327357",
  800: "#21513D",
  850: "#173C2C",
  900: "#0E2A1E",
  950: "#071C13",
  1000: "#030F09",
} as const;

/**
 * Cobalt, hue 267. The `blueprint` pair: royal blue field with navy roads and pale blue water
 * in dark, blue lines on blue-white paper in light. Same lightness ladder as `ink`. Chroma
 * peaks at the field step (`700`, `0.23` — the reference's `#1c44dc`) and falls away on both
 * sides, so the pale steps stay paper-like and the navy steps stay ink-like.
 */
export const cobalt = {
  25: "#F4F7FB",
  50: "#ECF0F9",
  100: "#E1E8F7",
  200: "#D2DCF5",
  300: "#C0CFF3",
  400: "#A8BDF1",
  500: "#84A2EE",
  600: "#587EEA",
  700: "#2C4EE5",
  800: "#243D93",
  850: "#1D2F65",
  900: "#162241",
  950: "#0F1629",
  1000: "#080B15",
} as const;

/**
 * Rose, hue 20. The `blush` pair's land, buildings and labels: a pink that stays a field at the
 * light steps and becomes a wine at the dark ones. Same lightness ladder as `ink`; chroma rises
 * with lightness to the mid steps and eases off toward white.
 */
export const rose = {
  25: "#FFF3F3",
  50: "#FFEBEA",
  100: "#FFDFDE",
  200: "#FECFCE",
  300: "#FCBDBC",
  400: "#F8A4A4",
  500: "#E48687",
  600: "#BA6D6D",
  700: "#8D5151",
  800: "#643838",
  850: "#4B2929",
  900: "#351B1B",
  950: "#241111",
  1000: "#150808",
} as const;

/**
 * Lilac, hue 300, low chroma. The `orchid` pair's land, buildings and labels — a lavender grey
 * rather than a purple, so the vivid teal parks and sky water are what carry the colour. Chroma
 * grows a little toward the dark steps so the labels read as violet rather than as grey.
 */
export const lilac = {
  25: "#F8F5FF",
  50: "#F2EDFF",
  100: "#EAE4F9",
  200: "#DFD8EE",
  300: "#D2CBE1",
  400: "#C1BACF",
  500: "#A7A1B5",
  600: "#888296",
  700: "#676174",
  800: "#4A415A",
  850: "#382E4A",
  900: "#281C3C",
  950: "#1C0E30",
  1000: "#110225",
} as const;

/**
 * Aqua, hue 205. Vivid teal on the `wave` ladder for `orchid`'s and `lagoon`'s parks — the
 * only park colour on the map that is not a green. Chroma peaks at the mid steps.
 */
export const aqua = {
  100: "#C7F1F5",
  200: "#ACE3E9",
  300: "#89D2DB",
  400: "#57BEC9",
  500: "#00A6B3",
  600: "#00858F",
  700: "#00636B",
  800: "#004349",
  900: "#05292D",
  950: "#081B1D",
  980: "#060E0F",
} as const;

/* ── The vivid four (2026-09-09) ────────────────────────────────────────────────────────────
 *
 * `tropic`, `sunset`, `bold` and `pastel` were sketched from CARTOColors (Tropic and Temps,
 * Sunset, Bold and Vivid, Pastel). CARTO's are data palettes built to sit on a muted basemap,
 * so these styles spend the colour where overlays rarely go — water, vegetation, the highway —
 * and keep land and labels quiet. Every ramp below is an existing lightness ladder re-hued, so
 * the label floors the ladders were solved for carry over; only hue and chroma move.
 */

/** Cream neutrals, hue 90, chroma 0.022: `tropic`'s and `sunset`'s land and labels. `paper`'s ladder. */
export const linen = {
  25: "#FCF6E6",
  50: "#F6F0E0",
  100: "#EDE7D7",
  200: "#E2DCCC",
  300: "#D5CFC0",
  400: "#C4BEAF",
  500: "#AAA495",
  600: "#8B8677",
  700: "#696457",
  800: "#4B4639",
  850: "#383427",
  900: "#272317",
  950: "#1B170B",
  1000: "#0F0B03",
} as const;

/** Coral, hue 28, on `rose`'s ladder at 1.3× its chroma: the highway on `tropic`, `sunset` and `pastel`. */
export const coral = {
  25: "#FFF3F1",
  50: "#FFEBE8",
  100: "#FFDFDB",
  200: "#FFCFC8",
  300: "#FFBDB3",
  400: "#FFA195",
  500: "#F47C6E",
  600: "#C76559",
  700: "#974A42",
  800: "#6C332D",
  850: "#512520",
  900: "#391814",
  950: "#270F0C",
  1000: "#170705",
} as const;

/** Peach, hue 58, on `verdant`'s ladder: `sunset`'s vegetation, which is not green on purpose. */
export const peach = {
  100: "#FFE2CC",
  200: "#FFCEAA",
  300: "#F4B98D",
  400: "#E0A171",
  500: "#CA8248",
  600: "#AC5E0D",
  700: "#804300",
  800: "#572B00",
  900: "#361900",
} as const;

/** Indigo, hue 295, on `cobalt`'s ladder at 0.7× its chroma: `sunset`'s water and night, and the boundary purple elsewhere. */
export const indigo = {
  25: "#F7F6F9",
  50: "#F0EFF6",
  100: "#E8E6F1",
  200: "#DDD9EC",
  300: "#D0CBE6",
  400: "#C0B8DE",
  500: "#A89BD3",
  600: "#8B76C5",
  700: "#6D4BB5",
  800: "#4B3977",
  850: "#362C53",
  900: "#251F36",
  950: "#181422",
  1000: "#0C0A11",
} as const;

/** Azure, hue 245, on `wave`'s ladder at 1.7× its chroma: `bold`'s clear blue water. */
export const azure = {
  100: "#D4EBFF",
  200: "#B6DDFF",
  300: "#92CBFB",
  400: "#74B3E8",
  500: "#5299D2",
  600: "#227AB9",
  700: "#005B91",
  800: "#003D64",
  900: "#002641",
  950: "#00192D",
  980: "#000E1C",
} as const;

/** Amber, hue 85, on `ember`'s ladder: `bold`'s highway. */
export const amber = {
  200: "#FEEAC1",
  300: "#F3C96F",
  400: "#E7AF0E",
  500: "#C99700",
  600: "#C19100",
  700: "#916D00",
} as const;

/** Bay Atlas reference colours, re-authored as light/dark ramps for Canada's basemap. */
export const atlasPaper = {
  25: "#F6F3EA", 100: "#EDE7DC", 200: "#DDD4C4", 500: "#A08A70",
  700: "#786B5E", 800: "#57504A", 900: "#2A2521", 950: "#211C17", 1000: "#15110D",
} as const;
export const atlasWater = {
  200: "#B3D2E6", 400: "#86B3D4", 700: "#3E6D96", 800: "#274F73", 950: "#142B3D", 980: "#0B1C29",
} as const;
export const atlasGreen = {
  100: "#E9EFD4", 200: "#DCE8CB", 300: "#CFE4B8", 700: "#3B6B2B", 800: "#2A4822", 900: "#1B3018",
} as const;
export const atlasRoad = {
  300: "#F7D686", 400: "#E67F50", 500: "#C8412A", 600: "#A8231C", 800: "#5E1712",
} as const;
/** Swiss national-map conventions: white ground, blue water, leaf greens, yellow roads. */
export const swissPaper = {
  25: "#FDFDFE", 100: "#F2F2F2", 200: "#E6E4E2", 500: "#96938E",
  700: "#686660", 800: "#3C3C3C", 900: "#252525", 950: "#191919", 1000: "#101010",
} as const;
export const swissWater = {
  200: "#D2EEFF", 400: "#4DA4DA", 700: "#2D78A4", 800: "#205674", 950: "#152F40", 980: "#0A1B28",
} as const;
export const swissGreen = {
  100: "#D3EBC7", 200: "#C3DDB4", 300: "#8AC66C", 700: "#48792C", 800: "#2C4E22", 900: "#1B3317",
} as const;
export const swissRoad = {
  300: "#FAF39E", 400: "#F8C444", 500: "#FAB69E", 600: "#CB4D4D", 800: "#46371E",
} as const;

/** Relief inks from the references; neutral shadows avoid colouring every ridge blue. */
export const atlasRelief = { shadow: "#5B4A3B", highlight: "#FFFDF5", accent: "#7C6A58", contour: "#A8875F" } as const;
export const swissRelief = { shadow: "#4E6276", highlight: "#FFF8CD", accent: "#606C7A", contour: "#B46E0D" } as const;
