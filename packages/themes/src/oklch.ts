/**
 * Minimal sRGB ↔ OKLCH conversion (Björn Ottosson's OKLab constants), plus a chroma-reducing
 * gamut map. Zero dependencies — the generator is the only consumer and needs exactly this.
 *
 * OKLCH is the working space for the same reason the hand-built ramps in `palette.ts` were
 * generated in it: perceived lightness is carried almost entirely by L, so a generator can swap
 * hue and chroma while *preserving a ramp's lightness ladder* — which is where the label
 * contrast the cartography tests enforce actually lives.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  l: number;
  /** Chroma, 0 upward (~0.37 max for sRGB). */
  c: number;
  /** Hue in degrees, 0–360. */
  h: number;
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** Parse #RRGGBB (or #RRGGBBAA — alpha ignored) into OKLCH. */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/** OKLCH → linear sRGB triple (possibly out of gamut). */
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const bb = c * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: [number, number, number]) =>
  rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/**
 * OKLCH → #RRGGBB. Out-of-gamut colours are mapped by *reducing chroma* at constant L and h
 * (bisection), never by clipping channels — clipping shifts perceived lightness, and the whole
 * generator contract is that L is preserved.
 */
export function oklchToHex(color: Oklch): string {
  let { c } = color;
  let rgb = oklchToLinear({ ...color, c });
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      c = (lo + hi) / 2;
      rgb = oklchToLinear({ ...color, c });
      if (inGamut(rgb)) lo = c;
      else hi = c;
    }
    rgb = oklchToLinear({ ...color, c: lo });
  }
  const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255);
  return (
    "#" +
    rgb
      .map((v) => to255(v).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
