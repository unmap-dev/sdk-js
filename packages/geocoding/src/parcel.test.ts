import { describe, expect, it } from "vitest";
import { looksLikeParcel, parseParcel } from "./parcel";

describe("parseParcel", () => {
  it("accepts dashed and bare nine-digit PIDs", () => {
    expect(parseParcel("010-867-813")).toEqual({
      raw: "010-867-813",
      pid: "010-867-813",
    });
    expect(parseParcel("010867813")).toEqual({
      raw: "010867813",
      pid: "010-867-813",
    });
    expect(looksLikeParcel(" 010-867-813 ")).toBe(true);
  });

  it("rejects civic strings, PIN-length digits, and phone-like numbers", () => {
    expect(parseParcel("Calgary")).toBeNull();
    expect(parseParcel("NW-25-24-1-W5")).toBeNull();
    expect(parseParcel("12345678")).toBeNull();
    expect(parseParcel("1234567890")).toBeNull();
    expect(parseParcel("403-555-1234")).toBeNull();
    expect(looksLikeParcel("")).toBe(false);
  });
});
