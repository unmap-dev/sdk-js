import type { Flavor } from "@protomaps/basemaps";
import { MODES, type ThemeMode } from "./recipe";
import type { ThemeDoc } from "./doc";
import { resolveTheme } from "./compose";

/**
 * Label-contrast checks for theme documents — the same WCAG maths and label/background pairs
 * `apps/gateway/test/cartography.test.ts` enforces on unmap's own flavors, exported as a
 * library so the builder can warn live.
 *
 * Warn, not reject: the gateway holds its own flavors to these floors, but a custom theme is
 * the customer's canvas. The builder surfaces every breach; shipping one anyway is a choice.
 */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Halo colour is the effective background wherever a halo is set, because that is what the
 * glyph actually sits on. Where there is no halo slot (country labels), the label sits on the
 * land; ocean labels sit on water.
 */
const PRIMARY: Array<[keyof Flavor, keyof Flavor]> = [
  ["city_label", "city_label_halo"],
  ["state_label", "state_label_halo"],
  ["country_label", "earth"],
  ["roads_label_major", "roads_label_major_halo"],
];

const SECONDARY: Array<[keyof Flavor, keyof Flavor]> = [
  ["subplace_label", "subplace_label_halo"],
  ["address_label", "address_label_halo"],
  ["roads_label_minor", "roads_label_minor_halo"],
  ["ocean_label", "water"],
];

/** Every enforced pair with its floor — the generator's contrast-clamp iterates these. */
export const LABEL_PAIRS: Array<[keyof Flavor, keyof Flavor, number]> = [
  ...PRIMARY.map(([l, b]) => [l, b, 4.5] as [keyof Flavor, keyof Flavor, number]),
  ...SECONDARY.map(([l, b]) => [l, b, 3] as [keyof Flavor, keyof Flavor, number]),
];

export interface ContrastWarning {
  mode: ThemeMode;
  /** The Flavor label slot that breaches, e.g. "city_label". */
  label: string;
  /** The Flavor slot it was checked against, e.g. "city_label_halo". */
  background: string;
  ratio: number;
  /** 4.5 for primary labels, 3 for secondary. */
  floor: number;
}

/** Every label-contrast breach in the theme, across both modes. Empty means clean. */
export function contrastWarnings(doc: ThemeDoc): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  for (const mode of MODES) {
    const flavor = resolveTheme(doc, mode).flavor as unknown as Record<string, string>;
    const check = (pairs: Array<[keyof Flavor, keyof Flavor]>, floor: number) => {
      for (const [label, background] of pairs) {
        const ratio = contrast(flavor[label as string]!, flavor[background as string]!);
        if (ratio < floor) {
          warnings.push({ mode, label: String(label), background: String(background), ratio, floor });
        }
      }
    };
    check(PRIMARY, 4.5);
    check(SECONDARY, 3);
  }
  return warnings;
}
