import { describe, it, expect } from "vitest";
import { normalizeOptions } from "./options";

describe("normalizeOptions", () => {
  it("defaults the gateway and empty key", () => {
    expect(normalizeOptions()).toEqual({ key: "", gateway: "https://api.unmap.dev" });
  });

  it("keeps a provided key and gateway, trimming trailing slashes", () => {
    expect(normalizeOptions({ key: "um_live_abc", gateway: "https://gw.example.com/" })).toEqual({
      key: "um_live_abc",
      gateway: "https://gw.example.com",
    });
  });

  it("trims whitespace and falls back to the default gateway when blank", () => {
    expect(normalizeOptions({ key: "  k  ", gateway: "   " })).toEqual({
      key: "k",
      gateway: "https://api.unmap.dev",
    });
  });
});
