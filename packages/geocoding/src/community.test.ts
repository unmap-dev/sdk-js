import { describe, expect, it } from "vitest";
import {
  emptyAcknowledgementContext,
  emptyTerritoryContext,
  parseAcknowledgementContext,
  parseTerritoryContext,
  pickCommunityName,
} from "./community";

const P = { lng: 1, lat: 1, basis: "input_point" as const };
const V = "2026-09-22.0123456789ab";

const territory = {
  id: "synthetic.community:T1",
  source_id: "synthetic.community",
  source_record_id: "T1",
  name: "Synthetic Territory A",
  name_lang: "en",
  names: { en: "Synthetic Territory A" },
  community_ids: ["synthetic.community:C1"],
  representation: "source_defined",
  source_url: "https://example.test/t1",
  attribution: "Synthetic community source",
};

describe("community contexts", () => {
  it("builds valid not_enabled and unavailable envelopes with nothing in them", () => {
    for (const status of ["not_enabled", "unavailable"] as const) {
      expect(parseTerritoryContext(emptyTerritoryContext(P, status))).toMatchObject({ status, matches: [] });
      expect(parseAcknowledgementContext(emptyAcknowledgementContext(P, status))).toMatchObject({ status, resources: [] });
    }
  });

  it("refuses a not_enabled or unavailable context that carries data", () => {
    expect(() => parseTerritoryContext({ ...emptyTerritoryContext(P, "not_enabled"), matches: [territory] })).toThrow(/carries no matches/);
  });

  it("refuses ok without a version and hostile links", () => {
    const ok = { ...emptyTerritoryContext(P, "unavailable"), status: "ok", dataset_version: V, matches: [territory] };
    expect(parseTerritoryContext(ok).matches).toHaveLength(1);
    expect(() => parseTerritoryContext({ ...ok, dataset_version: null })).toThrow(/dataset_version/);
    expect(() => parseTerritoryContext({ ...ok, matches: [{ ...territory, source_url: "javascript:x" }] })).toThrow(/source_url/);
  });

  it("validates acknowledgement resources, text optional", () => {
    const resource = {
      id: "synthetic.community:R1",
      source_id: "synthetic.community",
      title: "Synthetic resource",
      url: "https://example.test/r1",
      language: "en",
      attribution: "Synthetic community source",
      applicability: "Synthetic: applies within Synthetic Territory A.",
      reviewed_at: "2026-09-22",
      content_version: "1",
      applies_to: ["synthetic.community:T1"],
    };
    const ctx = { ...emptyAcknowledgementContext(P, "unavailable"), status: "ok", dataset_version: V, resources: [resource] };
    expect(parseAcknowledgementContext(ctx).resources[0]).not.toHaveProperty("text");
    expect(() => parseAcknowledgementContext({ ...ctx, resources: [{ ...resource, url: "data:x" }] })).toThrow(/url/);
    expect(() => parseAcknowledgementContext({ ...ctx, resources: [{ ...resource, applies_to: [] }] })).toThrow(/applies_to/);
  });
});

describe("pickCommunityName", () => {
  it("uses the requested language, else the source default, and says which", () => {
    const names = { "cr-Cans": "ᓀᐦᐃᔭᐍᐏᐣ", en: "Synthetic" };
    expect(pickCommunityName(names, "en", "cr-Cans")).toEqual({ text: "Synthetic", lang: "en" });
    expect(pickCommunityName(names, "fr", "cr-Cans")).toEqual({ text: "ᓀᐦᐃᔭᐍᐏᐣ", lang: "cr-Cans" });
    expect(pickCommunityName({}, "fr", "en")).toBeUndefined();
  });
});
