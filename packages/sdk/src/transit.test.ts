import { describe, expect, it } from "vitest";
import { Transit, TransitError } from "./transit";

const envelope = { data: [], meta: { status: "current", attribution: "TTC", unmap_updated_at: "now" } };

describe("Transit", () => {
  it("serializes nearby stops and departures without exposing raw ids in path structure", async () => {
    const calls: string[] = [];
    const client = new Transit({
      key: "um_test_x",
      gateway: "https://api.test/",
      fetch: (async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return Response.json(envelope);
      }) as typeof fetch,
    });
    await client.nearbyStops([-79.38, 43.65], { radius: 800, limit: 5 });
    await client.departures("um:transit:stop:ttc:station%2FA", {
      at: new Date("2026-09-17T12:00:00Z"),
      window: 30,
    });

    expect(calls[0]).toBe("https://api.test/transit/stops?key=um_test_x&near=-79.38%2C43.65&radius=800&limit=5");
    expect(calls[1]).toContain("/transit/stops/um%3Atransit%3Astop%3Attc%3Astation%252FA/departures?");
    expect(calls[1]).toContain("at=2026-09-17T12%3A00%3A00.000Z");
  });

  it("throws a typed error with the gateway code", async () => {
    const client = new Transit({
      key: "um_test_x",
      fetch: (async () => Response.json(
        { error: "transit data is not deployed", code: "service_unavailable" },
        { status: 503 },
      )) as typeof fetch,
    });
    await expect(client.agencies()).rejects.toEqual(
      expect.objectContaining<Partial<TransitError>>({ status: 503, code: "service_unavailable" }),
    );
  });
});
