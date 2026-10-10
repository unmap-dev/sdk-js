import type { Flavor } from "@protomaps/basemaps";

/**
 * The unmap cartography authoring surface, moved here from apps/gateway/src/flavors.ts so the
 * gateway, the theme system, and the unmap.dev builder share one definition.
 *
 * A `Recipe` is what a theme can override: every colour a Flavor controls, expressed at the
 * level we author at. Expanding through `makeFlavor` keeps the consistency guarantees a raw
 * Flavor cannot: a casing is always derived beside its fill, and the tunnel and bridge families
 * cannot drift out of step with the surface roads they mirror.
 */

/**
 * The shipped styles. Appended, never inserted: this array's order drives the style picker in
 * the unmap.dev builder, so inserting a style mid-array silently reorders a control people have
 * already learned.
 */
export const THEME_BASES = [
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
export type ThemeBase = (typeof THEME_BASES)[number];

/** Whether `base` names a shipped style. */
export function isThemeBase(base: unknown): base is ThemeBase {
  return typeof base === "string" && (THEME_BASES as readonly string[]).includes(base);
}

export const MODES = ["light", "dark"] as const;
export type ThemeMode = (typeof MODES)[number];

export interface RoadRamp {
  /** Unclassified / track. The bottom of the hierarchy. */
  other: string;
  otherCasing: string;
  /** Residential and service. */
  minor: string;
  minorCasing: string;
  service: string;
  serviceCasing: string;
  /** Primary / secondary. */
  major: string;
  majorCasing: string;
  /** Motorway. */
  highway: string;
  highwayCasing: string;
  /** Slip roads. */
  link: string;
  linkCasing: string;
}

export interface LabelRamp {
  city: string;
  cityHalo: string;
  state: string;
  stateHalo: string;
  country: string;
  subplace: string;
  subplaceHalo: string;
  address: string;
  addressHalo: string;
  roadMinor: string;
  roadMinorHalo: string;
  roadMajor: string;
  roadMajorHalo: string;
  ocean: string;
}

export interface Recipe {
  background: string;
  earth: string;
  water: string;
  /** Park, wood and scrub each take two tones; `b` is the slightly deeper of the pair. */
  parkA: string;
  parkB: string;
  woodA: string;
  woodB: string;
  scrubA: string;
  scrubB: string;
  sand: string;
  beach: string;
  glacier: string;
  /** Institutional land: hospital, school, industrial, military, zoo, aerodrome. */
  institutional: string;
  pedestrian: string;
  aerodrome: string;
  runway: string;
  pier: string;
  buildings: string;
  railway: string;
  boundaries: string;
  roads: RoadRamp;
  labels: LabelRamp;
  /**
   * Tunnels read one step recessive against the surface road, bridges one step assertive.
   * Expressed as the colours to substitute rather than a computed shift, so a style can opt
   * out of the convention where it does not suit the palette.
   */
  tunnelFill: string;
  tunnelCasing: string;
  bridgeCasing: string;
  pois: Flavor["pois"];
  landcover: Flavor["landcover"];
}

/**
 * Expand a recipe into the full Flavor. Every one of the interface's required slots is written
 * here exactly once, so a missing slot is a compile error rather than a silently black layer.
 */
export function makeFlavor(r: Recipe): Flavor {
  return {
    background: r.background,
    earth: r.earth,
    water: r.water,

    park_a: r.parkA,
    park_b: r.parkB,
    wood_a: r.woodA,
    wood_b: r.woodB,
    scrub_a: r.scrubA,
    scrub_b: r.scrubB,
    sand: r.sand,
    beach: r.beach,
    glacier: r.glacier,

    hospital: r.institutional,
    industrial: r.institutional,
    school: r.institutional,
    zoo: r.institutional,
    military: r.institutional,
    pedestrian: r.pedestrian,
    aerodrome: r.aerodrome,
    runway: r.runway,
    pier: r.pier,
    buildings: r.buildings,

    // Surface roads.
    other: r.roads.other,
    minor_service: r.roads.service,
    minor_a: r.roads.minor,
    minor_b: r.roads.minor,
    link: r.roads.link,
    major: r.roads.major,
    highway: r.roads.highway,

    minor_service_casing: r.roads.serviceCasing,
    minor_casing: r.roads.minorCasing,
    link_casing: r.roads.linkCasing,
    // early/late are the same colour: they exist so Protomaps can fade casings in at
    // different zooms, not to differentiate hue.
    major_casing_early: r.roads.majorCasing,
    major_casing_late: r.roads.majorCasing,
    highway_casing_early: r.roads.highwayCasing,
    highway_casing_late: r.roads.highwayCasing,

    // Tunnels: recessive, one flat fill so the network reads as "beneath".
    tunnel_other: r.tunnelFill,
    tunnel_minor: r.tunnelFill,
    tunnel_link: r.tunnelFill,
    tunnel_major: r.tunnelFill,
    tunnel_highway: r.tunnelFill,
    tunnel_other_casing: r.tunnelCasing,
    tunnel_minor_casing: r.tunnelCasing,
    tunnel_link_casing: r.tunnelCasing,
    tunnel_major_casing: r.tunnelCasing,
    tunnel_highway_casing: r.tunnelCasing,

    // Bridges: same fills as the surface road so the ribbon stays continuous, with a
    // stronger casing that lifts it off whatever it crosses.
    bridges_other: r.roads.other,
    bridges_minor: r.roads.minor,
    bridges_link: r.roads.link,
    bridges_major: r.roads.major,
    bridges_highway: r.roads.highway,
    bridges_other_casing: r.bridgeCasing,
    bridges_minor_casing: r.bridgeCasing,
    bridges_link_casing: r.bridgeCasing,
    bridges_major_casing: r.bridgeCasing,
    bridges_highway_casing: r.bridgeCasing,

    railway: r.railway,
    boundaries: r.boundaries,

    roads_label_minor: r.labels.roadMinor,
    roads_label_minor_halo: r.labels.roadMinorHalo,
    roads_label_major: r.labels.roadMajor,
    roads_label_major_halo: r.labels.roadMajorHalo,
    ocean_label: r.labels.ocean,
    subplace_label: r.labels.subplace,
    subplace_label_halo: r.labels.subplaceHalo,
    city_label: r.labels.city,
    city_label_halo: r.labels.cityHalo,
    state_label: r.labels.state,
    state_label_halo: r.labels.stateHalo,
    country_label: r.labels.country,
    address_label: r.labels.address,
    address_label_halo: r.labels.addressHalo,

    pois: r.pois,
    landcover: r.landcover,
  };
}
