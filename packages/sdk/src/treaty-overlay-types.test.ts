import { describe, expectTypeOf, it } from "vitest";
import type { Map as MaplibreMap } from "@unmap/maps";
import type { Geocoder, TreatyLookupClient, TreatyMapLike } from "./index";

describe("createTreatyOverlay types", () => {
  it("accepts a real MapLibre map and the geocoder without a cast", () => {
    expectTypeOf<MaplibreMap>().toMatchTypeOf<TreatyMapLike>();
    expectTypeOf<Geocoder>().toMatchTypeOf<TreatyLookupClient>();
  });
});
