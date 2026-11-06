import { describe, expect, it } from "vitest";
import { PathLayer } from "@deck.gl/layers";
import { ScenegraphLayer } from "@deck.gl/mesh-layers";
import type { AccessorContext } from "@deck.gl/core";
import { doc } from "./fixtures";
import { LIFT_COLORS, liftCablesLayer, liftModelInstances, liftModelsLayer, type LiftModelInstance } from "./layers";
import type { Lift3d } from "./types";

// deck.gl calls accessors with (object, {index, data, target}); the helpers here read only the object.
const ctx = {} as AccessorContext<never>;

function call<T, R>(accessor: unknown, d: T): R {
  return (accessor as (d: T, c: AccessorContext<T>) => R)(d, ctx as unknown as AccessorContext<T>);
}

const [chair, gondola] = doc.lifts as [Lift3d, Lift3d];

describe("liftCablesLayer", () => {
  it("is a real PathLayer over the document's lifts with a stable id", () => {
    const layer = liftCablesLayer(doc);
    expect(layer).toBeInstanceOf(PathLayer);
    expect(layer.id).toBe("unmap-lift-cables");
    expect(layer.props.data).toBe(doc.lifts);
    expect(liftCablesLayer(doc).id).toBe(layer.id);
    expect(liftCablesLayer(doc, { id: "mine" }).id).toBe("mine");
  });

  it("accepts the bare lifts array too", () => {
    expect(liftCablesLayer(doc.lifts).props.data).toBe(doc.lifts);
  });

  it("draws each lift's cable with its baked z at exaggeration 1", () => {
    const layer = liftCablesLayer(doc);
    expect(call(layer.props.getPath, chair)).toEqual(chair.cable);
    expect(layer.props.positionFormat).toBe("XYZ");
  });

  it("scales z by the terrain exaggeration and leaves lng/lat alone", () => {
    const layer = liftCablesLayer(doc, { exaggeration: 1.5 });
    const path = call<Lift3d, number[][]>(layer.props.getPath, gondola);
    expect(path).toEqual([
      [-116.02, 51.0, 1510 * 1.5],
      [-116.01, 51.0, 1570 * 1.5],
      [-116.0, 51.0, 1610 * 1.5],
    ]);
    // A changed exaggeration must recompute the paths, not reuse the cached attribute.
    expect(layer.props.updateTriggers).toMatchObject({ getPath: [1.5] });
  });

  it("colours by aerialway, with a fallback for types it does not know", () => {
    const layer = liftCablesLayer(doc);
    expect(call(layer.props.getColor, chair)).toEqual(LIFT_COLORS.chair_lift);
    expect(call(layer.props.getColor, gondola)).toEqual(LIFT_COLORS.gondola);
    expect(call(layer.props.getColor, { ...chair, aerialway: "zip_line_of_dreams" })).toEqual(LIFT_COLORS.default);
    expect(LIFT_COLORS.chair_lift).not.toEqual(LIFT_COLORS.gondola);
  });

  it("lets the caller override colours per aerialway", () => {
    const layer = liftCablesLayer(doc, { colors: { gondola: [1, 2, 3, 255] } });
    expect(call(layer.props.getColor, gondola)).toEqual([1, 2, 3, 255]);
    expect(call(layer.props.getColor, chair)).toEqual(LIFT_COLORS.chair_lift);
  });

  it("is 2 px wide by default and takes a width in metres", () => {
    const px = liftCablesLayer(doc);
    expect(px.props.getWidth).toBe(2);
    expect(px.props.widthUnits).toBe("pixels");
    const m = liftCablesLayer(doc, { width: 1.5, widthUnits: "meters" });
    expect(m.props.getWidth).toBe(1.5);
    expect(m.props.widthUnits).toBe("meters");
  });

  it("is pickable only when asked", () => {
    expect(liftCablesLayer(doc).props.pickable).toBe(false);
    expect(liftCablesLayer(doc, { pickable: true }).props.pickable).toBe(true);
  });
});

describe("liftModelInstances", () => {
  it("places one instance per station and pylon, with stable ids", () => {
    const all = liftModelInstances(doc);
    expect(all.filter((i) => i.kind === "station")).toHaveLength(4);
    expect(all.filter((i) => i.kind === "pylon")).toHaveLength(4);
    expect(all.map((i) => i.id)).toContain("osm-way-1:pylon:0");
    expect(all.map((i) => i.id)).toContain("osm-way-2:station:1");
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
  });

  it("orients each along its lift's line", () => {
    const all = liftModelInstances(doc);
    const north = all.filter((i) => i.liftId === "osm-way-1");
    const east = all.filter((i) => i.liftId === "osm-way-2");
    for (const i of north) expect(i.bearing).toBeCloseTo(0, 1);
    for (const i of east) expect(i.bearing).toBeCloseTo(90, 1);
  });

  it("scales z by the exaggeration", () => {
    const [first] = liftModelInstances(doc, 2);
    expect(first!.position).toEqual([-116.0, 51.0, 3200]);
  });

  it("orients a lift with no cable along its stations", () => {
    const lift: Lift3d = { ...gondola, cable: [] };
    for (const i of liftModelInstances([lift])) expect(i.bearing).toBeCloseTo(90, 1);
  });
});

describe("liftModelsLayer", () => {
  const models = { pylon: "https://example.test/pylon.glb", station: "https://example.test/station.glb" };

  it("returns one real ScenegraphLayer per kind that has a model, with stable ids", () => {
    const layers = liftModelsLayer(doc, { models });
    expect(layers).toHaveLength(2);
    for (const l of layers) expect(l).toBeInstanceOf(ScenegraphLayer);
    expect(layers.map((l) => l.id)).toEqual(["unmap-lift-models-pylon", "unmap-lift-models-station"]);
    // `scenegraph` is an async prop: deck.gl keeps the URL as given under a registered symbol
    // and resolves `props.scenegraph` to the loaded glTF later.
    const original = (layers[0]!.props as unknown as Record<symbol, { scenegraph?: unknown }>)[Symbol.for("asyncPropOriginal")];
    expect(original?.scenegraph).toBe(models.pylon);
    expect(liftModelsLayer(doc, { models, id: "x" }).map((l) => l.id)).toEqual(["x-pylon", "x-station"]);
  });

  it("skips kinds with no model URL rather than drawing a placeholder", () => {
    const layers = liftModelsLayer(doc, { models: { pylon: models.pylon } });
    expect(layers.map((l) => l.id)).toEqual(["unmap-lift-models-pylon"]);
    expect((layers[0]!.props.data as LiftModelInstance[]).every((i) => i.kind === "pylon")).toBe(true);
    expect(liftModelsLayer(doc, { models: {} })).toEqual([]);
  });

  it("positions at the exaggerated baked z and yaws by the line bearing", () => {
    const [pylons] = liftModelsLayer(doc, { models, exaggeration: 1.5 });
    const data = pylons!.props.data as LiftModelInstance[];
    const first = data[0]!;
    expect(call(pylons!.props.getPosition, first)).toEqual([-116.0, 51.0025, 1690 * 1.5]);
    const east = data.find((i) => i.liftId === "osm-way-2")!;
    const [pitch, yaw, roll] = call<LiftModelInstance, number[]>(pylons!.props.getOrientation, east);
    expect(pitch).toBe(0);
    expect(yaw).toBeCloseTo(-90, 1);
    expect(roll).toBe(90);
    expect(pylons!.props.updateTriggers).toMatchObject({ getOrientation: [0] });
  });

  it("applies a yaw offset for models authored facing another way", () => {
    const [pylons] = liftModelsLayer(doc, { models, yawOffset: 90 });
    const first = (pylons!.props.data as LiftModelInstance[])[0]!;
    const [, yaw] = call<LiftModelInstance, number[]>(pylons!.props.getOrientation, first);
    expect(yaw).toBeCloseTo(90, 1);
  });
});
