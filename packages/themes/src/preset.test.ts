import { describe, expect, it } from "vitest";
import { encodeTheme, decodeTheme, THEME_CODE_PREFIX } from "./codec";
import { encodePreset, decodePreset, isThemePresetCode, registryThemeKey } from "./preset";
import { STYLE_THEMES } from "./presets";
import { THEME_PRESETS } from "./palettes";
import { generateTheme, DEFAULT_SEEDS } from "./generate";
import { THEME_BASES } from "./recipe";
import { LAYER_GROUPS, type ThemeDoc } from "./doc";
import { ThemeError } from "./validate";
import { PRINTED_CODES } from "./preset-codes.fixture";

const FULL: ThemeDoc = {
  v: 1,
  name: "midnight-copper",
  base: "outdoor",
  light: {
    basemap: { water: "#9CCFD2" },
    marker: { color: "#FF3E9A", scale: 1.5 },
  },
};

const CUSTOM_SEEDS = {
  land: "#8A7355",
  water: "#3B6EA5",
  nature: "#7A8C3F",
  accent: "#D6136F",
};

const boreal = THEME_PRESETS.find((p) => p.name === "boreal")!;

describe("short presets", () => {
  it("encodes the living styles as three-character codes in lineup order", async () => {
    const codes = await Promise.all(THEME_BASES.map((base) => encodeTheme(STYLE_THEMES[base])));
    // u03 is a tombstone: the slot index is bit-packed, so it is never reused.
    expect(codes).toEqual(["u00", "u01", "u02", "u04", "u05", "u06", "u07", "u08", "u09", "u0A", "u0B", "u0C", "u0D", "u0E"]);
    for (const [i, base] of THEME_BASES.entries()) {
      expect(await decodeTheme(codes[i]!)).toEqual(STYLE_THEMES[base]);
    }
  });

  it("encodes a named preset on any style as three characters, and the sixteenth as four", async () => {
    for (const base of THEME_BASES) {
      for (const [index, preset] of THEME_PRESETS.entries()) {
        const doc = generateTheme(base, preset.seeds);
        const code = await encodeTheme(doc);
        // A preset code packs its index above the style slot, and two base62 digits hold 3843.
        // Index 15 clears that, so `tamarack` is the first preset to cost a fourth character.
        // Pinned rather than loosened to `{2,3}`: the boundary is the thing worth knowing.
        expect(code).toMatch(index < 15 ? /^u[0-9A-Za-z]{2}$/ : /^u[0-9A-Za-z]{3}$/);
        expect(await decodeTheme(code)).toEqual(doc);
      }
    }
    const onBase = generateTheme("base", boreal.seeds);
    expect(await encodeTheme(onBase)).toBe("u4e");
    expect(registryThemeKey(onBase)).toBe("boreal");
  });

  it("grows for custom seeds, then falls back to ut1. for advanced overrides", async () => {
    const custom = generateTheme("outdoor", CUSTOM_SEEDS);
    const customCode = await encodeTheme(custom);
    expect(isThemePresetCode(customCode)).toBe(true);
    expect(customCode.length).toBeGreaterThan(8);
    expect(customCode.length).toBeLessThanOrEqual(19);
    expect(await decodeTheme(customCode)).toEqual(custom);
    expect(registryThemeKey(custom)).toBeUndefined();

    const advanced = await encodeTheme(FULL);
    expect(advanced.startsWith(THEME_CODE_PREFIX)).toBe(true);
    expect(encodePreset(FULL)).toBeNull();
  });

  it("packs hidden layer groups into the short code", async () => {
    const hidden: ThemeDoc = { ...STYLE_THEMES.base, layers: { visible: { boundaries: false } } };
    const code = await encodeTheme(hidden);
    expect(code.startsWith("u")).toBe(true);
    expect(code.startsWith(THEME_CODE_PREFIX)).toBe(false);
    expect(code.length).toBeLessThanOrEqual(6);
    expect(await decodeTheme(code)).toEqual(hidden);
    // A bare style decodes to the shipped style document, name included.
    const unnamed = await encodeTheme({ v: 1, base: "base", layers: { visible: { boundaries: false } } });
    expect(unnamed).toBe(code);

    const extruded: ThemeDoc = {
      ...STYLE_THEMES.muted,
      layers: { visible: { buildings3d: true, labels: false } },
    };
    expect(await decodeTheme(await encodeTheme(extruded))).toEqual(extruded);
  });

  it("packs a custom layer order and drops a stock one", async () => {
    const reordered: ThemeDoc = {
      ...STYLE_THEMES.outdoor,
      layers: { order: ["water", "land", "boundaries", "roads", "buildings", "buildings3d", "labels"] },
    };
    const code = await encodeTheme(reordered);
    expect(code.startsWith("u")).toBe(true);
    expect(code.length).toBeLessThanOrEqual(6);
    expect(await decodeTheme(code)).toEqual(reordered);

    const reversed: ThemeDoc = { ...STYLE_THEMES.lagoon, layers: { order: [...LAYER_GROUPS].reverse() } };
    expect(await decodeTheme(await encodeTheme(reversed))).toEqual(reversed);

    // A field that changes nothing is the bare style it always was.
    expect(await encodeTheme({ v: 1, base: "base", layers: { order: [...LAYER_GROUPS] } })).toBe("u00");
    expect(await encodeTheme({ v: 1, base: "base", layers: { visible: { land: true } } })).toBe("u00");
  });

  it("carries layers on presets and custom seeds too, and stays under the length cap", async () => {
    const layers = {
      visible: { roads: false, buildings3d: true },
      order: ["land", "water", "roads", "buildings", "buildings3d", "boundaries", "labels"] as const,
    };
    const preset: ThemeDoc = { ...generateTheme("canopy", boreal.seeds), layers: { ...layers, order: [...layers.order] } };
    const presetCode = await encodeTheme(preset);
    expect(presetCode.length).toBeLessThanOrEqual(8);
    expect(await decodeTheme(presetCode)).toEqual(preset);

    const custom: ThemeDoc = { ...generateTheme("blush", CUSTOM_SEEDS), layers: { ...layers, order: [...layers.order] } };
    const customCode = await encodeTheme(custom);
    expect(isThemePresetCode(customCode)).toBe(true);
    expect(customCode.length).toBeLessThanOrEqual(23);
    expect(await decodeTheme(customCode)).toEqual(custom);
  });

  it("still takes the ut1. path when layers ride on advanced overrides", async () => {
    const doc: ThemeDoc = { ...FULL, layers: { visible: { labels: false } } };
    expect(encodePreset(doc)).toBeNull();
    const code = await encodeTheme(doc);
    expect(code.startsWith(THEME_CODE_PREFIX)).toBe(true);
    expect(await decodeTheme(code)).toEqual(doc);
  });

  it("rejects unknown styles, presets, kinds, permutations and unused bits", () => {
    expect(() => decodePreset("u0T")).toThrow(); // style slot 29: no such style
    expect(() => decodePreset("u1a")).toThrow(); // 98: kind 3 on style 2 is unassigned
    expect(() => decodePreset("uGW")).toThrow(); // 1024: a bare style with leftover payload bits
    expect(() => decodePreset("not-a-code")).toThrow();
    expect(() => decodePreset("u0")).toThrow();
  });

  it("refuses the tombstoned u03 slot and keeps every other slot where it was", () => {
    expect(() => decodePreset("u03")).toThrow(ThemeError);
    try {
      decodePreset("u03");
    } catch (e) {
      expect((e as ThemeError).detail).toEqual(["preset style slot 3 is retired"]);
    }
    expect(encodePreset({ v: 1, base: null } as never)).toBeNull();
    expect(encodePreset(STYLE_THEMES.blueprint)).toBe("u04");
    expect(decodePreset("u04").base).toBe("blueprint");
    expect(decodePreset("u0E").base).toBe("swiss");
  });

  it("decodes every printed code to the theme it named when it was printed", () => {
    for (const printed of PRINTED_CODES) {
      if ("refused" in printed) {
        expect(() => decodePreset(printed.code), printed.code).toThrow("invalid theme");
        try {
          decodePreset(printed.code);
        } catch (e) {
          expect((e as ThemeError).detail, printed.code).toEqual(["preset style slot 3 is retired"]);
        }
        continue;
      }
      const preset = printed.preset ? THEME_PRESETS.find((p) => p.name === printed.preset) : undefined;
      if (printed.preset) expect(preset, printed.code).toBeDefined();
      const seeds = preset?.seeds ?? printed.seeds;
      const expected: ThemeDoc = seeds ? generateTheme(printed.base, seeds) : structuredClone(STYLE_THEMES[printed.base]);
      if (printed.layers) expected.layers = printed.layers;
      expect(decodePreset(printed.code), printed.code).toEqual(expected);
    }
  });

  it("still decodes every code the docs and the registry's map-themes item print", async () => {
    // The registry's MAP_THEMES table, plus `tamarack`, the one four-character preset code.
    const printed: Record<string, string> = {
      base: "u00",
      muted: "u01",
      outdoor: "u02",
      blueprint: "u04",
      blush: "u05",
      orchid: "u06",
      canopy: "u07",
      lagoon: "u08",
      tropic: "u09",
      sunset: "u0A",
      bold: "u0B",
      pastel: "u0C",
      atlas: "u0D",
      swiss: "u0E",
      processInk: "u0W",
      boreal: "u4e",
      prairie: "u8m",
      tundra: "uCu",
      badlands: "uH2",
      aurora: "uLA",
      pacific: "uPI",
      chinook: "uTQ",
      magma: "uXY",
      neon: "ubg",
      candy: "ufo",
      ultraviolet: "ujw",
      noir: "uo4",
      sepia: "usC",
      ultramarine: "uwK",
      tamarack: "u10S",
    };
    for (const [name, code] of Object.entries(printed)) {
      expect(registryThemeKey(await decodeTheme(code)), code).toBe(name);
    }
  });

  it("names registry keys for styles and base-style presets only", () => {
    expect(registryThemeKey(STYLE_THEMES.base)).toBe("base");
    expect(registryThemeKey(STYLE_THEMES.muted)).toBe("muted");
    expect(registryThemeKey(STYLE_THEMES.outdoor)).toBe("outdoor");
    expect(registryThemeKey(STYLE_THEMES.blueprint)).toBe("blueprint");
    expect(registryThemeKey(generateTheme("outdoor", THEME_PRESETS[1]!.seeds))).toBeUndefined();
    // "process ink" is a theme preset like any other, not an alias of the bare `base` style.
    expect(registryThemeKey(generateTheme("base", DEFAULT_SEEDS))).toBe("processInk");
  });
});
