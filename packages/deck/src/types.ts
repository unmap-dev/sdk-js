/**
 * `[longitude, latitude, z]`, with z in metres above sea level, sampled by the pipeline from the
 * same terrain release the style's `terrain=on` draws. Longitude first, everywhere in unmap.
 */
export type LngLatZ = [number, number, number];

/** One aerial lift, baked in 3D. */
export interface Lift3d {
  /** Stable OSM-derived id, such as `way-123` (the OSM way). */
  id: string;
  name: string | null;
  /** The OSM `aerialway=*` value: `chair_lift`, `gondola`, `t-bar`, `cable_car`, … */
  aerialway: string;
  /** Bottom and top station. */
  stations: [LngLatZ, LngLatZ];
  /** Towers along the line. */
  pylons: LngLatZ[];
  /** The cable as an ordered path from bottom to top, sag included. */
  cable: LngLatZ[];
}

/** The `unmap.ski-lifts-3d.v1` document served by `GET /ski/areas/{id}/lifts-3d`. */
export interface Lifts3dDocument {
  schema: "unmap.ski-lifts-3d.v1";
  /** The ski data release the file was built from. */
  release: string;
  /**
   * The terrain release the z values were sampled from. The heights match the draped terrain only
   * while the style serves this same release; a newer one means a rebuilt file.
   */
  terrain_release: string;
  area_id: string;
  lifts: Lift3d[];
}

/** RGBA, 0–255 per channel, as deck.gl takes colours. */
export type RGBA = [number, number, number, number];
