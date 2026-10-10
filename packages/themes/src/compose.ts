import type { Flavor } from "@protomaps/basemaps";
import { makeFlavor, type Recipe, type ThemeBase, type ThemeMode } from "./recipe";
import { RECIPES } from "./recipes";
import type { BasemapOverrides, MarkerTheme, RouteTheme, ThemeDoc } from "./doc";

/**
 * Platform drawing defaults for the two client-side overlays a theme styles. These are exactly
 * the convention the unmap.dev hero has always drawn: a magenta pin, and a route as a solid
 * line over a wide translucent casing so it stays legible on light and dark cartography alike.
 */
export const DEFAULT_MARKER: Required<MarkerTheme> = { color: "#FF3E9A", scale: 1 };
export const DEFAULT_ROUTE: Required<RouteTheme> = {
  color: "#FF3E9A",
  width: 3,
  opacity: 1,
  casingColor: "#FF3E9A",
  casingWidth: 10,
  casingOpacity: 0.2,
};

export interface ResolvedTheme {
  /** `<base>-<mode>`, the flavour name — what selects sprites and terrain behaviour. */
  flavorName: `${ThemeBase}-${ThemeMode}`;
  flavor: Flavor;
  marker: Required<MarkerTheme>;
  route: Required<RouteTheme>;
}

/**
 * Merge sparse overrides onto a base recipe, walking the base's own shape. Composing from the
 * base's keys (never spreading the override object) means an unexpected key cannot ride along
 * even if a caller skipped validation — defence in depth behind `validateTheme`.
 */
export function mergeRecipe(base: Recipe, overrides?: BasemapOverrides): Recipe {
  if (!overrides) return structuredClone(base);
  const walk = (ref: Record<string, unknown>, over: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [key, refValue] of Object.entries(ref)) {
      const o = over[key];
      if (refValue !== null && typeof refValue === "object") {
        out[key] =
          o !== null && typeof o === "object" && !Array.isArray(o)
            ? walk(refValue as Record<string, unknown>, o as Record<string, unknown>)
            : structuredClone(refValue);
      } else {
        out[key] = typeof o === "string" ? o : refValue;
      }
    }
    return out;
  };
  return walk(
    base as unknown as Record<string, unknown>,
    overrides as Record<string, unknown>,
  ) as unknown as Recipe;
}

/**
 * Resolve one half of a theme into everything a renderer needs: the expanded Flavor, the
 * flavour name, and marker/route styles with defaults filled in.
 */
export function resolveTheme(doc: ThemeDoc, mode: ThemeMode): ResolvedTheme {
  const half = doc[mode] ?? {};
  const recipe = mergeRecipe(RECIPES[doc.base][mode], half.basemap);
  return {
    flavorName: `${doc.base}-${mode}`,
    flavor: makeFlavor(recipe),
    marker: { ...DEFAULT_MARKER, ...half.marker },
    route: { ...DEFAULT_ROUTE, ...half.route },
  };
}
