import { describe, expect, it } from "vitest";
import { UnmapError } from "@unmap/core";
import { Byod, Catalog, CatalogError, type ByodOverlay } from "./catalog";

function client(handler: (url: URL, init?: RequestInit) => Response) {
  const seen: { url: URL; init?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return {
    layers: new Catalog({ key: "um_test_k", fetch: impl }),
    byod: new Byod({ key: "um_test_k", fetch: impl }),
    seen,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const OVERLAY: ByodOverlay = {
  id: "ovl_0123456789ab",
  name: "Service areas",
  kind: "geojson",
  bytes: 4096,
  createdAt: "2026-09-17T00:00:00Z",
  url: "https://api.unmap.dev/byod/ovl_0123456789ab/data",
  overlay: "byod:ovl_0123456789ab",
};

describe("Catalog", () => {
  it("lists layers, accepting either envelope shape", async () => {
    const wrapped = client(() => json({ layers: [{ id: "survey.dls" }] }));
    expect((await wrapped.layers.list())[0]!.id).toBe("survey.dls");

    const bare = client(() => json([{ id: "survey.dls" }]));
    expect((await bare.layers.list())[0]!.id).toBe("survey.dls");
  });

  it("fetches one layer and encodes its id", async () => {
    const { layers, seen } = client(() => json({ id: "survey.dls", attribution: "Township Canada" }));
    const layer = await layers.get("survey.dls");
    expect(seen[0]!.url.pathname).toBe("/layers/survey.dls");
    expect(layer.attribution).toBe("Township Canada");
  });

  it("narrows by jurisdiction, and sends nothing extra when none is asked for", async () => {
    const { layers, seen } = client(() => json([]));
    await layers.list({ jurisdiction: "CA-AB" });
    await layers.list();
    expect(seen[0]!.url.searchParams.get("jurisdiction")).toBe("CA-AB");
    expect(seen[1]!.url.searchParams.has("jurisdiction")).toBe(false);
  });

  it("surfaces a retired or unknown id as the gateway's plain 404 not_found", async () => {
    // The gateway keeps no aliases for renamed layers (docs/decisions/2026-10-04-no-backward-
    // compatibility.md), so an old id is the ordinary unknown-layer error, not a 410 or a redirect.
    const { layers } = client(() => json({ error: "unknown layer", code: "not_found" }, 404));
    const error = await layers.get("ca.rail").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogError);
    expect(error).toBeInstanceOf(UnmapError);
    expect(error).toMatchObject({ status: 404, code: "not_found" });
    expect(String(error)).toContain("unknown layer");
  });

  it("types addon as the capability id the gateway sends, not the SKU", async () => {
    const { layers } = client(() => json({ id: "survey.dls", addon: "legalLand" }));
    const layer = await layers.get("survey.dls");
    expect(layer.addon).toBe("legalLand");
  });

  it("retries a read that met a 503", async () => {
    let calls = 0;
    const { layers } = client(() => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 503, headers: { "retry-after": "0" } })
        : json([{ id: "parks" }]);
    });
    expect((await layers.list())[0]!.id).toBe("parks");
    expect(calls).toBe(2);
  });

  it("carries the governance fields a caller has to display", async () => {
    // The reason to read the catalog rather than hard-code a layer id: showing a layer means
    // showing its attribution.
    const { layers } = client(() =>
      json({ id: "x", licence: "OGL-BC", attribution: "Province of BC", coverage: "BC only", known_gaps: "not national" }),
    );
    const layer = await layers.get("x");
    expect(layer.licence).toBe("OGL-BC");
    expect(layer.attribution).toBe("Province of BC");
    expect(layer.known_gaps).toBe("not national");
  });
});

describe("Byod.upload", () => {
  it("sends a plain object as GeoJSON", async () => {
    const { byod, seen } = client(() => json(OVERLAY, 201));
    await byod.upload({ type: "FeatureCollection", features: [] }, { name: "Areas" });
    expect(seen[0]!.init?.method).toBe("POST");
    expect((seen[0]!.init?.headers as Record<string, string>)["content-type"]).toBe("application/geo+json");
    expect(seen[0]!.url.searchParams.get("name")).toBe("Areas");
    expect(JSON.parse(String(seen[0]!.init?.body)).type).toBe("FeatureCollection");
  });

  it("sends raw bytes as PMTiles by default", async () => {
    const { byod, seen } = client(() => json(OVERLAY, 201));
    await byod.upload(new Uint8Array([1, 2, 3]));
    expect((seen[0]!.init?.headers as Record<string, string>)["content-type"]).toBe("application/vnd.pmtiles");
  });

  it("lets the caller override the kind for raw bytes", async () => {
    const { byod, seen } = client(() => json(OVERLAY, 201));
    await byod.upload(new Uint8Array([1, 2, 3]), { kind: "geojson" });
    expect((seen[0]!.init?.headers as Record<string, string>)["content-type"]).toBe("application/geo+json");
  });

  it("sends a Blob as multipart WITHOUT setting content-type by hand", async () => {
    // Setting it would omit the multipart boundary and produce a request the server cannot parse.
    // The runtime has to add the header itself.
    const { byod, seen } = client(() => json(OVERLAY, 201));
    await byod.upload(new Blob(["{}"], { type: "application/geo+json" }), { name: "From a file input" });
    expect(seen[0]!.init?.headers).toBeUndefined();
    expect(seen[0]!.init?.body).toBeInstanceOf(FormData);
    const form = seen[0]!.init?.body as FormData;
    expect(form.get("name")).toBe("From a file input");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("returns the record, so the byod: token is what a caller reaches for", async () => {
    // `overlays` takes `byod:<id>`, not the bare id. Returning the whole record rather than just
    // the id is what makes that hard to get wrong.
    const { byod } = client(() => json(OVERLAY, 201));
    const result = await byod.upload({ type: "FeatureCollection" });
    expect(result.overlay).toBe("byod:ovl_0123456789ab");
    expect(result.overlay).not.toBe(result.id);
  });

  it("throws the server's own limit message rather than a generic failure", async () => {
    const { byod } = client(() => json({ error: "at most 10 overlays per account", code: "bad_request" }, 400));
    await expect(byod.upload({ type: "FeatureCollection" })).rejects.toMatchObject({
      status: 400,
      code: "bad_request",
      message: expect.stringContaining("at most 10 overlays"),
    });
  });

  it("never retries an upload, because a retry could store the overlay twice", async () => {
    let calls = 0;
    const { byod } = client(() => {
      calls += 1;
      return new Response(null, { status: 503, headers: { "retry-after": "0" } });
    });
    await expect(byod.upload({ type: "FeatureCollection" })).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(1);
  });
});

describe("Byod", () => {
  it("reports the server's limits rather than a constant that could drift", async () => {
    const { byod } = client(() =>
      json({ overlays: [OVERLAY], limits: { maxFiles: 10, maxBytes: 5_242_880, kinds: ["geojson", "pmtiles"] } }),
    );
    const list = await byod.list();
    expect(list.limits.maxFiles).toBe(10);
    expect(list.overlays[0]!.overlay).toBe("byod:ovl_0123456789ab");
  });

  it("deletes by id", async () => {
    const { byod, seen } = client(() => new Response(null, { status: 204 }));
    await byod.delete("ovl_0123456789ab");
    expect(seen[0]!.init?.method).toBe("DELETE");
    expect(seen[0]!.url.pathname).toBe("/byod/ovl_0123456789ab");
  });

  it("hands back the raw Response for data, because one kind is a binary archive", async () => {
    const { byod } = client(() => new Response("PMTiles bytes", { status: 200 }));
    const res = await byod.data("ovl_0123456789ab");
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toBe("PMTiles bytes");
  });

  it("throws rather than returning a failed Response from data()", async () => {
    const { byod } = client(() => json({ error: "not found" }, 404));
    await expect(byod.data("ovl_nope")).rejects.toMatchObject({ status: 404 });
  });
});
