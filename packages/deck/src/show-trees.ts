/**
 * 3D trees on an unmap map: the basemap's woods drawn as small faceted conifers standing on the
 * terrain, from zoom 13.5 in, near the camera. One deck.gl `SimpleMeshLayer` per z14 tile, through
 * `createDeckOverlay` (so they share the map's one interleaved overlay with any 3D lifts).
 *
 * Nothing is fetched: the woods, the water, the buildings, the roads, and the `ski` overlay's runs
 * and lifts when the map has it, come from the vector tiles the map has already loaded
 * (`querySourceFeatures`), and each tree's ground height from the terrain the map draws
 * (`queryTerrainElevation`, exaggeration included). Placement is in trees.ts.
 */

import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import type { Map as MaplibreMap } from "maplibre-gl";
import { openOverlay, type DeckOverlay, type DeckOverlayMap } from "./overlay";
import {
  TREES_MIN_ZOOM,
  boxesOverlap,
  ringsBounds,
  tileBounds,
  tileKey,
  tileTrees,
  tilesAround,
  treeColor,
  type Ring,
  type TileId,
  type TileTrees,
  type TreeMasks,
} from "./trees";

export { TREES_MIN_ZOOM };

/** The basemap's vector source in every unmap style. */
const BASEMAP = "unmap";

/** How far from the camera's focus trees are drawn, in metres. Farther, the woods' fill carries it. */
export const TREES_RADIUS_M = 4000;

/** How far a trunk is sunk into the ground: the drawn terrain is coarser than the DEM. */
export const SINK_M = 2.5;

/** The most trees drawn at once: fewer on a phone. */
export function treeBudget(coarsePointer: boolean): number {
  return coarsePointer ? 60_000 : 180_000;
}

/** The half-width of the strip cleared along a road, by its Protomaps `kind`, in metres. */
const ROAD_CLEARANCE: Record<string, number> = { highway: 16, major_road: 12, medium_road: 9, minor_road: 7, path: 2.5 };

/**
 * Lines to keep trees off, beyond the basemap's roads, railways and rivers: a source and
 * source-layer of the map's style, and the half-width of the strip cleared along each line, in
 * metres, fixed or read from the feature's properties. A source the map does not have is skipped.
 */
export interface TreeClearance {
  source: string;
  sourceLayer: string;
  radiusM: number | ((properties: Record<string, unknown>) => number);
}

/** The `ski` overlay's runs and lifts: a downhill run is a wide cut, a nordic trail a narrow one. */
export const SKI_TREE_CLEARANCE: readonly TreeClearance[] = [
  { source: "overlay:ski", sourceLayer: "runs", radiusM: (p) => (p.piste_type === "downhill" ? 22 : 5) },
  { source: "overlay:ski", sourceLayer: "lifts", radiusM: 8 },
];

/** How long one frame may spend placing trees, so the map keeps moving smoothly. */
const FRAME_BUDGET_MS = 10;

/** Tiles kept, placed, beyond the ones on screen. */
const CACHE_TILES = 96;

/** A faceted spruce one metre tall and one metre in radius: three stacked cones, flat-shaded. */
export function coniferMesh(sides = 7): { positions: Float32Array; normals: Float32Array } {
  const tiers: Array<[number, number, number]> = [
    [0, 0.52, 1],
    [0.3, 0.8, 0.72],
    [0.56, 1, 0.44],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  for (const [base, top, radius] of tiers) {
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const p0 = [Math.cos(a0) * radius, Math.sin(a0) * radius, base];
      const p1 = [Math.cos(a1) * radius, Math.sin(a1) * radius, base];
      const p2 = [0, 0, top];
      // Face normal, outward and up.
      const ux = p1[0]! - p0[0]!, uy = p1[1]! - p0[1]!, uz = p1[2]! - p0[2]!;
      const vx = p2[0]! - p0[0]!, vy = p2[1]! - p0[1]!, vz = p2[2]! - p0[2]!;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length; ny /= length; nz /= length;
      positions.push(...p0, ...p1, ...p2);
      for (let i = 0; i < 3; i++) normals.push(nx, ny, nz);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
}

type Geometry = { type: string; coordinates: unknown };
type Box = [number, number, number, number];
type Polygon = { rings: Ring[]; box: Box };
type Line = { path: Ring; radiusM: number; box: Box };

/** Polygons (each its rings) from a GeoJSON geometry; nothing for any other type. */
function polygonsOf(geometry: Geometry | undefined): Ring[][] {
  if (geometry?.type === "Polygon") return [geometry.coordinates as Ring[]];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates as Ring[][];
  return [];
}

/** Lines from a GeoJSON geometry; nothing for any other type. */
function linesOf(geometry: Geometry | undefined): Ring[] {
  if (geometry?.type === "LineString") return [geometry.coordinates as Ring];
  if (geometry?.type === "MultiLineString") return geometry.coordinates as Ring[];
  return [];
}

/** The part of a MapLibre map the trees read. */
type TreesMap = Pick<
  MaplibreMap,
  "getZoom" | "getBounds" | "unproject" | "getCanvas" | "querySourceFeatures" | "getSource" | "queryTerrainElevation" | "getStyle" | "on" | "off" | "isStyleLoaded"
>;

/** Everything the map holds now that a tile's mask is drawn from, each with its bounding box. */
interface Features {
  woods: Polygon[];
  clear: Polygon[];
  lines: Line[];
  /** Land polygons: where there are none, the tile's vector data is not loaded (or it is sea). */
  earth: Box[];
}

function readFeatures(map: TreesMap, clearance: readonly TreeClearance[]): Features {
  const query = (source: string, sourceLayer: string, filter?: unknown[]) =>
    map.getSource(source) ? map.querySourceFeatures(source, { sourceLayer, ...(filter ? { filter: filter as never } : {}) }) : [];
  const polygons = (features: ReturnType<typeof query>): Polygon[] =>
    features.flatMap((feature) => polygonsOf(feature.geometry as Geometry).map((rings) => ({ rings, box: ringsBounds(rings) })));
  const lines = (features: ReturnType<typeof query>, radius: (properties: Record<string, unknown>) => number): Line[] =>
    features.flatMap((feature) => {
      const radiusM = radius(feature.properties ?? {});
      return linesOf(feature.geometry as Geometry).map((path) => ({ path, radiusM, box: ringsBounds([path]) }));
    });
  const water = query(BASEMAP, "water");
  return {
    woods: polygons(query(BASEMAP, "landuse", ["in", ["get", "kind"], ["literal", ["wood", "forest"]]])),
    clear: [...polygons(water), ...polygons(query(BASEMAP, "buildings"))],
    lines: [
      ...lines(query(BASEMAP, "roads"), (p) => ROAD_CLEARANCE[String(p.kind)] ?? 6),
      ...lines(query(BASEMAP, "transit"), () => 6),
      ...lines(water, () => 6),
      ...clearance.flatMap(({ source, sourceLayer, radiusM }) =>
        lines(query(source, sourceLayer), typeof radiusM === "function" ? radiusM : () => radiusM),
      ),
    ],
    earth: polygons(query(BASEMAP, "earth")).map((polygon) => polygon.box),
  };
}

/** What a tile's mask is drawn from: the features whose boxes reach it. */
function masksFor(tile: TileId, features: Features): TreeMasks | null {
  const box = tileBounds(tile);
  const woods = features.woods.filter((polygon) => boxesOverlap(polygon.box, box)).map((polygon) => polygon.rings);
  if (woods.length === 0) return { woods: [], clear: [], lines: [] };
  const reach = tileBounds(tile, 25);
  return {
    woods,
    clear: features.clear.filter((polygon) => boxesOverlap(polygon.box, box)).map((polygon) => polygon.rings),
    lines: features.lines.filter((line) => boxesOverlap(line.box, reach)).map(({ path, radiusM }) => ({ path, radiusM })),
  };
}

/** A tile's trees, with each tree's foot height on the drawn terrain. */
interface PlacedTile extends TileTrees {
  z: Float32Array;
  /** The whole map zoom the heights were read at: closer in, the terrain is finer, so they are read again. */
  sampledAt: number;
  /** Bumped when `z` changes, so deck.gl re-reads the positions. */
  version: number;
  /** The `data` deck.gl is given: the same object for as long as the tile's trees are the same. */
  data: { length: number };
}

function sampleHeights(map: TreesMap, tile: PlacedTile, zoom: number): void {
  for (let i = 0; i < tile.count; i++) {
    const ground = map.queryTerrainElevation([tile.lngLat[i * 2]!, tile.lngLat[i * 2 + 1]!]) ?? 0;
    tile.z[i] = ground - SINK_M;
  }
  tile.sampledAt = zoom;
  tile.version += 1;
}

export interface ShowTreesOptions {
  /** The most trees drawn at once. Defaults to 180,000, or 60,000 on a touch screen. */
  budget?: number;
  /**
   * Lines to keep trees off besides the basemap's roads, railways and rivers. Defaults to
   * `SKI_TREE_CLEARANCE`, the `ski` overlay's runs and lifts, skipped on a map without it.
   */
  clear?: readonly TreeClearance[];
  /** The style layer the trees are drawn under. Defaults to the first symbol layer, so labels stay on top. */
  beforeId?: string;
  /** Fires with the number of trees drawn after each change. */
  onCount?: (count: number) => void;
}

/**
 * Draw the map's woods as 3D trees until the returned function is called. Needs 3D terrain on the
 * map, not `deckMapOptions`: the trees have no lines that antialiasing would smooth. Waits for the map to be idle before placing trees, places them a few tiles per frame, and
 * keeps the tiles it placed so a return visit costs nothing. Call it again after a style swap: a new
 * exaggeration redraws the terrain the trees stand on.
 *
 *   const stop = showTrees(map);
 *   stop();
 */
export function showTrees(map: DeckOverlayMap, options: ShowTreesOptions = {}): () => void {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const budget = options.budget ?? treeBudget(coarse);
  const cache = new Map<string, PlacedTile>();
  let stopped = false;
  let pass = 0;
  let frame = 0;
  let drawn = -1;
  let drawnSignature: string | null = null;
  let deck: DeckOverlay | null = null;
  const clearance = options.clear ?? SKI_TREE_CLEARANCE;

  // Under the labels, so place names and the ski overlay's labels stay readable over the woods.
  const beforeId = options.beforeId ?? map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;
  const mesh = coniferMesh();
  const geometry = { attributes: { POSITION: { value: mesh.positions, size: 3 }, NORMAL: { value: mesh.normals, size: 3 } } };
  const makeLayer = (tile: PlacedTile) =>
    new SimpleMeshLayer<unknown>({
      id: `unmap-trees-${tile.key}`,
      data: tile.data as never,
      mesh: geometry as never,
      pickable: false,
      ...(beforeId ? { beforeId } : {}),
      getPosition: ((_: unknown, { index, target }: { index: number; target: number[] }) => {
        target[0] = tile.lngLat[index * 2]!;
        target[1] = tile.lngLat[index * 2 + 1]!;
        target[2] = tile.z[index]!;
        return target;
      }) as never,
      getScale: ((_: unknown, { index }: { index: number }) => [tile.crown[index]!, tile.crown[index]!, tile.height[index]! + SINK_M]) as never,
      getOrientation: ((_: unknown, { index }: { index: number }) => [0, tile.yaw[index]!, 0]) as never,
      getColor: ((_: unknown, { index }: { index: number }) => treeColor(tile.shade[index]!)) as never,
      updateTriggers: { getPosition: tile.version, getScale: tile.version },
    });

  const draw = (tiles: PlacedTile[]) => {
    if (!deck) return;
    const shown: PlacedTile[] = [];
    let total = 0;
    for (const tile of tiles) {
      if (tile.count === 0) continue;
      if (total + tile.count > budget) break;
      total += tile.count;
      shown.push(tile);
    }
    // New layers redraw the map, and a redraw ends in another `idle`: set them only when they change.
    const signature = shown.map((tile) => `${tile.key}@${tile.version}`).join(",");
    if (signature === drawnSignature) return;
    drawnSignature = signature;
    deck.setLayers(shown.map(makeLayer));
    if (total !== drawn) options.onCount?.(total);
    drawn = total;
  };

  const run = () => {
    if (stopped || !deck) return;
    const mine = ++pass;
    cancelAnimationFrame(frame);
    const zoom = map.getZoom();
    if (zoom < TREES_MIN_ZOOM) {
      draw([]);
      return;
    }
    const canvas = map.getCanvas();
    // The ground a quarter of the way up from the bottom of the screen: under a tilted camera,
    // the trees that fill the view are nearer than the map's centre.
    const focus = map.unproject([canvas.clientWidth / 2, canvas.clientHeight * 0.75]);
    const bounds = map.getBounds();
    const view: Box = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const wanted = tilesAround(focus.lng, focus.lat, TREES_RADIUS_M).filter((tile) => boxesOverlap(tileBounds(tile), view));
    const whole = Math.floor(zoom);
    let features: Features | null = null;
    let index = 0;

    const step = () => {
      if (stopped || mine !== pass) return;
      const start = performance.now();
      while (index < wanted.length && performance.now() - start < FRAME_BUDGET_MS) {
        const tile = wanted[index++]!;
        const key = tileKey(tile);
        const placed = cache.get(key);
        if (placed) {
          if (placed.sampledAt < whole) sampleHeights(map, placed, whole);
          // Most recently used last.
          cache.delete(key);
          cache.set(key, placed);
          continue;
        }
        features ??= readFeatures(map, clearance);
        const masks = masksFor(tile, features);
        if (!masks) continue;
        const trees = tileTrees(tile, masks);
        const fresh: PlacedTile = { ...trees, z: new Float32Array(trees.count), sampledAt: whole, version: 0, data: { length: trees.count } };
        sampleHeights(map, fresh, whole);
        // A tile with no land under it may not have loaded yet: place it again next time.
        const box = tileBounds(tile);
        if (features.earth.some((earth) => boxesOverlap(earth, box))) cache.set(key, fresh);
        else continue;
      }
      while (cache.size > CACHE_TILES + wanted.length) cache.delete(cache.keys().next().value!);
      draw(wanted.map((tile) => cache.get(tileKey(tile))).filter((tile): tile is PlacedTile => tile !== undefined));
      if (index < wanted.length) frame = requestAnimationFrame(step);
    };
    step();
  };

  // Trees have no lines to roughen, so an unantialiased map is fine and is not warned about.
  deck = openOverlay(map, {}, false);
  map.on("idle", run);
  if (map.isStyleLoaded()) run();

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    map.off("idle", run);
    deck?.remove();
    deck = null;
    cache.clear();
  };
}
