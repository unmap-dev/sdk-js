// Prints the compact code for each named registry preset. Requires a build first:
//   pnpm --filter @unmap/themes build && pnpm --filter @unmap/themes preset-codes
// Paste the output into apps/registry/registry/lib/map-themes.ts when presets change.
import {
  STYLE_THEMES,
  THEME_PRESETS,
  generateTheme,
  encodeTheme,
  presetId,
} from "../dist/index.js";

const out = {};

for (const doc of Object.values(STYLE_THEMES)) {
  out[doc.name] = await encodeTheme(doc);
}

for (const preset of THEME_PRESETS) {
  out[presetId(preset.name)] = await encodeTheme(generateTheme("base", preset.seeds));
}

for (const [key, code] of Object.entries(out)) {
  console.log(`  ${key}: "${code}",`);
}
