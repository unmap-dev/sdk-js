import { describe, it, expect } from "vitest";
import { Elevation, ElevationError, MAX_ELEVATION_POINTS, MAX_REQUEST_URL_BYTES } from "./index";

function stub(body: unknown, status = 200): { calls: string[]; fetch: typeof fetch } {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetch: fetchImpl };
}

const answer = { elevations: [1046.9], units: "m", datum: "CGVD2013", resolution: 30 };

describe("Elevation", () => {
  it("preserves ordered values from a global response with mixed metadata", async () => {
    const values = [-432, 0, null, 1046.2];
    const s = stub({ elevations: values, units: "m", datum: "mixed", resolution: null, model: "mixed", sampling: { zoom: 12, tile_size: 512, height_increment_m: 0.5, interpolation: "bilinear" }, meta: { source: "Mapterhorn" } });
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    expect(await client.get([[35.5, 31.5], [180, 0], [0, 86], [-114, 51]])).toEqual(values);
  });
  it("sends one coordinate as near=lng,lat", async () => {
    const s = stub(answer);
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    expect(await client.get([-114.0719, 51.0447])).toEqual([1046.9]);
    expect(s.calls[0]).toContain("/elevation?key=um_test_x&near=-114.0719%2C51.0447");
    expect(s.calls[0]).not.toMatch(/[?&](lon|lat)=/);
    expect(s.calls[0]).not.toContain("points=");
  });
  it("sends only lng,lat for one position that carries an altitude", async () => {
    const s = stub(answer);
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    await client.get([-114.0719, 51.0447, 1046] as unknown as [number, number]);
    expect(s.calls[0]).toContain("near=-114.0719%2C51.0447");
    expect(s.calls[0]).not.toContain("%2C1046");
  });

  it("sends several as points", async () => {
    const s = stub({ ...answer, elevations: [1046.9, 1731.2] });
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    expect(await client.get([
      [-114.0719, 51.0447],
      [-115.5708, 51.1784],
    ])).toEqual([1046.9, 1731.2]);
    // Safe: client.get resolved, which only happens after the stub fetch ran and recorded a call.
    expect(decodeURIComponent(s.calls[0]!)).toContain("points=-114.0719,51.0447|-115.5708,51.1784");
  });

  it("passes null through rather than turning it into zero", async () => {
    const s = stub({ ...answer, elevations: [null] });
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    expect(await client.get([-30, 40])).toEqual([null]);
  });

  it("refuses an over-long batch before spending a call on it", async () => {
    const s = stub(answer);
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    const many: [number, number][] = Array.from({ length: MAX_ELEVATION_POINTS + 1 }, () => [-114, 51]);
    await expect(client.get(many)).rejects.toThrow(/at most 1000/);
    expect(s.calls).toHaveLength(0);
  });

  it("refuses a batch whose URL would not survive the edge, before spending a call on it", async () => {
    // The 1000-point cap is not the binding limit: URLSearchParams percent-encodes `,` and `|`,
    // so 800 GPS-precision coordinates already build a URL past Cloudflare's 16 KB. Over it the
    // request never reaches the Worker and the caller gets a bare edge 414 with no envelope, so
    // the client has to be the one that explains it.
    const s = stub(answer);
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    const many: [number, number][] = Array.from({ length: 800 }, (_, i) => [
      -114.0719123 + i * 1e-7,
      51.0447123 + i * 1e-7,
    ]);
    await expect(client.get(many)).rejects.toBeInstanceOf(ElevationError);
    await expect(client.get(many)).rejects.toThrow(
      new RegExp(`byte request URL; this client sends at most \\d+ bytes, keeping headroom under the edge's ${MAX_REQUEST_URL_BYTES} byte limit`),
    );
    expect(s.calls).toHaveLength(0);
  });

  it("still sends a batch that fits", async () => {
    const s = stub({ ...answer, elevations: Array.from({ length: 400 }, () => 1046.9) });
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    const many: [number, number][] = Array.from({ length: 400 }, () => [-114.0719, 51.0447]);
    expect(await client.get(many)).toHaveLength(400);
    // Safe: get() resolved, so the stub fetch ran and recorded its call.
    expect(new TextEncoder().encode(s.calls[0]!).length).toBeLessThan(MAX_REQUEST_URL_BYTES);
  });

  it("puts the gateway's reason in the thrown message", async () => {
    const s = stub({ error: "lat must be a number between -90 and 90" }, 400);
    const client = new Elevation({ key: "um_test_x", fetch: s.fetch });
    await expect(client.get([-114, 51])).rejects.toBeInstanceOf(ElevationError);
    await expect(client.get([-114, 51])).rejects.toThrow(/lat must be a number/);
  });
});
