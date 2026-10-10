import { describe, it, expect } from "vitest";
import { lngLatToTile, tileToBBox, tileUrl, styleUrl } from "./index";

describe("lngLatToTile", () => {
  it("maps Calgary at z12 to the known tile", () => {
    expect(lngLatToTile(-114.0719, 51.0447, 12)).toEqual({ z: 12, x: 750, y: 1370 });
  });
  it("maps the origin at z1", () => {
    expect(lngLatToTile(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1 });
  });
});

describe("tileToBBox", () => {
  it("round-trips a tile's own centre back into it", () => {
    const t = { z: 12, x: 750, y: 1370 };
    const [w, s, e, n] = tileToBBox(t);
    expect(lngLatToTile((w + e) / 2, (s + n) / 2, 12)).toEqual(t);
  });
});

describe("url builders", () => {
  it("tileUrl keeps the {z}/{x}/{y} template and appends the key, with no /v1", () => {
    expect(tileUrl("um_test_x", { gateway: "https://api.unmap.dev/" })).toBe(
      "https://api.unmap.dev/tiles/{z}/{x}/{y}?key=um_test_x",
    );
  });
  it("styleUrl puts the style in the path and mode in the query", () => {
    const u = styleUrl("k", "base", { gateway: "https://g", mode: "dark" });
    expect(u).toBe("https://g/styles/base.json?key=k&mode=dark");
  });

  it("styleUrl forwards a compact theme code and omits it otherwise", () => {
    const themed = styleUrl("k", "base", { gateway: "https://g", theme: "ut1.abc" });
    expect(themed).toContain("theme=ut1.abc");
    const plain = styleUrl("k", "base", { gateway: "https://g" });
    expect(plain).not.toContain("theme=");
  });

  it("styleUrl omits lang unless asked, so Accept-Language still decides", () => {
    expect(styleUrl("k", "base", { gateway: "https://g" })).not.toContain("lang=");
    expect(styleUrl("k", "base", { gateway: "https://g", lang: "fr" })).toContain("lang=fr");
  });

  it("styleUrl builds a named style url with no /v1", () => {
    expect(styleUrl("k", "muted", { gateway: "https://g" })).toBe(
      "https://g/styles/muted.json?key=k",
    );
  });

  it("styleUrl forwards overlays and omits the param when empty", () => {
    const withOverlays = styleUrl("k", "base", {
      gateway: "https://g",
      overlays: ["municipalities", "survey.dls"],
    });
    expect(withOverlays).toBe(
      "https://g/styles/base.json?key=k&overlays=municipalities%2Csurvey.dls",
    );
    expect(styleUrl("k", "base", { gateway: "https://g", overlays: [] })).not.toContain("overlays=");
  });

  it("styleUrl forwards profile and omits it otherwise", () => {
    expect(styleUrl("k", "muted", { gateway: "https://g", profile: "energy" })).toBe(
      "https://g/styles/muted.json?key=k&profile=energy",
    );
    expect(styleUrl("k", "muted", { gateway: "https://g", profile: "agriculture" })).toBe(
      "https://g/styles/muted.json?key=k&profile=agriculture",
    );
    expect(styleUrl("k", "muted", { gateway: "https://g", profile: "remote" })).toBe(
      "https://g/styles/muted.json?key=k&profile=remote",
    );
    expect(styleUrl("k", "muted", { gateway: "https://g", profile: "mining" })).toBe(
      "https://g/styles/muted.json?key=k&profile=mining",
    );
    expect(styleUrl("k", "base", { gateway: "https://g" })).not.toContain("profile=");
  });
});
