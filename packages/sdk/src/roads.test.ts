import { describe, expect, it } from "vitest";
import { Feedback, Roads, type RoadEventsResponse } from "./roads";

function client(handler: (url: URL, init?: RequestInit) => Response) {
  const seen: { url: URL; init?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return {
    roads: new Roads({ key: "um_test_k", fetch: impl }),
    feedback: new Feedback({ key: "um_test_k", fetch: impl }),
    seen,
  };
}

const envelope = (over: Partial<RoadEventsResponse["meta"]> = {}, data: unknown[] = []) =>
  new Response(
    JSON.stringify({
      data,
      meta: { status: "current", attribution: "OGL BC", unmap_updated_at: "2026-09-17T00:00:00Z", ...over },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("Roads", () => {
  it("maps each lens onto its own endpoint", async () => {
    const { roads, seen } = client(() => envelope());
    await roads.incidents();
    await roads.closures();
    await roads.conditions();
    expect(seen.map((s) => s.url.pathname)).toEqual(["/incidents", "/closures", "/road-conditions"]);
  });

  it("joins list parameters and omits empty ones", async () => {
    const { roads, seen } = client(() => envelope());
    await roads.closures({
      jurisdiction: ["CA-BC", "CA-AB"],
      type: ["closure", "incident"],
      severity: "major",
      bbox: [-123, 49, -122, 50],
      limit: 10,
    });
    const q = seen[0]!.url.searchParams;
    expect(q.get("jurisdiction")).toBe("CA-BC,CA-AB");
    expect(q.get("type")).toBe("closure,incident");
    expect(q.get("severity")).toBe("major");
    expect(q.get("bbox")).toBe("-123,49,-122,50");
    expect(q.get("limit")).toBe("10");
    expect(q.has("near")).toBe(false);
    expect(q.has("radius")).toBe(false);
  });

  it("surfaces meta.unavailable rather than hiding it", async () => {
    // The whole point. On /closures an empty `data` reads as "nothing is shut" to someone
    // deciding whether to drive, and that is a different answer from "we could not reach Alberta".
    const { roads } = client(() =>
      envelope({ status: "partial", unavailable: [{ jurisdiction: "CA-AB", reason: "ALBERTA_511_KEY is not configured" }] }),
    );
    const res = await roads.closures();
    expect(res.meta.status).toBe("partial");
    expect(res.meta.unavailable?.[0]?.jurisdiction).toBe("CA-AB");
    expect(res.meta.unavailable?.[0]?.reason).toContain("not configured");
  });

  it("throws with the gateway's own reason on a 400", async () => {
    const { roads } = client(
      () =>
        new Response(JSON.stringify({ error: "no road events for jurisdiction CA-ZZ. Covered today: CA-BC, CA-AB", code: "bad_request" }), {
          status: 400,
        }),
    );
    await expect(roads.incidents({ jurisdiction: "CA-ZZ" })).rejects.toThrow(/Covered today/);
  });

  it("throws on a 503 but the caller can still read why from the error", async () => {
    const { roads } = client(() => new Response(JSON.stringify({ error: "upstream unreachable" }), { status: 503 }));
    await expect(roads.incidents()).rejects.toMatchObject({ name: "RoadsError", status: 503 });
  });
});

describe("Feedback", () => {
  it("posts a minimal report with the key in the header, not the query", async () => {
    const { feedback, seen } = client(() =>
      new Response(JSON.stringify({ id: "fb_1", status: "new", created_at: "t", context_stored: false }), { status: 201 }),
    );
    const receipt = await feedback.submit({
      product: "geocoding",
      category: "incorrect_location",
      description: "wrong city",
    });
    expect(seen[0]!.url.pathname).toBe("/feedback");
    expect(seen[0]!.url.searchParams.has("key")).toBe(false);
    expect((seen[0]!.init?.headers as Record<string, string>).authorization).toBe("Bearer um_test_k");
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({
      product: "geocoding",
      category: "incorrect_location",
      description: "wrong city",
    });
    expect(receipt.id).toBe("fb_1");
  });

  it("does not send include_context when there is no context", async () => {
    // The flag records a person's choice. A client that set it by default would make the consent
    // gate meaningless, which is the one thing this endpoint must not become.
    const { feedback, seen } = client(() =>
      new Response(JSON.stringify({ id: "fb_1", status: "new", created_at: "t", context_stored: false }), { status: 201 }),
    );
    await feedback.submit({ product: "routing", category: "bad_route", description: "detour" });
    const body = JSON.parse(String(seen[0]!.init?.body));
    expect(body.include_context).toBeUndefined();
    expect(body.context).toBeUndefined();
  });

  it("sets include_context only alongside a context the caller supplied", async () => {
    const { feedback, seen } = client(() =>
      new Response(JSON.stringify({ id: "fb_1", status: "new", created_at: "t", context_stored: true }), { status: 201 }),
    );
    await feedback.submit({
      product: "geocoding",
      category: "incorrect_location",
      description: "wrong",
      context: { q: "17 Ave SW" },
    });
    const body = JSON.parse(String(seen[0]!.init?.body));
    expect(body.include_context).toBe(true);
    expect(body.context).toEqual({ q: "17 Ave SW" });
  });

  it("reports a place through the place-scoped path", async () => {
    const { feedback, seen } = client(() =>
      new Response(JSON.stringify({ id: "fb_2", status: "new", created_at: "t", context_stored: false }), { status: 201 }),
    );
    await feedback.aboutPlace("um:place:1234", { category: "wrong_place_name", description: "old name" });
    expect(seen[0]!.url.pathname).toBe(`/places/${encodeURIComponent("um:place:1234")}/feedback`);
    const body = JSON.parse(String(seen[0]!.init?.body));
    // product and result_id come from the path; sending them would be redundant and the gateway
    // overrides them anyway.
    expect(body.product).toBeUndefined();
    expect(body.result_id).toBeUndefined();
    expect(body.category).toBe("wrong_place_name");
  });

  it("maps resultId onto the API's result_id", async () => {
    const { feedback, seen } = client(() =>
      new Response(JSON.stringify({ id: "fb_3", status: "new", created_at: "t", context_stored: false }), { status: 201 }),
    );
    await feedback.submit({ product: "places", category: "missing_place", resultId: "um:place:7" });
    expect(JSON.parse(String(seen[0]!.init?.body)).result_id).toBe("um:place:7");
  });

  it("throws with the gateway's reason when a report is refused", async () => {
    const { feedback } = client(
      () => new Response(JSON.stringify({ error: "a report needs a description or a result_id" }), { status: 400 }),
    );
    await expect(feedback.submit({ product: "geocoding", category: "other" })).rejects.toThrow(
      /description or a result_id/,
    );
  });
});
