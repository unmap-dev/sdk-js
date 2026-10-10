import { describe, it, expect } from "vitest";
import { unmapStyle } from "./style";

describe("unmapStyle", () => {
  it("maps a style name to a gateway style URL", () => {
    expect(unmapStyle({ key: "k", style: "muted", gateway: "https://g" })).toBe(
      "https://g/styles/muted.json?key=k",
    );
  });
  it.each(["atlas", "swiss"])("resolves %s as a style URL rather than a relative path", (style) => {
    expect(unmapStyle({ key: "k", style, gateway: "https://g", mode: "dark" })).toBe(
      `https://g/styles/${style}.json?key=k&mode=dark`,
    );
  });
  it("defaults to base", () => {
    expect(unmapStyle({ key: "k", gateway: "https://g" })).toContain("/styles/base.json");
    expect(unmapStyle({ key: "k", style: "", gateway: "https://g" })).toContain("/styles/base.json");
  });
  it("passes a full URL through unchanged", () => {
    expect(unmapStyle({ key: "k", style: "https://x/s.json" })).toBe("https://x/s.json");
  });
  it("passes a string that is neither a style name nor a URL through unchanged", () => {
    expect(unmapStyle({ key: "k", style: "/my-style.json", gateway: "https://g" })).toBe("/my-style.json");
    expect(unmapStyle({ key: "k", style: "calgary", gateway: "https://g" })).toBe("calgary");
  });

  it("has no flavor option", () => {
    // @ts-expect-error flavor is not an option
    unmapStyle({ key: "k", flavor: "outdoor" });
  });
});

describe("theme option", () => {
  it("unmapStyle forwards the compact theme code for named styles", () => {
    const u = unmapStyle({ key: "k", style: "base", theme: "ut1.abc" });
    expect(u).toContain("theme=ut1.abc");
  });

  it("a full style URL passes through untouched, theme or not", () => {
    const direct = "https://example.com/style.json";
    expect(unmapStyle({ key: "k", style: direct, theme: "ut1.abc" })).toBe(direct);
  });
});

describe("overlays option", () => {
  it("unmapStyle forwards catalog overlay ids", () => {
    const u = unmapStyle({
      key: "k",
      style: "base",
      gateway: "https://g",
      overlays: ["municipalities"],
    });
    expect(u).toBe("https://g/styles/base.json?key=k&overlays=municipalities");
  });
});

describe("profile option", () => {
  it("unmapStyle forwards profile on the style URL", () => {
    const u = unmapStyle({
      key: "k",
      style: "muted",
      gateway: "https://g",
      profile: "energy",
    });
    expect(u).toBe("https://g/styles/muted.json?key=k&profile=energy");
    expect(
      unmapStyle({
        key: "k",
        style: "muted",
        gateway: "https://g",
        profile: "agriculture",
      }),
    ).toBe("https://g/styles/muted.json?key=k&profile=agriculture");
    expect(
      unmapStyle({
        key: "k",
        style: "muted",
        gateway: "https://g",
        profile: "remote",
      }),
    ).toBe("https://g/styles/muted.json?key=k&profile=remote");
    expect(
      unmapStyle({
        key: "k",
        style: "muted",
        gateway: "https://g",
        profile: "mining",
      }),
    ).toBe("https://g/styles/muted.json?key=k&profile=mining");
  });
});
