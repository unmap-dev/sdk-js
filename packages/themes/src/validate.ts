import { THEME_BASES, isThemeBase } from "./recipe";
import { RECIPES } from "./recipes";
import { LAYER_GROUPS, type LayerGroup, type ThemeDoc } from "./doc";

/**
 * Validation failure. `detail` lists every bad path in one throw — collect-then-throw, so a
 * builder user fixing a hand-edited document sees all of it at once rather than one field per
 * round trip (the same reporting philosophy as the cartography contrast tests).
 */
export class ThemeError extends Error {
  readonly detail: string[];
  constructor(message: string, detail: string[]) {
    super(message);
    this.name = "ThemeError";
    this.detail = detail;
  }
}

/** 6- or 8-digit hex only. Hex-by-grammar is what makes "no URLs, no expressions" a property. */
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const MAX_NAME_LENGTH = 40;

/** [min, max] bounds per numeric field. */
const MARKER_BOUNDS: Record<string, readonly [number, number]> = {
  scale: [0.5, 2],
};
const ROUTE_BOUNDS: Record<string, readonly [number, number]> = {
  width: [1, 12],
  opacity: [0, 1],
  casingWidth: [0, 24],
  casingOpacity: [0, 1],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validate a basemap override object against the Recipe shape, using a real recipe as the
 * schema: a key is legal iff it exists on the reference, objects recurse, strings must be hex.
 * The data is the schema, so the validator can never drift from what `mergeRecipe` accepts.
 */
function walkBasemap(value: unknown, reference: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  const ref = reference as Record<string, unknown>;
  for (const [key, v] of Object.entries(value)) {
    const target = ref[key];
    const p = `${path}.${key}`;
    if (target === undefined) {
      errors.push(`${p}: unknown field`);
    } else if (typeof target === "string") {
      if (typeof v !== "string" || !HEX.test(v)) {
        errors.push(`${p}: must be a hex colour (#RRGGBB or #RRGGBBAA)`);
      }
    } else {
      walkBasemap(v, target, p, errors);
    }
  }
}

/** Validate a flat colour+number leaf object (marker/route) against a bounds table. */
function walkLeaf(
  value: unknown,
  colorKeys: readonly string[],
  bounds: Record<string, readonly [number, number]>,
  path: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  for (const [key, v] of Object.entries(value)) {
    const p = `${path}.${key}`;
    if (colorKeys.includes(key)) {
      if (typeof v !== "string" || !HEX.test(v)) {
        errors.push(`${p}: must be a hex colour (#RRGGBB or #RRGGBBAA)`);
      }
    } else if (key in bounds) {
      const [lo, hi] = bounds[key]!;
      if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
        errors.push(`${p}: out of bounds (${lo}–${hi})`);
      }
    } else {
      errors.push(`${p}: unknown field`);
    }
  }
}

const HALF_KEYS = ["basemap", "marker", "route"] as const;
const DOC_KEYS = ["v", "name", "base", "seeds", "layers", "light", "dark"] as const;
const LAYERS_KEYS = ["visible", "order"] as const;

const isLayerGroup = (v: unknown): v is LayerGroup =>
  typeof v === "string" && (LAYER_GROUPS as readonly string[]).includes(v);

/**
 * Validate the structural `layers` field: `visible` maps known groups to booleans, `order` is
 * the full set of groups exactly once. Both are enums by grammar, so like the colours they can
 * never carry a layer id, a filter, or anything else the style would execute.
 */
function walkLayers(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("layers: must be an object");
    return;
  }
  for (const key of Object.keys(value)) {
    if (!(LAYERS_KEYS as readonly string[]).includes(key)) errors.push(`layers.${key}: unknown field`);
  }
  if (value.visible !== undefined) {
    if (!isRecord(value.visible)) {
      errors.push("layers.visible: must be an object");
    } else {
      for (const [group, v] of Object.entries(value.visible)) {
        if (!isLayerGroup(group)) errors.push(`layers.visible.${group}: unknown layer group`);
        else if (typeof v !== "boolean") errors.push(`layers.visible.${group}: must be a boolean`);
      }
    }
  }
  if (value.order !== undefined) {
    const order = value.order;
    if (!Array.isArray(order)) {
      errors.push("layers.order: must be an array");
    } else {
      order.forEach((g, i) => {
        if (!isLayerGroup(g)) errors.push(`layers.order[${i}]: unknown layer group`);
      });
      const known = order.filter(isLayerGroup);
      if (new Set(known).size !== known.length || known.length !== LAYER_GROUPS.length) {
        errors.push(`layers.order: must list each of ${LAYER_GROUPS.join(", ")} exactly once`);
      }
    }
  }
}
const SEED_COLOR_KEYS = ["land", "water", "nature", "accent"] as const;
const REQUIRED_SEED_KEYS = ["land", "water", "nature"] as const;

/**
 * Validate an untrusted value as a ThemeDoc. Returns the (unchanged) document on success;
 * throws a `ThemeError` naming every invalid path otherwise. Unknown fields anywhere are
 * errors — a theme is data only, and the reject-unknown posture is what keeps it that way.
 */
export function validateTheme(input: unknown): ThemeDoc {
  const errors: string[] = [];
  if (!isRecord(input)) {
    throw new ThemeError("invalid theme", ["theme must be a JSON object"]);
  }

  for (const key of Object.keys(input)) {
    if (!(DOC_KEYS as readonly string[]).includes(key)) errors.push(`${key}: unknown field`);
  }

  if (input.v !== 1) errors.push("v: must be 1");
  if (!isThemeBase(input.base)) {
    errors.push(`base: must be one of ${THEME_BASES.join(", ")}`);
  }
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.length > MAX_NAME_LENGTH) {
      errors.push(`name: must be a string of at most ${MAX_NAME_LENGTH} characters`);
    }
  }

  if (input.seeds !== undefined) {
    walkLeaf(input.seeds, SEED_COLOR_KEYS, {}, "seeds", errors);
    if (isRecord(input.seeds)) {
      for (const key of REQUIRED_SEED_KEYS) {
        if (input.seeds[key] === undefined) errors.push(`seeds.${key}: required`);
      }
    }
  }

  if (input.layers !== undefined) walkLayers(input.layers, errors);

  // Any complete recipe works as the schema reference; base.light is as good as any.
  const reference = RECIPES.base.light;

  for (const mode of ["light", "dark"] as const) {
    const half = input[mode];
    if (half === undefined) continue;
    if (!isRecord(half)) {
      errors.push(`${mode}: must be an object`);
      continue;
    }
    for (const key of Object.keys(half)) {
      if (!(HALF_KEYS as readonly string[]).includes(key)) {
        errors.push(`${mode}.${key}: unknown field`);
      }
    }
    if (half.basemap !== undefined) walkBasemap(half.basemap, reference, `${mode}.basemap`, errors);
    if (half.marker !== undefined) {
      walkLeaf(half.marker, ["color"], MARKER_BOUNDS, `${mode}.marker`, errors);
    }
    if (half.route !== undefined) {
      walkLeaf(half.route, ["color", "casingColor"], ROUTE_BOUNDS, `${mode}.route`, errors);
    }
  }

  if (errors.length > 0) throw new ThemeError("invalid theme", errors);
  return input as unknown as ThemeDoc;
}
