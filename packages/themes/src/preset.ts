import { ThemeError } from "./validate";
import { isThemeBase, type ThemeBase } from "./recipe";
import { STYLE_THEMES } from "./presets";
import { THEME_PRESETS } from "./palettes";
import { DEFAULT_SEEDS, generateTheme } from "./generate";
import { LAYER_GROUPS, type LayerGroup, type ThemeDoc, type ThemeLayers, type ThemeSeeds } from "./doc";
import { DEFAULT_LAYER_VISIBILITY, isStockLayerOrder, isStockLayers } from "./layers";

/**
 * Short preset codes, the same idea as shadcn's `b0` / `a2r6bw`: a base62 packing of
 * enumerated choices that starts at three characters and grows only when the theme leaves the
 * curated set.
 *
 *   u00 … u0E       the style slots, in lineup order (`u03` is a tombstone and does not decode)
 *   u0W, u4e, …     a named theme preset on a style (three characters for the first fifteen
 *                   presets; `tamarack`, the sixteenth, is the first to take four)
 *   six to eight    a style or preset with layer groups hidden or reordered
 *   up to 23        custom seed colours (4× RGB) on any style, layers included
 *
 * Advanced overrides — anything `generateTheme` would not emit — still use the `ut1.` deflate
 * document. `ut1.` is checked first on decode so the two forms never collide.
 *
 * Layout, low bits first, of the number the base62 digits spell:
 *
 *   bits 0–4   style slot (`STYLE_SLOTS`; 32 styles)
 *   bits 5–6   kind: 0 bare style, 1 named preset, 2 custom seeds (3 unassigned)
 *   bit  7     layers flag
 *   bits 8…    kind payload: preset → 8-bit preset index; custom → 4 × 24-bit RGB seeds
 *   then       if the flag is set, 7 visibility bits (one per `LAYER_GROUPS` entry) followed
 *              by a 13-bit Lehmer index of the draw order (0 = stock order)
 *
 * Anything left above the last field is an error, so a truncated or padded code fails rather
 * than decoding to a theme nobody asked for. Both lookup tables only grow at the end and never
 * reuse a position: the index is bit-packed into every code, so removing an entry would
 * renumber every code after it. A retired entry stays as a `null` tombstone that fails to
 * decode. (The layout itself was re-cut on 2026-09-07.)
 */

export const PRESET_CODE_PREFIX = "u";
export const PRESET_CODE_RE = /^u[0-9A-Za-z]{2,24}$/;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SEED_KEYS = ["land", "water", "nature", "accent"] as const;

/** Style per slot. Grow at the end only; a retired style is a `null` tombstone, never removed. */
const STYLE_SLOTS: readonly (ThemeBase | null)[] = [
  "base",
  "muted",
  "outdoor",
  null, // u03, retired 2026-09-09
  "blueprint",
  "blush",
  "orchid",
  "canopy",
  "lagoon",
  "tropic",
  "sunset",
  "bold",
  "pastel",
  "atlas",
  "swiss",
];

const STYLE_BITS = 5n;
const KIND_BITS = 2n;
const KIND_BARE = 0n;
const KIND_PRESET = 1n;
const KIND_CUSTOM = 2n;
const PRESET_INDEX_BITS = 8n;
const RGB_BITS = 24n;
const VISIBILITY_BITS = BigInt(LAYER_GROUPS.length); // 7
const ORDER_BITS = 13n; // 7! = 5040 < 2^13
const ORDER_COUNT = factorial(LAYER_GROUPS.length);

const mask = (bits: bigint) => (1n << bits) - 1n;
const sameHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function factorial(n: number): bigint {
  let f = 1n;
  for (let i = 2n; i <= BigInt(n); i++) f *= i;
  return f;
}

export function isThemePresetCode(code: string): boolean {
  return PRESET_CODE_RE.test(code);
}

/** Registry key for a preset name: `process ink` → `processInk`. */
export function presetId(name: string): string {
  return name.replace(/\s+([a-zA-Z])/g, (_, c: string) => c.toUpperCase()).replace(/\s/g, "");
}

function toBase62(n: bigint, min = 2): string {
  if (n === 0n) return "0".repeat(min);
  let s = "";
  let x = n;
  while (x > 0n) {
    s = BASE62[Number(x % 62n)] + s;
    x /= 62n;
  }
  return s.padStart(min, "0");
}

function fromBase62(s: string): bigint {
  let n = 0n;
  for (const ch of s) {
    const i = BASE62.indexOf(ch);
    if (i < 0) {
      throw new ThemeError("invalid theme", ["code is not a valid preset"]);
    }
    n = n * 62n + BigInt(i);
  }
  return n;
}

function rgb24(hex: string): bigint {
  return BigInt(parseInt(hex.replace("#", "").slice(0, 6), 16));
}

function fromRgb24(n: bigint): string {
  return `#${n.toString(16).toUpperCase().padStart(6, "0")}`;
}

/** A bare style: no seeds, no overrides in either half. */
function isBareStyle(doc: ThemeDoc): boolean {
  return doc.seeds === undefined && doc.light === undefined && doc.dark === undefined;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    return ak.length === bk.length && ak.every((k, i) => k === bk[i] && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function seedsMatch(a: ThemeSeeds, b: ThemeSeeds): boolean {
  return SEED_KEYS.every((k) => {
    const left = a[k];
    const right = b[k];
    if (left === undefined && right === undefined) return true;
    if (typeof left !== "string" || typeof right !== "string") return left === right;
    return sameHex(left, right);
  });
}

function generatedMatch(doc: ThemeDoc): boolean {
  if (!doc.seeds) return false;
  const generated = generateTheme(doc.base, doc.seeds);
  return (
    generated.base === doc.base &&
    seedsMatch(generated.seeds!, doc.seeds) &&
    deepEqual(generated.light, doc.light) &&
    deepEqual(generated.dark, doc.dark)
  );
}

function findPresetIndex(seeds: ThemeSeeds): number {
  return THEME_PRESETS.findIndex((p) => seedsMatch(p.seeds, { ...DEFAULT_SEEDS, ...seeds }));
}

/* ---- layers: 7 visibility bits + a Lehmer index of the order ---- */

/** Lehmer index of a permutation of `LAYER_GROUPS` (0 for the stock order). */
function orderIndex(order: readonly LayerGroup[]): bigint {
  const remaining: LayerGroup[] = [...LAYER_GROUPS];
  let index = 0n;
  let radix = factorial(remaining.length);
  for (const group of order) {
    const at = remaining.indexOf(group);
    radix /= BigInt(remaining.length);
    index += BigInt(at) * radix;
    remaining.splice(at, 1);
  }
  return index;
}

/** The permutation of `LAYER_GROUPS` with this Lehmer index. */
function orderAt(index: bigint): LayerGroup[] {
  const remaining: LayerGroup[] = [...LAYER_GROUPS];
  const order: LayerGroup[] = [];
  let rest = index;
  let radix = factorial(remaining.length);
  while (remaining.length > 0) {
    radix /= BigInt(remaining.length);
    const at = Number(rest / radix);
    rest %= radix;
    order.push(remaining.splice(at, 1)[0]!);
  }
  return order;
}

function packLayers(layers: ThemeLayers): bigint {
  let bits = 0n;
  LAYER_GROUPS.forEach((group, i) => {
    const visible = layers.visible?.[group] ?? DEFAULT_LAYER_VISIBILITY[group];
    if (visible) bits |= 1n << BigInt(i);
  });
  const order = isStockLayerOrder(layers.order) ? 0n : orderIndex(layers.order!);
  return bits | (order << VISIBILITY_BITS);
}

/** Expand packed layer bits to the sparse field the builder would have written. */
function unpackLayers(bits: bigint): ThemeLayers {
  const layers: ThemeLayers = {};
  const visible: NonNullable<ThemeLayers["visible"]> = {};
  LAYER_GROUPS.forEach((group, i) => {
    const on = ((bits >> BigInt(i)) & 1n) === 1n;
    if (on !== DEFAULT_LAYER_VISIBILITY[group]) visible[group] = on;
  });
  if (Object.keys(visible).length > 0) layers.visible = visible;
  const order = bits >> VISIBILITY_BITS;
  if (order >= ORDER_COUNT) {
    throw new ThemeError("invalid theme", ["preset layer order is out of range"]);
  }
  if (order !== 0n) layers.order = orderAt(order);
  return layers;
}

/* ---- encode ---- */

/**
 * Pack a theme into a short preset code, or `null` when the document is not one of the
 * representable shapes (caller falls back to `ut1.`).
 */
export function encodePreset(doc: ThemeDoc): string | null {
  const slot = isThemeBase(doc.base) ? STYLE_SLOTS.indexOf(doc.base) : -1;
  if (slot < 0) return null;

  let kind: bigint;
  let payload = 0n;
  let payloadBits = 0n;
  if (isBareStyle(doc)) {
    kind = KIND_BARE;
  } else {
    if (!doc.seeds || !generatedMatch(doc)) return null;
    const presetIndex = findPresetIndex(doc.seeds);
    if (presetIndex >= 0 && presetIndex < Number(mask(PRESET_INDEX_BITS))) {
      kind = KIND_PRESET;
      payload = BigInt(presetIndex);
      payloadBits = PRESET_INDEX_BITS;
    } else {
      if (!doc.seeds.accent) return null;
      kind = KIND_CUSTOM;
      const filled: Required<ThemeSeeds> = { ...DEFAULT_SEEDS, ...doc.seeds };
      for (const key of SEED_KEYS) {
        payload |= rgb24(filled[key]) << payloadBits;
        payloadBits += RGB_BITS;
      }
    }
  }

  const hasLayers = !isStockLayers(doc.layers);
  let bits = BigInt(slot) | (kind << STYLE_BITS) | ((hasLayers ? 1n : 0n) << (STYLE_BITS + KIND_BITS));
  let shift = STYLE_BITS + KIND_BITS + 1n;
  bits |= payload << shift;
  shift += payloadBits;
  if (hasLayers) bits |= packLayers(doc.layers!) << shift;
  return PRESET_CODE_PREFIX + toBase62(bits);
}

/* ---- decode ---- */

/** Expand a short preset code to a validated ThemeDoc. Throws `ThemeError`. */
export function decodePreset(code: string): ThemeDoc {
  if (!isThemePresetCode(code)) {
    throw new ThemeError("invalid theme", ["code is not a valid preset"]);
  }
  let rest = fromBase62(code.slice(PRESET_CODE_PREFIX.length));
  const take = (bits: bigint): bigint => {
    const value = rest & mask(bits);
    rest >>= bits;
    return value;
  };

  const slot = Number(take(STYLE_BITS));
  const base = STYLE_SLOTS[slot];
  if (base === undefined) throw new ThemeError("invalid theme", ["preset style is out of range"]);
  if (base === null) throw new ThemeError("invalid theme", [`preset style slot ${slot} is retired`]);
  const kind = take(KIND_BITS);
  const hasLayers = take(1n) === 1n;

  let doc: ThemeDoc;
  if (kind === KIND_BARE) {
    doc = structuredClone(STYLE_THEMES[base]);
  } else if (kind === KIND_PRESET) {
    const preset = THEME_PRESETS[Number(take(PRESET_INDEX_BITS))];
    if (!preset) throw new ThemeError("invalid theme", ["preset is out of range"]);
    doc = generateTheme(base, preset.seeds);
  } else if (kind === KIND_CUSTOM) {
    const seeds: Required<ThemeSeeds> = { ...DEFAULT_SEEDS };
    for (const key of SEED_KEYS) seeds[key] = fromRgb24(take(RGB_BITS));
    doc = generateTheme(base, seeds);
  } else {
    throw new ThemeError("invalid theme", ["preset kind is unassigned"]);
  }

  if (hasLayers) doc.layers = unpackLayers(take(VISIBILITY_BITS + ORDER_BITS));
  if (rest !== 0n) {
    throw new ThemeError("invalid theme", ["preset payload has unused bits"]);
  }
  return doc;
}

/**
 * Registry key for a curated preset (`base`, `processInk`, `boreal`, …), or `undefined` when
 * the theme is a custom code that is not one of the named `MAP_THEMES` entries (named presets
 * are published on the `base` style only).
 */
export function registryThemeKey(doc: ThemeDoc): string | undefined {
  if (isBareStyle(doc)) return STYLE_THEMES[doc.base]?.name;
  if (!doc.seeds || doc.base !== "base" || !generatedMatch(doc)) return undefined;
  const presetIndex = findPresetIndex(doc.seeds);
  if (presetIndex < 0) return undefined;
  return presetId(THEME_PRESETS[presetIndex]!.name);
}
