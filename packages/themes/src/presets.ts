import type { ThemeDoc } from "./doc";
import type { ThemeBase } from "./recipe";

/**
 * The shipped styles as starting-point themes: zero overrides, so each is guaranteed identical
 * to the style it names, served at `/styles/<style>.json` (asserted in the gateway theme tests).
 * The builder opens on these.
 *
 * Named after the style itself — `base`, `muted`, `outdoor`, `blueprint`, `blush`, … — the same word the homepage, the
 * SDK's `style` option and the gateway URL use. The theme presets (`process ink`, `boreal`, …)
 * are a separate set layered on a style; a style never borrows one's name.
 */
export const STYLE_THEMES: Record<ThemeBase, ThemeDoc> = {
  base: { v: 1, name: "base", base: "base" },
  muted: { v: 1, name: "muted", base: "muted" },
  outdoor: { v: 1, name: "outdoor", base: "outdoor" },
  blueprint: { v: 1, name: "blueprint", base: "blueprint" },
  blush: { v: 1, name: "blush", base: "blush" },
  orchid: { v: 1, name: "orchid", base: "orchid" },
  canopy: { v: 1, name: "canopy", base: "canopy" },
  lagoon: { v: 1, name: "lagoon", base: "lagoon" },
  tropic: { v: 1, name: "tropic", base: "tropic" },
  sunset: { v: 1, name: "sunset", base: "sunset" },
  bold: { v: 1, name: "bold", base: "bold" },
  pastel: { v: 1, name: "pastel", base: "pastel" },
  atlas: { v: 1, name: "atlas", base: "atlas" },
  swiss: { v: 1, name: "swiss", base: "swiss" },
};
