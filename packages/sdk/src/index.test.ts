import { describe, it, expect, vi } from "vitest";

// Mock @unmap/maps so maplibre-gl never loads in the Node test environment.
vi.mock("@unmap/maps", () => ({
  createMap: (o: unknown) => ({ __map: true, opts: o }),
  unmapStyle: () => "",
  DEMO_CITIES: ["calgary", "montreal", "iqaluit"],
  maplibregl: {},
}));

import { Unmap, Geocoder, Router, Transit } from "./index";
import type { CoverageDocument, CoverageSource } from "./coverage";

describe("Unmap", () => {
  it("always exposes geocoder + router; no map without a container", () => {
    const u = new Unmap({ key: "um_test_x" });
    expect(u.geocoder).toBeInstanceOf(Geocoder);
    expect(u.router).toBeInstanceOf(Router);
    expect(u.transit).toBeInstanceOf(Transit);
    expect(u.map).toBeUndefined();
  });

  it("creates a map when a container is given", () => {
    const u = new Unmap({ key: "um_test_x", container: "#map", center: [-75.69, 45.42] });
    expect(u.map).toBeDefined();
  });

  it("identify delegates to the geocoder", async () => {
    const u = new Unmap({ key: "um_test_x" });
    const identify = vi.spyOn(u.geocoder, "identify").mockResolvedValue({ at: [-114, 51], results: [] });
    await expect(u.identify({ at: [-114, 51] })).resolves.toEqual({ at: [-114, 51], results: [] });
    expect(identify).toHaveBeenCalledWith({ at: [-114, 51] });
  });

  it("data.query delegates to the geocoder", async () => {
    const u = new Unmap({ key: "um_test_x" });
    const payload = { layer: "energy.wells" as const, bbox: [-114.3, 50.9, -113.8, 51.2] as [number, number, number, number], results: [] };
    const query = vi.spyOn(u.geocoder, "queryLayer").mockResolvedValue(payload);
    await expect(u.data.query({ layer: "energy.wells", bbox: [-114.3, 50.9, -113.8, 51.2] })).resolves.toEqual(payload);
    expect(query).toHaveBeenCalledWith({ layer: "energy.wells", bbox: [-114.3, 50.9, -113.8, 51.2] });
  });

  it("exposes elevation on the same key", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ elevations: [1046.9], units: "m", datum: "CGVD2013", resolution: 30 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const unmap = new Unmap({ key: "um_test_x", fetch: fetchImpl });
    const [metres] = await unmap.elevation.get([-114.0719, 51.0447]);
    expect(metres).toBe(1046.9);
    expect(calls[0]).toContain("/elevation?key=um_test_x&near=-114.0719%2C51.0447");
    expect(calls[0]).not.toMatch(/[?&](lon|lat)=/);
  });

  it("looks up a timezone from longitude, latitude", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ timezone: "America/Edmonton", offset: "-06:00", offsetSeconds: -21600, dst: true }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const unmap = new Unmap({ key: "um_test_x", fetch: fetchImpl });
    const zone = await unmap.timezone.lookup([-114.0719, 51.0447], { at: new Date("2026-07-01T18:00:00Z") });
    expect(zone.timezone).toBe("America/Edmonton");
    expect(calls[0]).toContain("/timezone?");
    expect(calls[0]).toContain("lon=-114.0719");
    expect(calls[0]).toContain("lat=51.0447");
    expect(calls[0]).toContain("at=2026-07-01T18%3A00%3A00.000Z");
  });
});

describe("coverage document types", () => {
  it("carries one key per fact", () => {
    const basis: CoverageDocument["freshness_basis"] = { en: "x", fr: "x" };
    const schema: CoverageDocument["provenance_schema"] = "unmap.provenance.v1";
    const status: CoverageDocument["capabilities"][number]["freshness_status"] = "current";
    const version: CoverageSource["provenance"]["version"] = "v";
    const staleAfter: CoverageSource["provenance"]["freshness_policy"]["stale_after"] = null;
    const notes: CoverageSource["notes"] = undefined;
    // @ts-expect-error the flat projection is gone
    const flat: CoverageSource["last_success_at"] = null;
    // @ts-expect-error the capability carries freshness_status only
    const old: CoverageDocument["capabilities"][number]["freshness"] = "current";
    void [basis, schema, status, version, staleAfter, notes, flat, old];
  });
});
