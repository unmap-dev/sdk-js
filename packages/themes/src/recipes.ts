import type { Recipe, ThemeBase, ThemeMode } from "./recipe";
import {
  atlasPaper,
  atlasWater,
  atlasGreen,
  atlasRoad,
  swissPaper,
  swissWater,
  swissGreen,
  swissRoad,
  amber,
  aqua,
  azure,
  cobalt,
  coral,
  ember,
  fern,
  indigo,
  linen,
  graphite,
  ink,
  jade,
  lilac,
  mist,
  paper,
  peach,
  rose,
  sandstone,
  sky,
  verdant,
  wave,
} from "./palette";

/**
 * The ramp families (plus ember) a recipe draws from. `buildRecipes` is parameterized on
 * this so the theme generator can re-emit the same recipes from *generated* ramps — same
 * lightness ladders, a customer's hues — while the stock `RECIPES` stay byte-identical to the
 * hand-tuned originals (they are `buildRecipes(STOCK_RAMPS)`).
 */
export interface RampSet {
  atlasPaper: typeof atlasPaper;
  atlasWater: typeof atlasWater;
  atlasGreen: typeof atlasGreen;
  atlasRoad: typeof atlasRoad;
  swissPaper: typeof swissPaper;
  swissWater: typeof swissWater;
  swissGreen: typeof swissGreen;
  swissRoad: typeof swissRoad;

  ink: typeof ink;
  paper: typeof paper;
  wave: typeof wave;
  sky: typeof sky;
  verdant: typeof verdant;
  fern: typeof fern;
  sandstone: typeof sandstone;
  graphite: typeof graphite;
  mist: typeof mist;
  jade: typeof jade;
  cobalt: typeof cobalt;
  rose: typeof rose;
  lilac: typeof lilac;
  aqua: typeof aqua;
  ember: typeof ember;
  linen: typeof linen;
  coral: typeof coral;
  peach: typeof peach;
  indigo: typeof indigo;
  azure: typeof azure;
  amber: typeof amber;
}

export const STOCK_RAMPS: RampSet = {
  atlasPaper,
  atlasWater,
  atlasGreen,
  atlasRoad,
  swissPaper,
  swissWater,
  swissGreen,
  swissRoad,

  ink,
  paper,
  wave,
  sky,
  verdant,
  fern,
  sandstone,
  graphite,
  mist,
  jade,
  cobalt,
  rose,
  lilac,
  aqua,
  ember,
  linen,
  coral,
  peach,
  indigo,
  azure,
  amber,
};

/*
 * The shipped Process Ink recipes as data, moved from apps/gateway/src/flavors.ts.
 * These are the styles a ThemeDoc's sparse overrides merge onto. Colour comes from the
 * ramps in ./palette and never a hex literal here, except pure white road fills.
 */

/** Build the shipped recipes from a ramp set. Stock ramps in → the shipped cartography out. */
export function buildRecipes(
  r: RampSet,
): Record<ThemeBase, Record<ThemeMode, Recipe>> {
  /**
   * `base` / `light`. The general-purpose map, following the conventions of a street map
   * rather than any one product: a faintly warm off-white land (`paper`, hue 50), parks and woods in a
   * light green that still reads as green, sky-blue water, white roads with cool grey casings, and the
   * motorway drawn in orange — the one cartographic convention allowed to carry warmth.
   * Boundaries and aerodromes take a lavender from `cobalt` the way street maps give them a
   * purple, so they never read as roads. Full road hierarchy and visible buildings stay; this
   * is the map someone gets when they have not chosen one, so it errs towards legible over
   * quiet.
   *
   * Streets' blue-grey neighbourhood labels and its blue water labels both miss the contrast
   * floors on their backgrounds, so labels keep the contrast-safe `paper` and `sky` steps.
   */
  const BASE_LIGHT: Recipe = {
    background: r.paper[100],
    earth: r.paper[25],
    water: r.sky[200],
    parkA: r.verdant[200],
    parkB: r.verdant[300],
    woodA: r.verdant[200],
    woodB: r.verdant[300],
    scrubA: r.verdant[200],
    scrubB: r.verdant[300],
    sand: r.sandstone[200],
    beach: r.sandstone[200],
    glacier: r.paper[25],
    institutional: r.paper[100],
    pedestrian: r.paper[100],
    aerodrome: r.cobalt[200],
    runway: r.cobalt[300],
    pier: r.paper[300],
    buildings: r.paper[200],
    railway: r.graphite[400],
    boundaries: r.cobalt[600],
    roads: {
      other: r.paper[100],
      otherCasing: r.graphite[200],
      minor: "#FFFFFF",
      minorCasing: r.graphite[200],
      service: r.paper[100],
      serviceCasing: r.graphite[200],
      major: "#FFFFFF",
      majorCasing: r.graphite[300],
      highway: r.ember[400],
      highwayCasing: r.ember[600],
      link: r.ember[300],
      linkCasing: r.ember[500],
    },
    tunnelFill: r.paper[200],
    tunnelCasing: r.graphite[200],
    bridgeCasing: r.graphite[400],
    labels: {
      city: r.paper[1000],
      cityHalo: r.paper[25],
      state: r.paper[700],
      stateHalo: r.paper[25],
      country: r.paper[700],
      subplace: r.paper[700],
      subplaceHalo: r.paper[25],
      address: r.paper[700],
      addressHalo: r.paper[25],
      roadMinor: r.paper[800],
      roadMinorHalo: r.paper[25],
      roadMajor: r.paper[900],
      roadMajorHalo: r.paper[25],
      ocean: r.sky[800],
    },

    pois: {
      blue: "#2D6E8F",
      green: r.verdant[700],
      lapis: "#3F5C93",
      pink: "#8F4A6B",
      red: "#9B4340",
      slategray: r.paper[700],
      tangerine: "#8F5322",
      turquoise: r.sky[700],
    },
    landcover: {
      grassland: r.verdant[200],
      barren: r.sandstone[200],
      urban_area: r.paper[50],
      farmland: r.verdant[100],
      glacier: r.paper[25],
      scrub: r.verdant[200],
      forest: r.verdant[300],
    },
  };

  /**
   * `base` / `dark`. The same map inverted, with the inversion that matters: water is drawn
   * *darker* than land. Two mid-tones meeting at a coastline is how a dark basemap turns to
   * mud, so the figure/ground edge is bought with lightness rather than hue. The motorway keeps
   * its orange, one step deeper.
   */
  const BASE_DARK: Recipe = {
    background: r.paper[950],
    earth: r.paper[900],
    water: r.sky[980],
    parkA: r.verdant[800],
    parkB: r.verdant[700],
    woodA: r.verdant[800],
    woodB: r.verdant[700],
    scrubA: r.verdant[900],
    scrubB: r.verdant[800],
    sand: r.sandstone[500],
    beach: r.sandstone[500],
    glacier: r.paper[700],
    institutional: r.paper[950],
    pedestrian: r.paper[950],
    aerodrome: r.cobalt[900],
    runway: r.cobalt[850],
    pier: r.paper[850],
    buildings: r.paper[850],
    railway: r.paper[700],
    boundaries: r.cobalt[500],
    roads: {
      other: r.paper[850],
      otherCasing: r.paper[1000],
      minor: r.paper[800],
      minorCasing: r.paper[1000],
      service: r.paper[850],
      serviceCasing: r.paper[1000],
      major: r.paper[700],
      majorCasing: r.paper[1000],
      highway: r.ember[600],
      highwayCasing: r.paper[1000],
      link: r.ember[700],
      linkCasing: r.paper[1000],
    },
    tunnelFill: r.paper[900],
    tunnelCasing: r.paper[1000],
    bridgeCasing: r.paper[1000],
    labels: {
      city: r.paper[100],
      cityHalo: r.paper[1000],
      state: r.paper[500],
      stateHalo: r.paper[1000],
      country: r.paper[500],
      subplace: r.paper[500],
      subplaceHalo: r.paper[1000],
      address: r.paper[500],
      addressHalo: r.paper[1000],
      roadMinor: r.paper[500],
      roadMinorHalo: r.paper[1000],
      roadMajor: r.paper[400],
      roadMajorHalo: r.paper[1000],
      ocean: r.sky[400],
    },

    pois: {
      blue: "#7FC4E8",
      green: r.verdant[400],
      lapis: "#8FB0EA",
      pink: "#E3A0C0",
      red: "#EE968F",
      slategray: r.paper[500],
      tangerine: "#E8AC7C",
      turquoise: r.sky[400],
    },
    landcover: {
      grassland: r.verdant[800],
      barren: r.sandstone[500],
      urban_area: r.paper[950],
      farmland: r.verdant[900],
      glacier: r.paper[700],
      scrub: r.verdant[900],
      forest: r.verdant[700],
    },
  };

  /**
   * `muted` / `light`. Greyscale end to end, after Mapbox Standard's monochrome theme: a
   * near-white field, parks and buildings a step or two down the same grey, white roads with
   * grey casings, grey water, grey labels, grey icons (its own sprite sheet). The style exists
   * so external data can be drawn over it without an arms race: nothing on the map carries a
   * hue, so an overlay in any colour is the only colour there is.
   *
   * Water is drawn from `mist`, a zero-chroma twin of the water ladder, rather than from
   * `graphite`: same greys, but it is the ramp the water seed recolours when someone applies
   * a theme to `muted`.
   */
  const MUTED_LIGHT: Recipe = {
    background: r.graphite[100],
    earth: r.graphite[25],
    water: r.mist[200],
    parkA: r.graphite[50],
    parkB: r.graphite[100],
    woodA: r.graphite[50],
    woodB: r.graphite[100],
    scrubA: r.graphite[50],
    scrubB: r.graphite[100],
    sand: r.graphite[100],
    beach: r.graphite[100],
    glacier: r.graphite[25],
    institutional: r.graphite[100],
    pedestrian: r.graphite[50],
    aerodrome: r.graphite[100],
    runway: r.graphite[200],
    pier: r.graphite[200],
    buildings: r.graphite[100],
    railway: r.graphite[400],
    boundaries: r.graphite[500],
    roads: {
      other: r.graphite[25],
      otherCasing: r.graphite[200],
      minor: "#FFFFFF",
      minorCasing: r.graphite[200],
      service: r.graphite[25],
      serviceCasing: r.graphite[200],
      major: "#FFFFFF",
      majorCasing: r.graphite[300],
      highway: r.graphite[200],
      highwayCasing: r.graphite[300],
      link: "#FFFFFF",
      linkCasing: r.graphite[300],
    },
    tunnelFill: r.graphite[100],
    tunnelCasing: r.graphite[200],
    bridgeCasing: r.graphite[400],
    labels: {
      city: r.graphite[1000],
      cityHalo: r.graphite[25],
      state: r.graphite[700],
      stateHalo: r.graphite[25],
      country: r.graphite[700],
      subplace: r.graphite[700],
      subplaceHalo: r.graphite[25],
      address: r.graphite[700],
      addressHalo: r.graphite[25],
      roadMinor: r.graphite[700],
      roadMinorHalo: r.graphite[25],
      roadMajor: r.graphite[800],
      roadMajorHalo: r.graphite[25],
      ocean: r.graphite[800],
    },

    pois: {
      blue: r.graphite[600],
      green: r.graphite[600],
      lapis: r.graphite[700],
      pink: r.graphite[600],
      red: r.graphite[700],
      slategray: r.graphite[700],
      tangerine: r.graphite[600],
      turquoise: r.graphite[600],
    },
    landcover: {
      grassland: r.graphite[50],
      barren: r.graphite[100],
      urban_area: r.graphite[50],
      farmland: r.graphite[50],
      glacier: r.graphite[25],
      scrub: r.graphite[50],
      forest: r.graphite[100],
    },
  };

  /**
   * `muted` / `dark`. The greyscale pair inverted: water sits below the land, roads stay the
   * brightest thing on the map, same hierarchy as light.
   */
  const MUTED_DARK: Recipe = {
    background: r.graphite[1000],
    earth: r.graphite[900],
    water: r.mist[980],
    parkA: r.graphite[900],
    parkB: r.graphite[800],
    woodA: r.graphite[900],
    woodB: r.graphite[800],
    scrubA: r.graphite[900],
    scrubB: r.graphite[800],
    sand: r.graphite[800],
    beach: r.graphite[800],
    glacier: r.graphite[700],
    institutional: r.graphite[900],
    pedestrian: r.graphite[900],
    aerodrome: r.graphite[900],
    runway: r.graphite[800],
    pier: r.graphite[800],
    buildings: r.graphite[800],
    railway: r.graphite[700],
    boundaries: r.graphite[600],
    roads: {
      other: r.graphite[800],
      otherCasing: r.graphite[1000],
      minor: r.graphite[700],
      minorCasing: r.graphite[1000],
      service: r.graphite[800],
      serviceCasing: r.graphite[1000],
      major: r.graphite[600],
      majorCasing: r.graphite[1000],
      highway: r.graphite[500],
      highwayCasing: r.graphite[1000],
      link: r.graphite[600],
      linkCasing: r.graphite[1000],
    },
    tunnelFill: r.graphite[900],
    tunnelCasing: r.graphite[1000],
    bridgeCasing: r.graphite[1000],
    labels: {
      city: r.graphite[100],
      cityHalo: r.graphite[1000],
      state: r.graphite[500],
      stateHalo: r.graphite[1000],
      country: r.graphite[500],
      subplace: r.graphite[500],
      subplaceHalo: r.graphite[1000],
      address: r.graphite[500],
      addressHalo: r.graphite[1000],
      roadMinor: r.graphite[500],
      roadMinorHalo: r.graphite[1000],
      roadMajor: r.graphite[400],
      roadMajorHalo: r.graphite[1000],
      ocean: r.graphite[400],
    },

    pois: {
      blue: r.graphite[400],
      green: r.graphite[400],
      lapis: r.graphite[500],
      pink: r.graphite[400],
      red: r.graphite[500],
      slategray: r.graphite[500],
      tangerine: r.graphite[400],
      turquoise: r.graphite[400],
    },
    landcover: {
      grassland: r.graphite[900],
      barren: r.graphite[800],
      urban_area: r.graphite[900],
      farmland: r.graphite[900],
      glacier: r.graphite[700],
      scrub: r.graphite[900],
      forest: r.graphite[800],
    },
  };

  /**
   * `outdoor` / `light`. Terrain-first scenic: the map you use to look at ground rather than to
   * find an address.
   *
   * Land sits a step lighter than `base` on purpose: a hillshade is composited beneath the roads
   * with a multiply blend, which only ever darkens, so the lift is the headroom that shading
   * spends. Rendered without a DEM it will look flat and slightly washed — that is the tell that
   * the terrain source is missing, not a palette bug. See `terrain.ts`.
   *
   * **Landcover stops receding.** Every other flavour keeps ground cover near-neutral so a
   * customer's data wins. Here the ground cover *is* the content, so forest, scrub and grassland
   * separate across `verdant` instead of collapsing into one field.
   *
   * **Protected land reads as protected.** `park` steps a tone deeper than generic vegetation, so a
   * national park is distinguishable from the golf course that `landuse_park` files beside it.
   *
   * **Roads recede one step**, via their casings rather than their fills: a lighter casing on a
   * white road keeps the shape legible while surrendering the contrast fight to the terrain.
   * Labels and halos keep the same contrast-safe `ink` steps as `base`, which is what keeps the
   * enforced contrast floors satisfied — the ramps are solved against those, and re-deriving them
   * for one flavour would be re-solving a problem that is already solved.
   */
  const OUTDOOR_LIGHT: Recipe = {
    background: r.ink[200],
    // Warm paper, not the near-white ink the style launched on (2026-09-09): a green reads as
    // vegetation against warm land and as a polygon against white, which is the difference
    // between an outdoor map and a diagram. Mapbox Outdoors' land is hsl(60, 20%, 85%).
    earth: r.paper[100],
    water: r.wave[300],
    parkA: r.fern[300],
    parkB: r.fern[400],
    woodA: r.fern[300],
    woodB: r.fern[400],
    scrubA: r.fern[200],
    scrubB: r.fern[300],
    sand: r.sandstone[300],
    beach: r.sandstone[300],
    glacier: r.ink[25],
    institutional: r.ink[25],
    pedestrian: r.ink[50],
    aerodrome: r.ink[50],
    runway: r.ink[200],
    pier: r.ink[300],
    // A step lighter than `base`: outdoors, the building footprint is context, not content.
    buildings: r.ink[200],
    railway: r.ink[500],
    boundaries: r.ink[600],
    roads: {
      other: r.ink[50],
      otherCasing: r.ink[200],
      minor: r.ink[25],
      minorCasing: r.ink[200],
      service: r.ink[50],
      serviceCasing: r.ink[200],
      major: "#FFFFFF",
      majorCasing: r.ink[300],
      highway: "#FFFFFF",
      highwayCasing: r.ink[400],
      link: "#FFFFFF",
      linkCasing: r.ink[300],
    },
    tunnelFill: r.ink[200],
    tunnelCasing: r.ink[300],
    bridgeCasing: r.ink[400],
    labels: {
      city: r.ink[1000],
      cityHalo: r.ink[25],
      state: r.ink[700],
      stateHalo: r.ink[25],
      country: r.ink[700],
      subplace: r.ink[700],
      subplaceHalo: r.ink[25],
      address: r.ink[700],
      addressHalo: r.ink[25],
      roadMinor: r.ink[700],
      roadMinorHalo: r.ink[25],
      roadMajor: r.ink[800],
      roadMajorHalo: r.ink[25],
      ocean: r.wave[800],
    },

    pois: {
      blue: "#2D6E8F",
      // Peaks, parks, forests and gardens all come through green. On this flavour they are the
      // POIs worth finding, so it carries a full step more weight than elsewhere.
      green: r.fern[800],
      lapis: "#3F5C93",
      pink: "#8F4A6B",
      red: "#9B4340",
      slategray: r.ink[700],
      tangerine: "#8F5322",
      turquoise: r.wave[700],
    },
    landcover: {
      grassland: r.fern[200],
      barren: r.sandstone[300],
      urban_area: r.ink[100],
      farmland: r.sandstone[200],
      glacier: r.ink[25],
      scrub: r.fern[300],
      forest: r.fern[400],
    },
  };

  /**
   * `outdoor` / `dark`. The same three divergences, inverted: the land sits darker to leave room
   * *above* it for a hillshade highlight to do the modelling.
   *
   * Vegetation lifts rather than deepens here. On a dark basemap a deeper green is indistinguishable
   * from the land it sits on, so the separation that `light` gets by going darker, `dark` gets by
   * going lighter — the same intent through the opposite move.
   */
  const OUTDOOR_DARK: Recipe = {
    background: r.ink[1000],
    earth: r.ink[950],
    water: r.wave[980],
    parkA: r.fern[700],
    parkB: r.fern[600],
    woodA: r.fern[700],
    woodB: r.fern[600],
    scrubA: r.fern[800],
    scrubB: r.fern[700],
    sand: r.sandstone[500],
    beach: r.sandstone[500],
    glacier: r.ink[700],
    institutional: r.ink[1000],
    pedestrian: r.ink[950],
    aerodrome: r.ink[950],
    runway: r.ink[850],
    pier: r.ink[850],
    buildings: r.ink[900],
    railway: r.ink[700],
    boundaries: r.ink[600],
    roads: {
      // The minor tier recedes toward `earth`; majors and highways hold their contrast,
      // because a road you cannot see is a different failure from a road that is merely quiet.
      other: r.ink[900],
      otherCasing: r.ink[1000],
      minor: r.ink[850],
      minorCasing: r.ink[1000],
      service: r.ink[900],
      serviceCasing: r.ink[1000],
      major: r.ink[700],
      majorCasing: r.ink[1000],
      highway: r.ink[600],
      highwayCasing: r.ink[1000],
      link: r.ink[700],
      linkCasing: r.ink[1000],
    },
    tunnelFill: r.ink[900],
    tunnelCasing: r.ink[1000],
    bridgeCasing: r.ink[1000],
    labels: {
      city: r.ink[100],
      cityHalo: r.ink[1000],
      state: r.ink[500],
      stateHalo: r.ink[1000],
      country: r.ink[500],
      subplace: r.ink[500],
      subplaceHalo: r.ink[1000],
      address: r.ink[500],
      addressHalo: r.ink[1000],
      roadMinor: r.ink[500],
      roadMinorHalo: r.ink[1000],
      roadMajor: r.ink[400],
      roadMajorHalo: r.ink[1000],
      ocean: r.wave[400],
    },

    pois: {
      blue: "#7FC4E8",
      green: r.fern[300],
      lapis: "#8FB0EA",
      pink: "#E3A0C0",
      red: "#EE968F",
      slategray: r.ink[500],
      tangerine: "#E8AC7C",
      turquoise: r.wave[400],
    },
    landcover: {
      grassland: r.fern[700],
      barren: r.sandstone[500],
      urban_area: r.ink[950],
      farmland: r.fern[900],
      glacier: r.ink[700],
      scrub: r.fern[800],
      forest: r.fern[600],
    },
  };

  /**
   * `blueprint` / `light`. The print, not the plate: blue-white paper, pale blue water, roads
   * as blue lines with a white casing that darken up the hierarchy, labels in the deep blues.
   */
  const BLUEPRINT_LIGHT: Recipe = {
    background: r.cobalt[100],
    earth: r.cobalt[25],
    water: r.cobalt[200],
    parkA: r.cobalt[50],
    parkB: r.cobalt[100],
    woodA: r.cobalt[50],
    woodB: r.cobalt[100],
    scrubA: r.cobalt[50],
    scrubB: r.cobalt[100],
    sand: r.cobalt[50],
    beach: r.cobalt[50],
    glacier: r.cobalt[25],
    institutional: r.cobalt[50],
    pedestrian: r.cobalt[50],
    aerodrome: r.cobalt[50],
    runway: r.cobalt[200],
    pier: r.cobalt[200],
    buildings: r.cobalt[100],
    railway: r.cobalt[500],
    boundaries: r.cobalt[600],
    roads: {
      other: r.cobalt[200],
      otherCasing: r.cobalt[25],
      minor: r.cobalt[300],
      minorCasing: r.cobalt[25],
      service: r.cobalt[200],
      serviceCasing: r.cobalt[25],
      major: r.cobalt[400],
      majorCasing: r.cobalt[25],
      highway: r.cobalt[500],
      highwayCasing: r.cobalt[25],
      link: r.cobalt[400],
      linkCasing: r.cobalt[25],
    },
    tunnelFill: r.cobalt[100],
    tunnelCasing: r.cobalt[200],
    bridgeCasing: r.cobalt[600],
    labels: {
      city: r.cobalt[1000],
      cityHalo: r.cobalt[25],
      state: r.cobalt[700],
      stateHalo: r.cobalt[25],
      country: r.cobalt[700],
      subplace: r.cobalt[700],
      subplaceHalo: r.cobalt[25],
      address: r.cobalt[700],
      addressHalo: r.cobalt[25],
      roadMinor: r.cobalt[700],
      roadMinorHalo: r.cobalt[25],
      roadMajor: r.cobalt[800],
      roadMajorHalo: r.cobalt[25],
      ocean: r.cobalt[800],
    },

    pois: {
      blue: r.cobalt[700],
      green: r.cobalt[700],
      lapis: r.cobalt[700],
      pink: r.cobalt[700],
      red: r.cobalt[700],
      slategray: r.cobalt[700],
      tangerine: r.cobalt[700],
      turquoise: r.cobalt[700],
    },
    landcover: {
      grassland: r.cobalt[50],
      barren: r.cobalt[50],
      urban_area: r.cobalt[50],
      farmland: r.cobalt[50],
      glacier: r.cobalt[25],
      scrub: r.cobalt[50],
      forest: r.cobalt[100],
    },
  };

  /**
   * `blueprint` / `dark`. The native mode, modelled on the "Cartogram" look: a royal blue
   * field (`cobalt.700`), parks and buildings one lighter blue, water lighter still, and roads
   * as navy lines with a pale casing — ink on a blueprint. This is the one dark mode where
   * water is *lighter* than land, on purpose: the reference draws it that way, and a blueprint
   * with dark water would just be a night map. Labels are the palest steps; `state` sits one
   * step lighter than the reference's `#b9c6f5` because that grey-blue misses 4.5:1 on the
   * field.
   */
  const BLUEPRINT_DARK: Recipe = {
    background: r.cobalt[700],
    earth: r.cobalt[700],
    water: r.cobalt[400],
    parkA: r.cobalt[600],
    parkB: r.cobalt[600],
    woodA: r.cobalt[600],
    woodB: r.cobalt[600],
    scrubA: r.cobalt[600],
    scrubB: r.cobalt[600],
    sand: r.cobalt[600],
    beach: r.cobalt[600],
    glacier: r.cobalt[500],
    institutional: r.cobalt[600],
    pedestrian: r.cobalt[700],
    aerodrome: r.cobalt[600],
    runway: r.cobalt[800],
    pier: r.cobalt[800],
    buildings: r.cobalt[600],
    railway: r.cobalt[400],
    boundaries: r.cobalt[300],
    roads: {
      other: r.cobalt[800],
      otherCasing: r.cobalt[700],
      minor: r.cobalt[850],
      minorCasing: r.cobalt[600],
      service: r.cobalt[800],
      serviceCasing: r.cobalt[700],
      major: r.cobalt[900],
      majorCasing: r.cobalt[600],
      highway: r.cobalt[950],
      highwayCasing: r.cobalt[500],
      link: r.cobalt[900],
      linkCasing: r.cobalt[600],
    },
    tunnelFill: r.cobalt[800],
    tunnelCasing: r.cobalt[700],
    bridgeCasing: r.cobalt[500],
    labels: {
      city: r.cobalt[25],
      cityHalo: r.cobalt[700],
      state: r.cobalt[200],
      stateHalo: r.cobalt[700],
      country: r.cobalt[200],
      subplace: r.cobalt[300],
      subplaceHalo: r.cobalt[700],
      address: r.cobalt[300],
      addressHalo: r.cobalt[700],
      roadMinor: r.cobalt[300],
      roadMinorHalo: r.cobalt[700],
      roadMajor: r.cobalt[100],
      roadMajorHalo: r.cobalt[700],
      ocean: r.cobalt[900],
    },

    pois: {
      blue: r.cobalt[200],
      green: r.cobalt[200],
      lapis: r.cobalt[200],
      pink: r.cobalt[200],
      red: r.cobalt[200],
      slategray: r.cobalt[200],
      tangerine: r.cobalt[200],
      turquoise: r.cobalt[200],
    },
    landcover: {
      grassland: r.cobalt[600],
      barren: r.cobalt[600],
      urban_area: r.cobalt[700],
      farmland: r.cobalt[600],
      glacier: r.cobalt[500],
      scrub: r.cobalt[600],
      forest: r.cobalt[600],
    },
  };

  /**
   * `blush` / `light`. After Protomaps' *dusk rose*: a pink land on a peach ground, peach
   * roads that read as gaps in the pink rather than as lines, and buildings in the deepest
   * rose on the map. Parks and woods keep a soft green so the whole thing does not turn into
   * a single wash. Labels take the dark rose steps because the reference's grey-browns miss
   * the floors.
   */
  const BLUSH_LIGHT: Recipe = {
    background: r.ember[200],
    earth: r.rose[300],
    water: r.ember[200],
    parkA: r.verdant[300],
    parkB: r.verdant[400],
    woodA: r.verdant[300],
    woodB: r.verdant[400],
    scrubA: r.sandstone[200],
    scrubB: r.sandstone[300],
    sand: r.sandstone[200],
    beach: r.sandstone[100],
    glacier: r.rose[100],
    institutional: r.rose[200],
    pedestrian: r.lilac[200],
    aerodrome: r.rose[200],
    runway: r.ember[200],
    pier: r.sandstone[300],
    buildings: r.rose[500],
    railway: r.sandstone[100],
    boundaries: r.rose[700],
    roads: {
      other: r.ember[200],
      otherCasing: r.rose[300],
      minor: r.ember[200],
      minorCasing: r.rose[300],
      service: r.ember[200],
      serviceCasing: r.rose[300],
      major: r.ember[200],
      majorCasing: r.rose[400],
      highway: "#FFFFFF",
      highwayCasing: r.rose[400],
      link: r.ember[200],
      linkCasing: r.rose[400],
    },
    tunnelFill: r.rose[200],
    tunnelCasing: r.rose[300],
    bridgeCasing: r.rose[500],
    labels: {
      city: r.paper[1000],
      cityHalo: r.rose[25],
      state: r.rose[800],
      stateHalo: r.rose[25],
      country: r.rose[800],
      subplace: r.rose[700],
      subplaceHalo: r.rose[25],
      address: r.rose[800],
      addressHalo: r.rose[25],
      roadMinor: r.rose[800],
      roadMinorHalo: r.rose[25],
      roadMajor: r.rose[850],
      roadMajorHalo: r.rose[25],
      ocean: r.ember[700],
    },

    pois: {
      blue: r.cobalt[700],
      green: r.verdant[700],
      lapis: r.cobalt[700],
      pink: r.rose[700],
      red: r.rose[700],
      slategray: r.rose[700],
      tangerine: r.ember[700],
      turquoise: r.sky[700],
    },
    landcover: {
      grassland: r.verdant[300],
      barren: r.sandstone[200],
      urban_area: r.rose[400],
      farmland: r.verdant[200],
      glacier: r.rose[100],
      scrub: r.verdant[200],
      forest: r.verdant[400],
    },
  };

  /**
   * `blush` / `dark`. Wine instead of pink: the same rose family at its dark steps, water a
   * shade below the land, roads brightening up the hierarchy, buildings one step lighter than
   * the field.
   */
  const BLUSH_DARK: Recipe = {
    background: r.rose[1000],
    earth: r.rose[900],
    water: r.rose[1000],
    parkA: r.verdant[800],
    parkB: r.verdant[700],
    woodA: r.verdant[800],
    woodB: r.verdant[700],
    scrubA: r.verdant[900],
    scrubB: r.verdant[800],
    sand: r.sandstone[500],
    beach: r.sandstone[400],
    glacier: r.rose[700],
    institutional: r.rose[850],
    pedestrian: r.lilac[900],
    aerodrome: r.rose[850],
    runway: r.rose[800],
    pier: r.sandstone[500],
    buildings: r.rose[700],
    railway: r.rose[700],
    boundaries: r.rose[500],
    roads: {
      other: r.rose[850],
      otherCasing: r.rose[1000],
      minor: r.rose[800],
      minorCasing: r.rose[1000],
      service: r.rose[850],
      serviceCasing: r.rose[1000],
      major: r.rose[700],
      majorCasing: r.rose[1000],
      highway: r.rose[600],
      highwayCasing: r.rose[1000],
      link: r.rose[700],
      linkCasing: r.rose[1000],
    },
    tunnelFill: r.rose[900],
    tunnelCasing: r.rose[1000],
    bridgeCasing: r.rose[1000],
    labels: {
      city: r.rose[100],
      cityHalo: r.rose[1000],
      state: r.rose[500],
      stateHalo: r.rose[1000],
      country: r.rose[500],
      subplace: r.rose[500],
      subplaceHalo: r.rose[1000],
      address: r.rose[500],
      addressHalo: r.rose[1000],
      roadMinor: r.rose[500],
      roadMinorHalo: r.rose[1000],
      roadMajor: r.rose[400],
      roadMajorHalo: r.rose[1000],
      ocean: r.ember[400],
    },

    pois: {
      blue: r.cobalt[400],
      green: r.verdant[400],
      lapis: r.cobalt[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.rose[500],
      tangerine: r.ember[400],
      turquoise: r.sky[400],
    },
    landcover: {
      grassland: r.verdant[800],
      barren: r.sandstone[500],
      urban_area: r.rose[900],
      farmland: r.verdant[900],
      glacier: r.rose[700],
      scrub: r.verdant[900],
      forest: r.verdant[700],
    },
  };

  /**
   * `orchid` / `light`. After Protomaps' *iris bloom*: a lavender-grey land on white, white
   * roads, and the colour concentrated where the reference puts it — vivid teal parks (`aqua`),
   * mint woods (`jade`), sky water, navy boundaries and a navy city label. The land ramp is
   * kept quiet so those pops stay pops.
   */
  const ORCHID_LIGHT: Recipe = {
    background: r.lilac[25],
    earth: r.lilac[200],
    water: r.sky[300],
    parkA: r.aqua[300],
    parkB: r.aqua[400],
    woodA: r.jade[500],
    woodB: r.jade[600],
    scrubA: r.sandstone[300],
    scrubB: r.sandstone[400],
    sand: r.sandstone[300],
    beach: r.sandstone[200],
    glacier: r.lilac[100],
    institutional: r.lilac[300],
    pedestrian: r.lilac[300],
    aerodrome: r.sandstone[100],
    runway: r.lilac[25],
    pier: r.cobalt[500],
    buildings: r.lilac[300],
    railway: r.lilac[400],
    boundaries: r.cobalt[900],
    roads: {
      other: "#FFFFFF",
      otherCasing: r.lilac[200],
      minor: "#FFFFFF",
      minorCasing: r.lilac[200],
      service: "#FFFFFF",
      serviceCasing: r.lilac[200],
      major: "#FFFFFF",
      majorCasing: r.lilac[300],
      highway: "#FFFFFF",
      highwayCasing: r.lilac[400],
      link: "#FFFFFF",
      linkCasing: r.lilac[300],
    },
    tunnelFill: r.lilac[100],
    tunnelCasing: r.lilac[200],
    bridgeCasing: r.lilac[500],
    labels: {
      city: r.cobalt[950],
      cityHalo: r.lilac[25],
      state: r.lilac[700],
      stateHalo: r.lilac[25],
      country: r.lilac[850],
      subplace: r.lilac[700],
      subplaceHalo: r.lilac[25],
      address: r.lilac[700],
      addressHalo: r.lilac[25],
      roadMinor: r.lilac[800],
      roadMinorHalo: r.lilac[25],
      roadMajor: r.lilac[850],
      roadMajorHalo: r.lilac[25],
      ocean: r.cobalt[800],
    },

    pois: {
      blue: r.cobalt[700],
      green: r.jade[700],
      lapis: r.cobalt[700],
      pink: r.rose[600],
      red: r.rose[700],
      slategray: r.lilac[700],
      tangerine: r.ember[700],
      turquoise: r.aqua[700],
    },
    landcover: {
      grassland: r.jade[400],
      barren: r.sandstone[300],
      urban_area: r.lilac[200],
      farmland: r.jade[500],
      glacier: r.lilac[100],
      scrub: r.verdant[400],
      forest: r.jade[500],
    },
  };

  /**
   * `orchid` / `dark`. Deep violet field, the teal and mint kept for parks and woods, water
   * darker than land as every dark mode requires.
   */
  const ORCHID_DARK: Recipe = {
    background: r.lilac[1000],
    earth: r.lilac[900],
    water: r.sky[980],
    parkA: r.aqua[800],
    parkB: r.aqua[700],
    woodA: r.jade[800],
    woodB: r.jade[700],
    scrubA: r.sandstone[500],
    scrubB: r.sandstone[500],
    sand: r.sandstone[500],
    beach: r.sandstone[400],
    glacier: r.lilac[700],
    institutional: r.lilac[850],
    pedestrian: r.lilac[850],
    aerodrome: r.lilac[850],
    runway: r.lilac[800],
    pier: r.cobalt[600],
    buildings: r.lilac[800],
    railway: r.lilac[700],
    boundaries: r.cobalt[400],
    roads: {
      other: r.lilac[850],
      otherCasing: r.lilac[1000],
      minor: r.lilac[800],
      minorCasing: r.lilac[1000],
      service: r.lilac[850],
      serviceCasing: r.lilac[1000],
      major: r.lilac[700],
      majorCasing: r.lilac[1000],
      highway: r.lilac[600],
      highwayCasing: r.lilac[1000],
      link: r.lilac[700],
      linkCasing: r.lilac[1000],
    },
    tunnelFill: r.lilac[900],
    tunnelCasing: r.lilac[1000],
    bridgeCasing: r.lilac[1000],
    labels: {
      city: r.lilac[100],
      cityHalo: r.lilac[1000],
      state: r.lilac[500],
      stateHalo: r.lilac[1000],
      country: r.lilac[500],
      subplace: r.lilac[500],
      subplaceHalo: r.lilac[1000],
      address: r.lilac[500],
      addressHalo: r.lilac[1000],
      roadMinor: r.lilac[500],
      roadMinorHalo: r.lilac[1000],
      roadMajor: r.lilac[400],
      roadMajorHalo: r.lilac[1000],
      ocean: r.sky[400],
    },

    pois: {
      blue: r.cobalt[400],
      green: r.jade[400],
      lapis: r.cobalt[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.lilac[500],
      tangerine: r.ember[400],
      turquoise: r.aqua[400],
    },
    landcover: {
      grassland: r.jade[800],
      barren: r.sandstone[500],
      urban_area: r.lilac[900],
      farmland: r.jade[900],
      glacier: r.lilac[700],
      scrub: r.verdant[800],
      forest: r.jade[800],
    },
  };

  /**
   * `canopy` / `light`. After Protomaps' *rainforest*: a tan earth under dark teal-green parks
   * and forest, near-black roads with the earth as their casing, clay-orange buildings, and
   * strong blue water. The reference sets its labels in white on tan, which misses every
   * floor; here they are dark on a sand halo instead.
   */
  const CANOPY_LIGHT: Recipe = {
    background: r.verdant[100],
    earth: r.sandstone[200],
    water: r.cobalt[600],
    parkA: r.verdant[800],
    parkB: r.verdant[700],
    woodA: r.verdant[600],
    woodB: r.verdant[700],
    scrubA: r.sandstone[500],
    scrubB: r.sandstone[400],
    sand: r.sandstone[200],
    beach: r.sandstone[100],
    glacier: r.paper[25],
    institutional: r.rose[200],
    pedestrian: r.rose[100],
    aerodrome: r.lilac[500],
    runway: r.paper[1000],
    pier: r.sky[300],
    buildings: r.ember[700],
    railway: r.paper[950],
    boundaries: r.graphite[300],
    roads: {
      other: r.rose[1000],
      otherCasing: r.sandstone[200],
      minor: r.rose[1000],
      minorCasing: r.sandstone[200],
      service: r.rose[1000],
      serviceCasing: r.sandstone[200],
      major: r.rose[1000],
      majorCasing: r.sandstone[100],
      highway: r.rose[1000],
      highwayCasing: r.sandstone[100],
      link: r.rose[1000],
      linkCasing: r.sandstone[100],
    },
    tunnelFill: r.rose[900],
    tunnelCasing: r.sandstone[200],
    bridgeCasing: r.sandstone[100],
    labels: {
      city: r.paper[1000],
      cityHalo: r.sandstone[100],
      state: r.paper[800],
      stateHalo: r.sandstone[100],
      country: r.paper[800],
      subplace: r.paper[700],
      subplaceHalo: r.sandstone[100],
      address: r.paper[800],
      addressHalo: r.sandstone[100],
      roadMinor: r.paper[800],
      roadMinorHalo: r.sandstone[100],
      roadMajor: r.paper[900],
      roadMajorHalo: r.sandstone[100],
      ocean: r.cobalt[25],
    },

    pois: {
      blue: r.cobalt[700],
      green: r.verdant[700],
      lapis: r.cobalt[700],
      pink: r.rose[600],
      red: r.rose[700],
      slategray: r.paper[700],
      tangerine: r.ember[700],
      turquoise: r.sky[700],
    },
    landcover: {
      grassland: r.verdant[500],
      barren: r.sandstone[400],
      urban_area: r.rose[600],
      farmland: r.verdant[600],
      glacier: r.paper[25],
      scrub: r.sandstone[500],
      forest: r.verdant[800],
    },
  };

  /**
   * `canopy` / `dark`. The forest floor at night: warm brown land, the greens kept deep,
   * roads turned into sand-coloured lines, buildings still clay.
   */
  const CANOPY_DARK: Recipe = {
    // `linen` rather than `paper` for the ground alone: paper is packed solid here (1000 casings,
    // 950 background, 900 earth, 850 scrub), so there is no free step to move to, and `base`
    // owns paper[900]. The straw tint also suits a style whose light half is sandstone.
    background: r.linen[950],
    earth: r.linen[900],
    water: r.cobalt[950],
    parkA: r.verdant[900],
    parkB: r.verdant[800],
    woodA: r.verdant[800],
    woodB: r.verdant[800],
    scrubA: r.paper[850],
    scrubB: r.paper[850],
    sand: r.sandstone[500],
    beach: r.sandstone[400],
    glacier: r.paper[700],
    institutional: r.paper[850],
    pedestrian: r.rose[900],
    aerodrome: r.lilac[850],
    runway: r.paper[800],
    pier: r.sky[700],
    buildings: r.ember[700],
    railway: r.paper[700],
    boundaries: r.graphite[600],
    roads: {
      other: r.sandstone[500],
      otherCasing: r.paper[1000],
      minor: r.sandstone[400],
      minorCasing: r.paper[1000],
      service: r.sandstone[500],
      serviceCasing: r.paper[1000],
      major: r.sandstone[300],
      majorCasing: r.paper[1000],
      highway: r.sandstone[200],
      highwayCasing: r.paper[1000],
      link: r.sandstone[300],
      linkCasing: r.paper[1000],
    },
    tunnelFill: r.paper[900],
    tunnelCasing: r.paper[1000],
    bridgeCasing: r.paper[1000],
    labels: {
      city: r.sandstone[100],
      cityHalo: r.paper[1000],
      state: r.sandstone[300],
      stateHalo: r.paper[1000],
      country: r.sandstone[300],
      subplace: r.sandstone[300],
      subplaceHalo: r.paper[1000],
      address: r.sandstone[300],
      addressHalo: r.paper[1000],
      roadMinor: r.sandstone[300],
      roadMinorHalo: r.paper[1000],
      roadMajor: r.sandstone[200],
      roadMajorHalo: r.paper[1000],
      ocean: r.cobalt[300],
    },

    pois: {
      blue: r.cobalt[400],
      green: r.verdant[400],
      lapis: r.cobalt[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.sandstone[300],
      tangerine: r.ember[400],
      turquoise: r.sky[400],
    },
    landcover: {
      grassland: r.verdant[900],
      barren: r.sandstone[500],
      urban_area: r.rose[900],
      farmland: r.verdant[900],
      glacier: r.paper[700],
      scrub: r.paper[850],
      forest: r.verdant[900],
    },
  };

  /**
   * `lagoon` / `light`. After Protomaps' *seafoam*: pale green land, aqua water, teal parks
   * and woods, white roads, grey buildings and grey labels — a cool, low-contrast map that
   * still keeps its greens and teals apart.
   */
  const LAGOON_LIGHT: Recipe = {
    background: r.verdant[100],
    earth: r.verdant[100],
    water: r.wave[200],
    parkA: r.aqua[300],
    parkB: r.aqua[400],
    woodA: r.wave[300],
    woodB: r.wave[400],
    scrubA: r.verdant[300],
    scrubB: r.verdant[400],
    sand: r.sandstone[200],
    beach: r.verdant[100],
    glacier: r.graphite[50],
    institutional: r.verdant[200],
    pedestrian: r.wave[100],
    aerodrome: r.paper[200],
    runway: r.verdant[100],
    pier: r.sky[300],
    buildings: r.graphite[100],
    railway: r.graphite[25],
    boundaries: r.graphite[500],
    roads: {
      other: "#FFFFFF",
      otherCasing: r.verdant[200],
      minor: "#FFFFFF",
      minorCasing: r.verdant[200],
      service: "#FFFFFF",
      serviceCasing: r.verdant[200],
      major: "#FFFFFF",
      majorCasing: r.verdant[300],
      highway: "#FFFFFF",
      highwayCasing: r.verdant[300],
      link: "#FFFFFF",
      linkCasing: r.verdant[300],
    },
    tunnelFill: r.graphite[50],
    tunnelCasing: r.verdant[200],
    bridgeCasing: r.graphite[400],
    labels: {
      city: r.graphite[800],
      cityHalo: r.verdant[100],
      state: r.graphite[700],
      stateHalo: r.verdant[100],
      country: r.graphite[700],
      subplace: r.graphite[700],
      subplaceHalo: r.verdant[100],
      address: r.graphite[700],
      addressHalo: r.verdant[100],
      roadMinor: r.graphite[700],
      roadMinorHalo: r.verdant[100],
      roadMajor: r.graphite[800],
      roadMajorHalo: r.verdant[100],
      ocean: r.wave[800],
    },

    pois: {
      blue: r.wave[700],
      green: r.verdant[700],
      lapis: r.sky[700],
      pink: r.rose[600],
      red: r.rose[700],
      slategray: r.graphite[700],
      tangerine: r.sandstone[500],
      turquoise: r.aqua[700],
    },
    landcover: {
      grassland: r.verdant[400],
      barren: r.sandstone[200],
      urban_area: r.verdant[100],
      farmland: r.verdant[300],
      glacier: r.graphite[50],
      scrub: r.verdant[300],
      forest: r.wave[300],
    },
  };

  /**
   * `lagoon` / `dark`. Deep green land, water darker still, roads brightening up the
   * hierarchy in the same green family, parks and woods holding their teal.
   */
  const LAGOON_DARK: Recipe = {
    background: r.verdant[900],
    earth: r.verdant[900],
    water: r.wave[980],
    parkA: r.aqua[800],
    parkB: r.aqua[700],
    woodA: r.wave[800],
    woodB: r.wave[700],
    scrubA: r.verdant[800],
    scrubB: r.verdant[800],
    sand: r.sandstone[500],
    beach: r.verdant[800],
    glacier: r.graphite[700],
    institutional: r.verdant[800],
    pedestrian: r.wave[900],
    aerodrome: r.graphite[800],
    runway: r.verdant[800],
    pier: r.sky[600],
    buildings: r.verdant[800],
    railway: r.graphite[700],
    boundaries: r.graphite[600],
    roads: {
      other: r.verdant[700],
      otherCasing: r.verdant[900],
      minor: r.verdant[600],
      minorCasing: r.verdant[900],
      service: r.verdant[700],
      serviceCasing: r.verdant[900],
      major: r.verdant[500],
      majorCasing: r.verdant[900],
      highway: r.verdant[400],
      highwayCasing: r.verdant[900],
      link: r.verdant[500],
      linkCasing: r.verdant[900],
    },
    tunnelFill: r.verdant[800],
    tunnelCasing: r.verdant[900],
    bridgeCasing: r.verdant[900],
    labels: {
      city: r.verdant[100],
      cityHalo: r.verdant[900],
      state: r.verdant[300],
      stateHalo: r.verdant[900],
      country: r.verdant[300],
      subplace: r.verdant[300],
      subplaceHalo: r.verdant[900],
      address: r.verdant[300],
      addressHalo: r.verdant[900],
      roadMinor: r.verdant[300],
      roadMinorHalo: r.verdant[900],
      roadMajor: r.verdant[200],
      roadMajorHalo: r.verdant[900],
      ocean: r.wave[400],
    },

    pois: {
      blue: r.wave[400],
      green: r.verdant[400],
      lapis: r.sky[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.graphite[400],
      tangerine: r.sandstone[400],
      turquoise: r.aqua[400],
    },
    landcover: {
      grassland: r.verdant[800],
      barren: r.sandstone[500],
      urban_area: r.verdant[900],
      farmland: r.verdant[800],
      glacier: r.graphite[700],
      scrub: r.verdant[800],
      forest: r.wave[800],
    },
  };

  /**
   * `tropic` / `light`. After CARTO's *Tropic* and *Temps*: teal water at full strength (`aqua`), spring-green
   * parks and woods (`jade`), cream land (`linen`), a coral highway with a deeper coral casing, coral
   * boundaries, and labels in the deep teals. The most Canadian of the vivid four: it reads as a lake map.
   */
  const TROPIC_LIGHT: Recipe = {
    background: r.linen[100],
    // A step below `sunset`, whose warm duotone owns the lightest cream. Tropic's cream sitting
    // slightly deeper is also what lets its full-strength teal water carry the style.
    earth: r.linen[50],
    water: r.aqua[500],
    parkA: r.jade[300],
    parkB: r.jade[400],
    woodA: r.jade[400],
    woodB: r.jade[500],
    scrubA: r.fern[200],
    scrubB: r.fern[300],
    sand: r.sandstone[200],
    beach: r.sandstone[100],
    glacier: r.ink[25],
    institutional: r.linen[100],
    pedestrian: r.linen[50],
    aerodrome: r.linen[200],
    runway: r.linen[300],
    pier: r.aqua[300],
    buildings: r.linen[200],
    railway: r.linen[400],
    boundaries: r.coral[700],
    roads: {
      other: "#FFFFFF",
      otherCasing: r.linen[200],
      minor: "#FFFFFF",
      minorCasing: r.linen[200],
      service: "#FFFFFF",
      serviceCasing: r.linen[200],
      major: "#FFFFFF",
      majorCasing: r.linen[300],
      highway: r.coral[500],
      highwayCasing: r.coral[700],
      link: r.coral[400],
      linkCasing: r.coral[600],
    },
    tunnelFill: r.linen[100],
    tunnelCasing: r.linen[200],
    bridgeCasing: r.linen[500],
    labels: {
      city: r.aqua[950],
      cityHalo: r.linen[25],
      state: r.aqua[800],
      stateHalo: r.linen[25],
      country: r.aqua[800],
      subplace: r.aqua[800],
      subplaceHalo: r.linen[25],
      address: r.linen[700],
      addressHalo: r.linen[25],
      roadMinor: r.linen[700],
      roadMinorHalo: r.linen[25],
      roadMajor: r.aqua[900],
      roadMajorHalo: r.linen[25],
      ocean: r.aqua[980],
    },

    pois: {
      blue: r.wave[700],
      green: r.verdant[700],
      lapis: r.sky[700],
      pink: r.rose[600],
      red: r.rose[700],
      slategray: r.graphite[700],
      tangerine: r.sandstone[500],
      turquoise: r.aqua[700],
    },
    landcover: {
      grassland: r.fern[200],
      barren: r.sandstone[200],
      urban_area: r.linen[100],
      farmland: r.sandstone[100],
      glacier: r.ink[25],
      scrub: r.fern[300],
      forest: r.jade[400],
    },
  };

  /**
   * `tropic` / `dark`. Teal-black land, the water a deep teal that still reads as colour against it, parks and
   * woods holding their green at the dark steps, coral highway and boundaries, cream labels.
   */
  const TROPIC_DARK: Recipe = {
    background: r.aqua[980],
    earth: r.aqua[950],
    water: r.aqua[700],
    parkA: r.jade[850],
    parkB: r.jade[800],
    woodA: r.jade[800],
    woodB: r.jade[700],
    scrubA: r.ink[900],
    scrubB: r.ink[850],
    sand: r.sandstone[500],
    beach: r.ink[900],
    glacier: r.ink[800],
    institutional: r.ink[900],
    pedestrian: r.aqua[900],
    aerodrome: r.ink[900],
    runway: r.ink[850],
    pier: r.aqua[600],
    buildings: r.ink[900],
    railway: r.ink[700],
    boundaries: r.coral[400],
    roads: {
      other: r.ink[850],
      otherCasing: r.aqua[980],
      minor: r.ink[800],
      minorCasing: r.aqua[980],
      service: r.ink[850],
      serviceCasing: r.aqua[980],
      major: r.ink[700],
      majorCasing: r.aqua[980],
      highway: r.coral[500],
      highwayCasing: r.aqua[980],
      link: r.coral[600],
      linkCasing: r.aqua[980],
    },
    tunnelFill: r.ink[900],
    tunnelCasing: r.aqua[980],
    bridgeCasing: r.aqua[980],
    labels: {
      city: r.linen[25],
      cityHalo: r.aqua[950],
      state: r.aqua[300],
      stateHalo: r.aqua[950],
      country: r.aqua[300],
      subplace: r.aqua[300],
      subplaceHalo: r.aqua[950],
      address: r.ink[400],
      addressHalo: r.aqua[950],
      roadMinor: r.ink[400],
      roadMinorHalo: r.aqua[950],
      roadMajor: r.linen[100],
      roadMajorHalo: r.aqua[950],
      ocean: r.aqua[200],
    },

    pois: {
      blue: r.wave[400],
      green: r.verdant[400],
      lapis: r.sky[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.graphite[400],
      tangerine: r.sandstone[400],
      turquoise: r.aqua[400],
    },
    landcover: {
      grassland: r.ink[900],
      barren: r.sandstone[500],
      urban_area: r.aqua[950],
      farmland: r.ink[900],
      glacier: r.ink[800],
      scrub: r.ink[850],
      forest: r.jade[800],
    },
  };

  /**
   * `sunset` / `light`. After CARTO's *Sunset*: a warm duotone. Cream land (`linen`), peach vegetation
   * (`peach`, not green, on purpose), coral roads up the hierarchy, indigo water and indigo labels — the
   * one cool thing on the page, which is what makes the water read as water.
   */
  const SUNSET_LIGHT: Recipe = {
    background: r.linen[100],
    earth: r.linen[25],
    water: r.indigo[700],
    parkA: r.peach[100],
    parkB: r.peach[200],
    woodA: r.peach[200],
    woodB: r.peach[300],
    scrubA: r.linen[100],
    scrubB: r.peach[100],
    sand: r.peach[200],
    beach: r.peach[100],
    glacier: r.linen[25],
    institutional: r.linen[100],
    pedestrian: r.linen[50],
    aerodrome: r.linen[200],
    runway: r.linen[300],
    pier: r.indigo[300],
    buildings: r.linen[200],
    railway: r.linen[400],
    boundaries: r.indigo[600],
    roads: {
      other: "#FFFFFF",
      otherCasing: r.linen[200],
      minor: "#FFFFFF",
      minorCasing: r.linen[200],
      service: "#FFFFFF",
      serviceCasing: r.linen[200],
      major: "#FFFFFF",
      majorCasing: r.coral[300],
      highway: r.coral[500],
      highwayCasing: r.coral[700],
      link: r.coral[400],
      linkCasing: r.coral[600],
    },
    tunnelFill: r.linen[100],
    tunnelCasing: r.linen[200],
    bridgeCasing: r.linen[500],
    labels: {
      city: r.indigo[900],
      cityHalo: r.linen[25],
      state: r.indigo[800],
      stateHalo: r.linen[25],
      country: r.indigo[800],
      subplace: r.indigo[800],
      subplaceHalo: r.linen[25],
      address: r.linen[700],
      addressHalo: r.linen[25],
      roadMinor: r.linen[700],
      roadMinorHalo: r.linen[25],
      roadMajor: r.indigo[900],
      roadMajorHalo: r.linen[25],
      ocean: r.linen[25],
    },

    pois: {
      blue: r.wave[700],
      green: r.verdant[700],
      lapis: r.sky[700],
      pink: r.rose[600],
      red: r.rose[700],
      slategray: r.graphite[700],
      tangerine: r.sandstone[500],
      turquoise: r.aqua[700],
    },
    // A step lighter than the parks: the field tint sits under them at up to 0.6 opacity, and at
    // the parks' own steps it turned the whole city orange rather than cream with peach in it.
    landcover: {
      grassland: r.linen[100],
      barren: r.linen[200],
      urban_area: r.linen[50],
      farmland: r.peach[100],
      glacier: r.linen[25],
      scrub: r.linen[100],
      forest: r.peach[200],
    },
  };

  /**
   * `sunset` / `dark`. Dusk: an indigo field, water darker still, parks and woods a step lighter in the same
   * indigo, coral highway, peach boundaries and peach labels.
   */
  const SUNSET_DARK: Recipe = {
    background: r.indigo[950],
    earth: r.indigo[900],
    water: r.indigo[1000],
    parkA: r.indigo[850],
    parkB: r.indigo[800],
    woodA: r.indigo[850],
    woodB: r.indigo[800],
    scrubA: r.indigo[900],
    scrubB: r.indigo[850],
    sand: r.peach[800],
    beach: r.indigo[850],
    glacier: r.indigo[700],
    institutional: r.indigo[850],
    pedestrian: r.indigo[850],
    aerodrome: r.indigo[850],
    runway: r.indigo[800],
    pier: r.indigo[600],
    buildings: r.indigo[850],
    railway: r.indigo[700],
    boundaries: r.peach[300],
    roads: {
      other: r.indigo[800],
      otherCasing: r.indigo[950],
      minor: r.indigo[700],
      minorCasing: r.indigo[950],
      service: r.indigo[800],
      serviceCasing: r.indigo[950],
      major: r.indigo[600],
      majorCasing: r.indigo[950],
      highway: r.coral[500],
      highwayCasing: r.indigo[950],
      link: r.coral[600],
      linkCasing: r.indigo[950],
    },
    tunnelFill: r.indigo[850],
    tunnelCasing: r.indigo[950],
    bridgeCasing: r.indigo[950],
    labels: {
      city: r.peach[100],
      cityHalo: r.indigo[900],
      state: r.peach[300],
      stateHalo: r.indigo[900],
      country: r.peach[300],
      subplace: r.peach[300],
      subplaceHalo: r.indigo[900],
      address: r.indigo[400],
      addressHalo: r.indigo[900],
      roadMinor: r.indigo[400],
      roadMinorHalo: r.indigo[900],
      roadMajor: r.peach[100],
      roadMajorHalo: r.indigo[900],
      ocean: r.indigo[500],
    },

    pois: {
      blue: r.wave[400],
      green: r.verdant[400],
      lapis: r.sky[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.graphite[400],
      tangerine: r.sandstone[400],
      turquoise: r.aqua[400],
    },
    landcover: {
      grassland: r.indigo[900],
      barren: r.peach[800],
      urban_area: r.indigo[900],
      farmland: r.indigo[850],
      glacier: r.indigo[700],
      scrub: r.indigo[850],
      forest: r.indigo[800],
    },
  };

  /**
   * `bold` / `light`. After CARTO's *Bold* and *Vivid*: the saturated street map. Warm paper land, a clear
   * blue water (`azure`), leaf-green parks (`fern`) and emerald woods (`jade`), an amber highway with an
   * orange casing, indigo boundaries, ink labels.
   */
  const BOLD_LIGHT: Recipe = {
    background: r.paper[100],
    // A step below `base`, which owns the lightest paper: two styles cannot share a land colour
    // (the /styles suite asserts twelve distinct earths), and the saturated water, parks and
    // amber highway read better off a ground that is a shade warmer than the default map's.
    earth: r.paper[50],
    water: r.azure[500],
    parkA: r.fern[300],
    parkB: r.fern[400],
    woodA: r.jade[500],
    woodB: r.jade[600],
    scrubA: r.fern[200],
    scrubB: r.fern[300],
    sand: r.sandstone[200],
    beach: r.sandstone[100],
    glacier: r.ink[25],
    institutional: r.paper[100],
    pedestrian: r.paper[50],
    aerodrome: r.paper[200],
    runway: r.paper[300],
    pier: r.azure[300],
    buildings: r.paper[200],
    railway: r.paper[400],
    boundaries: r.indigo[600],
    roads: {
      other: "#FFFFFF",
      otherCasing: r.paper[200],
      minor: "#FFFFFF",
      minorCasing: r.paper[200],
      service: "#FFFFFF",
      serviceCasing: r.paper[200],
      major: "#FFFFFF",
      majorCasing: r.paper[300],
      highway: r.amber[400],
      highwayCasing: r.amber[600],
      link: r.amber[300],
      linkCasing: r.amber[500],
    },
    tunnelFill: r.paper[100],
    tunnelCasing: r.paper[200],
    bridgeCasing: r.paper[500],
    labels: {
      city: r.ink[1000],
      cityHalo: r.paper[25],
      state: r.ink[700],
      stateHalo: r.paper[25],
      country: r.ink[700],
      subplace: r.ink[700],
      subplaceHalo: r.paper[25],
      address: r.ink[700],
      addressHalo: r.paper[25],
      roadMinor: r.ink[700],
      roadMinorHalo: r.paper[25],
      roadMajor: r.ink[800],
      roadMajorHalo: r.paper[25],
      ocean: r.azure[950],
    },

    pois: {
      blue: r.wave[700],
      green: r.verdant[700],
      lapis: r.sky[700],
      pink: r.rose[600],
      red: r.rose[700],
      slategray: r.graphite[700],
      tangerine: r.sandstone[500],
      turquoise: r.aqua[700],
    },
    landcover: {
      grassland: r.fern[200],
      barren: r.sandstone[200],
      urban_area: r.paper[100],
      farmland: r.sandstone[100],
      glacier: r.ink[25],
      scrub: r.fern[300],
      forest: r.jade[400],
    },
  };

  /**
   * `bold` / `dark`. Ink-black land, a deep blue water that keeps its hue, the greens at their dark steps,
   * amber highway, indigo boundaries, ink labels.
   */
  const BOLD_DARK: Recipe = {
    // A warm ground under cool detail. `outdoor` owns ink[950] and ink is packed below it here
    // (900 scrub and buildings, 850 runway), so the ground moves to paper, which is where this
    // style's light half already sits.
    background: r.paper[1000],
    earth: r.paper[950],
    water: r.azure[800],
    parkA: r.fern[800],
    parkB: r.fern[700],
    woodA: r.jade[850],
    woodB: r.jade[800],
    scrubA: r.ink[900],
    scrubB: r.ink[850],
    sand: r.sandstone[500],
    beach: r.ink[900],
    glacier: r.ink[800],
    institutional: r.ink[900],
    pedestrian: r.ink[900],
    aerodrome: r.ink[900],
    runway: r.ink[850],
    pier: r.azure[600],
    buildings: r.ink[900],
    railway: r.ink[700],
    boundaries: r.indigo[500],
    roads: {
      other: r.ink[850],
      otherCasing: r.ink[1000],
      minor: r.ink[800],
      minorCasing: r.ink[1000],
      service: r.ink[850],
      serviceCasing: r.ink[1000],
      major: r.ink[700],
      majorCasing: r.ink[1000],
      highway: r.amber[500],
      highwayCasing: r.ink[1000],
      link: r.amber[600],
      linkCasing: r.ink[1000],
    },
    tunnelFill: r.ink[900],
    tunnelCasing: r.ink[1000],
    bridgeCasing: r.ink[1000],
    labels: {
      city: r.ink[25],
      cityHalo: r.ink[950],
      state: r.ink[300],
      stateHalo: r.ink[950],
      country: r.ink[300],
      subplace: r.ink[300],
      subplaceHalo: r.ink[950],
      address: r.ink[400],
      addressHalo: r.ink[950],
      roadMinor: r.ink[400],
      roadMinorHalo: r.ink[950],
      roadMajor: r.ink[100],
      roadMajorHalo: r.ink[950],
      ocean: r.azure[300],
    },

    pois: {
      blue: r.wave[400],
      green: r.verdant[400],
      lapis: r.sky[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.graphite[400],
      tangerine: r.sandstone[400],
      turquoise: r.aqua[400],
    },
    landcover: {
      grassland: r.ink[900],
      barren: r.sandstone[500],
      urban_area: r.ink[950],
      farmland: r.ink[900],
      glacier: r.ink[800],
      scrub: r.ink[850],
      forest: r.jade[850],
    },
  };

  /**
   * `pastel` / `light`. After CARTO's *Pastel*: lavender-white land (`lilac`), periwinkle water (`cobalt`),
   * mint parks (`jade`), soft leaf woods (`fern`), a salmon highway (`coral`), pale-yellow farmland
   * (`amber`), lavender buildings and boundaries, violet-grey labels.
   */
  const PASTEL_LIGHT: Recipe = {
    background: r.lilac[50],
    earth: r.lilac[25],
    water: r.cobalt[400],
    parkA: r.jade[300],
    parkB: r.jade[400],
    woodA: r.fern[300],
    woodB: r.fern[400],
    scrubA: r.jade[200],
    scrubB: r.jade[300],
    sand: r.sandstone[200],
    beach: r.sandstone[100],
    glacier: r.ink[25],
    institutional: r.lilac[100],
    pedestrian: r.lilac[50],
    aerodrome: r.lilac[200],
    runway: r.lilac[300],
    pier: r.cobalt[300],
    buildings: r.lilac[200],
    railway: r.lilac[400],
    boundaries: r.indigo[500],
    roads: {
      other: "#FFFFFF",
      otherCasing: r.lilac[200],
      minor: "#FFFFFF",
      minorCasing: r.lilac[200],
      service: "#FFFFFF",
      serviceCasing: r.lilac[200],
      major: "#FFFFFF",
      majorCasing: r.lilac[300],
      highway: r.coral[400],
      highwayCasing: r.coral[500],
      link: r.coral[300],
      linkCasing: r.coral[400],
    },
    tunnelFill: r.lilac[100],
    tunnelCasing: r.lilac[200],
    bridgeCasing: r.lilac[500],
    labels: {
      city: r.lilac[1000],
      cityHalo: r.lilac[25],
      state: r.lilac[700],
      stateHalo: r.lilac[25],
      country: r.lilac[700],
      subplace: r.lilac[700],
      subplaceHalo: r.lilac[25],
      address: r.lilac[700],
      addressHalo: r.lilac[25],
      roadMinor: r.lilac[700],
      roadMinorHalo: r.lilac[25],
      roadMajor: r.lilac[800],
      roadMajorHalo: r.lilac[25],
      ocean: r.cobalt[800],
    },

    pois: {
      blue: r.wave[700],
      green: r.verdant[700],
      lapis: r.sky[700],
      pink: r.rose[600],
      red: r.rose[700],
      slategray: r.graphite[700],
      tangerine: r.sandstone[500],
      turquoise: r.aqua[700],
    },
    landcover: {
      grassland: r.jade[200],
      barren: r.sandstone[200],
      urban_area: r.lilac[100],
      farmland: r.amber[200],
      glacier: r.ink[25],
      scrub: r.jade[300],
      forest: r.fern[400],
    },
  };

  /**
   * `pastel` / `dark`. The same pastels dimmed to dusk: deep lilac land, navy water, the greens at their
   * dark steps, the salmon highway kept, lavender labels.
   */
  const PASTEL_DARK: Recipe = {
    background: r.lilac[1000],
    earth: r.lilac[950],
    // Water lighter than land, which `blueprint`, `tropic` and `bold` already do: the three
    // styles whose water is the thing you remember about them. This one's is periwinkle, and at
    // cobalt[950] the dark half had turned it near-black, so the name stopped being true after
    // sundown. Lifting it also unpins the ground, which had to sit at `orchid`'s lilac[900]
    // because the only free step below was within 1.01:1 of that near-black water.
    water: r.cobalt[800],
    parkA: r.jade[850],
    parkB: r.jade[800],
    woodA: r.fern[800],
    woodB: r.fern[700],
    scrubA: r.lilac[850],
    scrubB: r.jade[850],
    sand: r.sandstone[500],
    beach: r.lilac[850],
    glacier: r.lilac[700],
    institutional: r.lilac[850],
    pedestrian: r.lilac[850],
    aerodrome: r.lilac[850],
    runway: r.lilac[800],
    pier: r.cobalt[600],
    buildings: r.lilac[850],
    railway: r.lilac[700],
    boundaries: r.indigo[400],
    roads: {
      other: r.lilac[800],
      otherCasing: r.lilac[1000],
      minor: r.lilac[700],
      minorCasing: r.lilac[1000],
      service: r.lilac[800],
      serviceCasing: r.lilac[1000],
      major: r.lilac[600],
      majorCasing: r.lilac[1000],
      highway: r.coral[400],
      highwayCasing: r.lilac[1000],
      link: r.coral[500],
      linkCasing: r.lilac[1000],
    },
    tunnelFill: r.lilac[850],
    tunnelCasing: r.lilac[1000],
    bridgeCasing: r.lilac[1000],
    labels: {
      city: r.lilac[25],
      cityHalo: r.lilac[950],
      state: r.lilac[300],
      stateHalo: r.lilac[950],
      country: r.lilac[300],
      subplace: r.lilac[300],
      subplaceHalo: r.lilac[950],
      address: r.lilac[400],
      addressHalo: r.lilac[950],
      roadMinor: r.lilac[400],
      roadMinorHalo: r.lilac[950],
      roadMajor: r.lilac[100],
      roadMajorHalo: r.lilac[950],
      ocean: r.cobalt[400],
    },

    pois: {
      blue: r.wave[400],
      green: r.verdant[400],
      lapis: r.sky[400],
      pink: r.rose[400],
      red: r.rose[400],
      slategray: r.graphite[400],
      tangerine: r.sandstone[400],
      turquoise: r.aqua[400],
    },
    landcover: {
      grassland: r.lilac[850],
      barren: r.sandstone[500],
      urban_area: r.lilac[900],
      farmland: r.lilac[850],
      glacier: r.lilac[700],
      scrub: r.lilac[850],
      forest: r.fern[800],
    },
  };

  // Adapt Bay Atlas's two traditional maps to the Protomaps schema. Shared recipes keep
  // custom themes working; the gateway supplies their typography and relief treatments.
  const traditional = (swiss: boolean, mode: ThemeMode): Recipe => {
    const light = mode === "light";
    const land = swiss ? r.swissPaper : r.atlasPaper;
    const water = swiss ? r.swissWater : r.atlasWater;
    const green = swiss ? r.swissGreen : r.atlasGreen;
    const stock = light ? BASE_LIGHT : BASE_DARK;
    const halo = light ? land[25] : land[1000];
    const highway = swiss ? r.swissRoad[400] : (light ? r.atlasRoad[600] : r.atlasRoad[400]);
    const casing = light ? (swiss ? r.swissRoad[800] : r.atlasRoad[800]) : land[1000];
    return {
      ...stock,
      background: light ? land[25] : land[1000],
      earth: light ? land[25] : land[900],
      water: light ? water[200] : water[980],
      parkA: light ? green[100] : green[800],
      parkB: light ? green[200] : green[700],
      woodA: light ? green[200] : green[800],
      woodB: light ? green[300] : green[700],
      scrubA: light ? green[100] : green[900],
      scrubB: light ? green[200] : green[800],
      institutional: light ? land[100] : land[950],
      pedestrian: light ? land[25] : land[950],
      buildings: light ? land[200] : land[700],
      railway: swiss ? r.swissRoad[600] : land[700],
      boundaries: light ? r.lilac[600] : r.lilac[400],
      roads: {
        other: light ? land[500] : land[700],
        otherCasing: light ? land[700] : land[1000],
        minor: light ? "#FFFFFF" : land[500],
        minorCasing: light ? land[700] : land[1000],
        service: light ? land[25] : land[700],
        serviceCasing: light ? land[500] : land[1000],
        major: swiss ? r.swissRoad[500] : (light ? r.atlasRoad[500] : r.atlasRoad[300]),
        majorCasing: casing,
        highway,
        highwayCasing: casing,
        link: highway,
        linkCasing: casing,
      },
      tunnelFill: light ? land[100] : land[950],
      tunnelCasing: light ? land[500] : land[1000],
      bridgeCasing: casing,
      labels: {
        city: light ? land[900] : land[25], cityHalo: halo,
        state: light ? land[700] : land[500], stateHalo: halo,
        country: light ? land[700] : land[500],
        subplace: light ? land[700] : land[500], subplaceHalo: halo,
        address: light ? land[700] : land[500], addressHalo: halo,
        roadMinor: light ? land[800] : land[500], roadMinorHalo: halo,
        roadMajor: light ? land[900] : land[200], roadMajorHalo: halo,
        ocean: light ? water[700] : water[400],
      },
      pois: { ...stock.pois!, green: light ? green[700] : green[300], blue: light ? water[700] : water[400] },
      landcover: {
        grassland: light ? green[100] : green[900],
        barren: light ? land[200] : land[700],
        urban_area: light ? land[100] : land[950],
        farmland: light ? land[25] : land[950],
        glacier: light ? water[200] : water[950],
        scrub: light ? green[100] : green[900],
        forest: light ? green[200] : green[800],
      },
    };
  };

  return {
    base: { light: BASE_LIGHT, dark: BASE_DARK },
    muted: { light: MUTED_LIGHT, dark: MUTED_DARK },
    outdoor: { light: OUTDOOR_LIGHT, dark: OUTDOOR_DARK },
    blueprint: { light: BLUEPRINT_LIGHT, dark: BLUEPRINT_DARK },
    blush: { light: BLUSH_LIGHT, dark: BLUSH_DARK },
    orchid: { light: ORCHID_LIGHT, dark: ORCHID_DARK },
    canopy: { light: CANOPY_LIGHT, dark: CANOPY_DARK },
    lagoon: { light: LAGOON_LIGHT, dark: LAGOON_DARK },
    tropic: { light: TROPIC_LIGHT, dark: TROPIC_DARK },
    sunset: { light: SUNSET_LIGHT, dark: SUNSET_DARK },
    bold: { light: BOLD_LIGHT, dark: BOLD_DARK },
    pastel: { light: PASTEL_LIGHT, dark: PASTEL_DARK },
    atlas: { light: traditional(false, "light"), dark: traditional(false, "dark") },
    swiss: { light: traditional(true, "light"), dark: traditional(true, "dark") },
  };
}

export const RECIPES: Record<
  ThemeBase,
  Record<ThemeMode, Recipe>
> = buildRecipes(STOCK_RAMPS);
