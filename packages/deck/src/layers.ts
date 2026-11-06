import { PathLayer, type PathLayerProps } from "@deck.gl/layers";
import { ScenegraphLayer, type ScenegraphLayerProps } from "@deck.gl/mesh-layers";
import { bearing, scaled, segmentDistance2 } from "./geometry";
import type { Lift3d, Lifts3dDocument, LngLatZ, RGBA } from "./types";

/** A lifts document, or just its `lifts`. */
export type LiftsInput = Lifts3dDocument | readonly Lift3d[];

const liftsOf = (input: LiftsInput): Lift3d[] =>
  (Array.isArray(input) ? input : (input as Lifts3dDocument).lifts) as Lift3d[];

/** Known OSM `aerialway=*` values, plus `default` for anything else. */
export type LiftColorKey =
  | "cable_car"
  | "gondola"
  | "mixed_lift"
  | "chair_lift"
  | "drag_lift"
  | "t-bar"
  | "j-bar"
  | "platter"
  | "rope_tow"
  | "magic_carpet"
  | "zip_line"
  | "goods"
  | "default";

/**
 * Cable colour by aerialway. Dark, cool and unsaturated so a cable reads as steel against the
 * winter style's snow; enclosed cabins (gondola, cable car) in blue, surface lifts in brown.
 * Magenta is the interface accent and stays out.
 */
export const LIFT_COLORS: Readonly<Record<LiftColorKey, RGBA>> = {
  cable_car: [13, 71, 161, 255],
  gondola: [30, 96, 180, 255],
  mixed_lift: [55, 71, 79, 255],
  chair_lift: [38, 50, 56, 255],
  drag_lift: [109, 76, 65, 255],
  "t-bar": [109, 76, 65, 255],
  "j-bar": [109, 76, 65, 255],
  platter: [109, 76, 65, 255],
  rope_tow: [141, 110, 99, 255],
  magic_carpet: [96, 125, 139, 255],
  zip_line: [0, 105, 92, 255],
  goods: [97, 97, 97, 255],
  default: [66, 66, 66, 255],
};

export interface LiftCablesLayerOptions {
  /** Layer id. Defaults to `unmap-lift-cables`; keep it stable so deck.gl diffs instead of rebuilding. */
  id?: string;
  /**
   * The map's terrain exaggeration (`map.getTerrain()?.exaggeration ?? 1`). Every baked z is
   * multiplied by it, from sea level, as MapLibre multiplies the DEM; see `bakedZ`. Default 1.
   */
  exaggeration?: number;
  /** Cable width in `widthUnits`. Default 2. */
  width?: number;
  /** `pixels` (the default) keeps cables legible at every zoom; `meters` makes them real-sized. */
  widthUnits?: "pixels" | "meters" | "common";
  /** Colours per aerialway, merged over `LIFT_COLORS`. */
  colors?: Partial<Record<string, RGBA>>;
  /** Pick lifts on hover and click. Default false. */
  pickable?: boolean;
  /** MapLibre layer id to draw beneath (interleaved mode), e.g. the first label layer. */
  beforeId?: string;
}

/**
 * A deck.gl `PathLayer` drawing each lift's `cable` in 3D at its baked height.
 *
 * Heights are baked by the pipeline and never queried at render time: deck.gl layers do not drape
 * on MapLibre terrain, so the z in the file is the only thing that puts a cable on the mountain.
 */
export function liftCablesLayer(input: LiftsInput, opts: LiftCablesLayerOptions = {}): PathLayer<Lift3d> {
  const exaggeration = opts.exaggeration ?? 1;
  const colors = { ...LIFT_COLORS, ...opts.colors } as Record<string, RGBA | undefined>;
  const props: PathLayerProps<Lift3d> = {
    id: opts.id ?? "unmap-lift-cables",
    data: liftsOf(input),
    positionFormat: "XYZ",
    getPath: (lift) => lift.cable.map((p) => scaled(p, exaggeration)),
    getColor: (lift) => colors[lift.aerialway] ?? colors.default ?? LIFT_COLORS.default,
    getWidth: opts.width ?? 2,
    widthUnits: opts.widthUnits ?? "pixels",
    widthMinPixels: 1,
    // Cables are seen from every pitch; billboarding keeps a thin line from vanishing edge-on.
    billboard: true,
    capRounded: true,
    jointRounded: true,
    pickable: opts.pickable ?? false,
    updateTriggers: {
      getPath: [exaggeration],
      getColor: [JSON.stringify(opts.colors ?? {})],
    },
  };
  // `beforeId` is read by @deck.gl/maplibre in interleaved mode, not declared on PathLayerProps.
  return new PathLayer<Lift3d>(opts.beforeId ? { ...props, beforeId: opts.beforeId } as PathLayerProps<Lift3d> : props);
}

/** What a model stands for. `station` is both terminals; `pylon` is every tower. */
export type LiftModelKind = "pylon" | "station";

/** One placed model: a station or a pylon of one lift. */
export interface LiftModelInstance {
  /** `<liftId>:<kind>:<index>`, stable across releases while OSM ids are. */
  id: string;
  liftId: string;
  aerialway: string;
  kind: LiftModelKind;
  index: number;
  /** Baked position with z already scaled by the exaggeration. */
  position: LngLatZ;
  /** Direction of the line at this point, degrees clockwise from north. */
  bearing: number;
}

/** The bearing of the cable segment nearest to `p`, or of the station line if there is no cable. */
function lineBearingAt(lift: Lift3d, p: LngLatZ): number {
  const line = lift.cable.length >= 2 ? lift.cable : lift.stations;
  let best = Infinity;
  let at = bearing(lift.stations[0], lift.stations[1]);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const d = segmentDistance2(p, a, b);
    if (d < best && (a[0] !== b[0] || a[1] !== b[1])) {
      best = d;
      at = bearing(a, b);
    }
  }
  return at;
}

/**
 * Every station and pylon as a model instance, oriented along its lift. Exposed so a caller can
 * build their own layer (or a label layer) over the same points `liftModelsLayer` draws.
 */
export function liftModelInstances(input: LiftsInput, exaggeration = 1): LiftModelInstance[] {
  const out: LiftModelInstance[] = [];
  for (const lift of liftsOf(input)) {
    const add = (kind: LiftModelKind, points: readonly LngLatZ[]) =>
      points.forEach((p, index) =>
        out.push({
          id: `${lift.id}:${kind}:${index}`,
          liftId: lift.id,
          aerialway: lift.aerialway,
          kind,
          index,
          position: scaled(p, exaggeration),
          bearing: lineBearingAt(lift, p),
        }),
      );
    add("station", lift.stations);
    add("pylon", lift.pylons);
  }
  return out;
}

export interface LiftModelsLayerOptions {
  /**
   * glTF/GLB URL per kind. Supplied by the caller; this package bundles no models. A kind with no
   * URL is not drawn.
   */
  models: Partial<Record<LiftModelKind, string>>;
  /** Id prefix; each layer is `<id>-<kind>`. Defaults to `unmap-lift-models`. */
  id?: string;
  /** The map's terrain exaggeration, as for `liftCablesLayer`. Default 1. */
  exaggeration?: number;
  /** Model units to metres. Default 1 (models authored in metres). */
  sizeScale?: number;
  /** Extra yaw in degrees, for a model authored facing another way. Default 0. */
  yawOffset?: number;
  pickable?: boolean;
  beforeId?: string;
}

const KINDS: readonly LiftModelKind[] = ["pylon", "station"];

/**
 * deck.gl `ScenegraphLayer`s placing a model at each pylon and station, one layer per kind that
 * has a URL in `models` (a ScenegraphLayer draws one scenegraph).
 *
 * The model origin goes at the baked point. Models are glTF (Y up), so they are rolled 90° onto
 * deck.gl's Z up, and yawed by `-bearing` so the model's forward axis runs up the line.
 */
export function liftModelsLayer(input: LiftsInput, opts: LiftModelsLayerOptions): ScenegraphLayer<LiftModelInstance>[] {
  const exaggeration = opts.exaggeration ?? 1;
  const yawOffset = opts.yawOffset ?? 0;
  const prefix = opts.id ?? "unmap-lift-models";
  const all = liftModelInstances(input, exaggeration);
  const layers: ScenegraphLayer<LiftModelInstance>[] = [];
  for (const kind of KINDS) {
    const url = opts.models[kind];
    if (!url) continue;
    const props: ScenegraphLayerProps<LiftModelInstance> = {
      id: `${prefix}-${kind}`,
      data: all.filter((i) => i.kind === kind),
      scenegraph: url,
      getPosition: (i) => i.position,
      getOrientation: (i) => [0, -i.bearing + yawOffset, 90],
      sizeScale: opts.sizeScale ?? 1,
      _lighting: "pbr",
      pickable: opts.pickable ?? false,
      updateTriggers: { getOrientation: [yawOffset] },
    };
    layers.push(
      new ScenegraphLayer<LiftModelInstance>(
        opts.beforeId ? ({ ...props, beforeId: opts.beforeId } as ScenegraphLayerProps<LiftModelInstance>) : props,
      ),
    );
  }
  return layers;
}
