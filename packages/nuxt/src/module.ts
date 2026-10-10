import { defineNuxtModule, addImportsSources } from "@nuxt/kit";
import { normalizeOptions, type ModuleOptions } from "./options";

export type { ModuleOptions, NormalizedOptions } from "./options";
export { normalizeOptions } from "./options";

/** Composables re-exported from `@unmap/vue`, auto-imported into every component. */
const UNMAP_VUE_IMPORTS = ["useUnmap", "useGeocoder", "useDirections"] as const;

/**
 * Nuxt 3 module for unmap. Adds public runtime config `unmap: { key, gateway }`
 * (overridable via `NUXT_PUBLIC_UNMAP_KEY` / `NUXT_PUBLIC_UNMAP_GATEWAY`) and
 * auto-imports the `@unmap/vue` composables.
 *
 *   // nuxt.config.ts
 *   export default defineNuxtConfig({
 *     modules: ["@unmap/nuxt"],
 *     unmap: { key: "um_live_..." },
 *   });
 */
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "@unmap/nuxt",
    configKey: "unmap",
    compatibility: { nuxt: ">=3.13.0" },
  },
  defaults: {},
  setup(options, nuxt) {
    const normalized = normalizeOptions(options);

    // Publish to public runtime config so the key/gateway reach the client.
    nuxt.options.runtimeConfig.public.unmap = {
      ...(nuxt.options.runtimeConfig.public.unmap as Record<string, unknown> | undefined),
      key: normalized.key,
      gateway: normalized.gateway,
    };

    // Auto-import the Vue composables from the published package.
    addImportsSources({
      from: "@unmap/vue",
      imports: [...UNMAP_VUE_IMPORTS],
    });
  },
});

declare module "@nuxt/schema" {
  interface PublicRuntimeConfig {
    unmap: { key: string; gateway: string };
  }
  interface ConfigSchema {
    unmap?: ModuleOptions;
  }
}
