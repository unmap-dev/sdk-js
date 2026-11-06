import type { Lifts3dDocument } from "./types";

/** A two-lift area in the exact `unmap.ski-lifts-3d.v1` shape the gateway serves. */
export const doc: Lifts3dDocument = {
  schema: "unmap.ski-lifts-3d.v1",
  release: "2026-11-01.abc123",
  terrain_release: "6",
  area_id: "osm-way-123",
  lifts: [
    {
      id: "osm-way-1",
      name: "Eagle Chair",
      aerialway: "chair_lift",
      // Due north: bottom at the south end, top at the north end.
      stations: [
        [-116.0, 51.0, 1600],
        [-116.0, 51.01, 1900],
      ],
      pylons: [
        [-116.0, 51.0025, 1690],
        [-116.0, 51.005, 1765],
        [-116.0, 51.0075, 1840],
      ],
      cable: [
        [-116.0, 51.0, 1610],
        [-116.0, 51.0025, 1700],
        [-116.0, 51.005, 1770],
        [-116.0, 51.0075, 1850],
        [-116.0, 51.01, 1910],
      ],
    },
    {
      id: "osm-way-2",
      name: null,
      aerialway: "gondola",
      // Due east.
      stations: [
        [-116.02, 51.0, 1500],
        [-116.0, 51.0, 1600],
      ],
      pylons: [[-116.01, 51.0, 1560]],
      cable: [
        [-116.02, 51.0, 1510],
        [-116.01, 51.0, 1570],
        [-116.0, 51.0, 1610],
      ],
    },
  ],
};

/** `doc` as the gateway answers it: the ski routes' `{ data, meta }` envelope, the release in meta. */
export function envelope(d: Lifts3dDocument = doc): unknown {
  return {
    data: { schema: d.schema, area_id: d.area_id, terrain_release: d.terrain_release, lifts: d.lifts },
    meta: { data_version: d.release, attribution: "© OpenStreetMap contributors" },
  };
}
