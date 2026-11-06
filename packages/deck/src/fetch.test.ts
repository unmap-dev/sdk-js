import { describe, expect, it } from "vitest";
import { UnmapError } from "@unmap/core";
import { LIFTS_3D_SCHEMA, Lifts3dError, fetchLifts3d } from "./fetch";
import { doc, envelope } from "./fixtures";

function stub(body: unknown, status = 200): { calls: { url: string; init?: RequestInit }[]; fetch: typeof fetch } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetch: fetchImpl };
}

describe("fetchLifts3d", () => {
  it("GETs /ski/areas/{id}/lifts-3d on the default gateway with the key", async () => {
    const s = stub(envelope());
    const got = await fetchLifts3d({ key: "um_test_x", areaId: "osm-way-123", fetch: s.fetch });
    expect(got).toEqual(doc);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.url).toBe("https://api.unmap.dev/ski/areas/osm-way-123/lifts-3d?key=um_test_x");
  });

  it("uses a custom gateway, trims its trailing slash and encodes the id", async () => {
    const s = stub(envelope());
    await fetchLifts3d({ key: "um_test_x", areaId: "a/b c", gateway: "http://localhost:8787/", fetch: s.fetch });
    expect(s.calls[0]!.url).toBe("http://localhost:8787/ski/areas/a%2Fb%20c/lifts-3d?key=um_test_x");
  });

  it("sends the key in the query only, never as a header", async () => {
    const s = stub(envelope());
    await fetchLifts3d({ key: "um_test_secret", areaId: "x", fetch: s.fetch });
    const headers = new Headers(s.calls[0]!.init?.headers);
    for (const [, value] of headers) expect(value).not.toContain("um_test_secret");
  });

  it("passes the abort signal through", async () => {
    const s = stub(envelope());
    const controller = new AbortController();
    await fetchLifts3d({ key: "k", areaId: "x", fetch: s.fetch, signal: controller.signal });
    expect(s.calls[0]!.init?.signal).toBe(controller.signal);
  });

  it("throws Lifts3dError with the gateway's status, code and message on non-2xx", async () => {
    const s = stub({ error: "this key has no ski add-on", code: "addon_required" }, 403);
    const err = await fetchLifts3d({ key: "um_test_secret", areaId: "x", fetch: s.fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Lifts3dError);
    expect(err).toBeInstanceOf(UnmapError);
    const e = err as Lifts3dError;
    expect(e.name).toBe("Lifts3dError");
    expect(e.status).toBe(403);
    expect(e.code).toBe("addon_required");
    expect(e.message).toContain("this key has no ski add-on");
    expect(e.message).not.toContain("um_test_secret");
  });

  it("throws on non-2xx with a body that is not JSON", async () => {
    const s = stub("<html>bad gateway</html>", 502);
    const e = (await fetchLifts3d({ key: "k", areaId: "x", fetch: s.fetch }).catch((x: unknown) => x)) as Lifts3dError;
    expect(e).toBeInstanceOf(Lifts3dError);
    expect(e.status).toBe(502);
    expect(e.code).toBeUndefined();
  });

  it("refuses a document with another schema", async () => {
    const s = stub(envelope({ ...doc, schema: "unmap.ski-lifts-3d.v2" } as unknown as typeof doc));
    const e = (await fetchLifts3d({ key: "k", areaId: "x", fetch: s.fetch }).catch((x: unknown) => x)) as Lifts3dError;
    expect(e).toBeInstanceOf(Lifts3dError);
    expect(e.code).toBe("schema_mismatch");
    expect(e.message).toContain(LIFTS_3D_SCHEMA);
  });

  it("refuses a body that is not a lifts document", async () => {
    for (const body of [null, [], { schema: LIFTS_3D_SCHEMA }, { schema: LIFTS_3D_SCHEMA, lifts: {} }]) {
      const s = stub(body);
      const e = await fetchLifts3d({ key: "k", areaId: "x", fetch: s.fetch }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(Lifts3dError);
    }
  });

  it("requires a key and an area id before spending a call", async () => {
    const s = stub(envelope());
    await expect(fetchLifts3d({ key: "", areaId: "x", fetch: s.fetch })).rejects.toBeInstanceOf(Lifts3dError);
    await expect(fetchLifts3d({ key: "k", areaId: "", fetch: s.fetch })).rejects.toBeInstanceOf(Lifts3dError);
    expect(s.calls).toHaveLength(0);
  });
});
