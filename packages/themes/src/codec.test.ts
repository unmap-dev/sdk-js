import { describe, it, expect } from "vitest";
import { encodeTheme, decodeTheme, THEME_CODE_PREFIX, MAX_CODE_LENGTH } from "./codec";
import { STYLE_THEMES } from "./presets";
import { ThemeError } from "./validate";
import type { ThemeDoc } from "./doc";

const FULL: ThemeDoc = {
  v: 1,
  name: "midnight-copper",
  base: "outdoor",
  light: {
    basemap: { water: "#9CCFD2", roads: { highway: "#FFFFFF" } },
    marker: { color: "#FF3E9A", scale: 1.5 },
    route: { color: "#FF3E9A", width: 3, casingColor: "#FF3E9A", casingWidth: 10, casingOpacity: 0.2 },
  },
  dark: { basemap: { water: "#001012" } },
};

async function expectThemeError(p: Promise<unknown>): Promise<ThemeError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ThemeError);
    return e as ThemeError;
  }
  throw new Error("expected a ThemeError");
}

describe("codec", () => {
  it("round-trips a full document", async () => {
    const code = await encodeTheme(FULL);
    expect(code.startsWith(THEME_CODE_PREFIX)).toBe(true);
    expect(code).toMatch(/^ut1\.[A-Za-z0-9_-]+$/);
    expect(await decodeTheme(code)).toEqual(FULL);
  });

  it("encodes a sparse preset as a three-character code", async () => {
    const code = await encodeTheme({ v: 1, base: "outdoor" });
    expect(code).toBe("u02");
    expect(await decodeTheme(code)).toEqual(STYLE_THEMES.outdoor);
  });

  it("is deterministic", async () => {
    expect(await encodeTheme(FULL)).toEqual(await encodeTheme(FULL));
  });

  it("refuses to encode an invalid document", async () => {
    await expectThemeError(encodeTheme({ v: 1, base: "block" } as unknown as ThemeDoc));
  });

  it("rejects a missing prefix", async () => {
    await expectThemeError(decodeTheme("v9.abc"));
    await expectThemeError(decodeTheme("zz"));
  });

  it("rejects garbage payloads", async () => {
    await expectThemeError(decodeTheme("ut1.zzz!!!"));
    await expectThemeError(decodeTheme("ut1.AAAA"));
  });

  it("rejects valid deflate of invalid JSON", async () => {
    const good = await encodeTheme(FULL);
    // Corrupt the tail so it inflates to broken JSON or fails checksum — either path must
    // land as ThemeError, never a raw exception.
    await expectThemeError(decodeTheme(good.slice(0, -2) + "qq"));
  });

  it("rejects valid JSON that fails validation", async () => {
    // Encode raw without validateTheme by deflating by hand.
    const json = new TextEncoder().encode(JSON.stringify({ v: 1, base: "base", x: 1 }));
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = "";
    for (const b of packed) bin += String.fromCharCode(b);
    const code = "ut1." + btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const err = await expectThemeError(decodeTheme(code));
    expect(err.detail).toContainEqual(expect.stringContaining("x"));
  });

  it("folds a layers field into the short preset", async () => {
    const hidden: ThemeDoc = { v: 1, base: "outdoor", layers: { visible: { labels: false } } };
    const code = await encodeTheme(hidden);
    expect(code.startsWith(THEME_CODE_PREFIX)).toBe(false);
    expect(code.startsWith("u")).toBe(true);
    expect(await decodeTheme(code)).toEqual({ ...STYLE_THEMES.outdoor, layers: hidden.layers });
    // A field that changes nothing still shortens to the preset it always was.
    expect(await encodeTheme({ v: 1, base: "outdoor", layers: {} })).toBe("u02");
  });

  it("rejects oversized codes and oversized decompressed payloads", async () => {
    await expectThemeError(decodeTheme("ut1." + "A".repeat(MAX_CODE_LENGTH)));
    // A zip bomb: tiny code, > 16 KB decompressed.
    const json = new TextEncoder().encode(`{"v":1,"base":"base","x":"${"a".repeat(20000)}"}`);
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = "";
    for (const b of packed) bin += String.fromCharCode(b);
    const code = "ut1." + btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const err = await expectThemeError(decodeTheme(code));
    expect(err.detail).toContainEqual(expect.stringContaining("too large"));
  });
});
