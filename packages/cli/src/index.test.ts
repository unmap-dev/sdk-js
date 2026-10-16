import { describe, it, expect } from "vitest";
import {
  DEMO_CITIES,
  REGISTRY_BLOCKS,
  accentQuestion,
  blockComponent,
  blockNotes,
  envDeclares,
  demoPage,
  detectFramework,
  detectPackageManager,
  devCommand,
  envFile,
  envLine,
  generateConfig,
  generateInitSnippet,
  hasNamespace,
  initArgs,
  isBlock,
  nuxtMajor,
  nuxtSetsSrcDir,
  keyStatusFromResponse,
  laneOf,
  namespaceArg,
  namespaceEntry,
  namespaceUrl,
  parseAccent,
  parseArgs,
  pageHost,
  parseOnly,
  rendersNuxtPage,
  resolveRegion,
  serializeConfig,
  shadcnPackage,
  verifyUrl,
  viteEnvTypes,
  withNuxtRuntimeConfig,
} from "./index";

describe("parseArgs", () => {
  it("reads a command with --flag value and --flag=value", () => {
    const a = parseArgs(["init", "--key", "um_test_x", "--region=montreal"]);
    expect(a.command).toBe("init");
    expect(a.key).toBe("um_test_x");
    expect(a.region).toBe("montreal");
    expect(a.help).toBe(false);
  });

  it("collects positionals and detects help", () => {
    const a = parseArgs(["init", "extra", "-h"]);
    expect(a.command).toBe("init");
    expect(a.positionals).toEqual(["extra"]);
    expect(a.help).toBe(true);
  });

  it("returns undefined command for empty argv", () => {
    expect(parseArgs([]).command).toBeUndefined();
  });

  it("treats boolean flags as valueless so they never swallow an item name", () => {
    const args = parseArgs(["add", "--yes", "map", "--dry-run", "geocoder", "--overwrite"]);
    expect(args.positionals).toEqual(["map", "geocoder"]);
    expect(args.yes).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.overwrite).toBe(true);
    expect(parseArgs(["create", "app", "--force", "--theme", "u4e", "--accent=system"])).toMatchObject({
      command: "create",
      positionals: ["app"],
      force: true,
      theme: "u4e",
      accent: "system",
    });
  });
});

describe("add helpers", () => {
  it("detects the lane from package.json and the manager from the lockfile", () => {
    expect(detectFramework({ dependencies: { vue: "^3.5.0" } })).toBe("vue");
    expect(detectFramework({ devDependencies: { nuxt: "^4" } })).toBe("vue");
    expect(detectFramework({ dependencies: { react: "^19", next: "^16" } })).toBe("react");
    expect(detectFramework({ dependencies: { hono: "^4" } })).toBeUndefined();
    expect(detectPackageManager((p) => p === "pnpm-lock.yaml")).toBe("pnpm");
    expect(detectPackageManager((p) => p === "yarn.lock")).toBe("yarn");
    expect(detectPackageManager((p) => p === "bun.lock")).toBe("bun");
    expect(detectPackageManager(() => false)).toBe("npm");
  });
});

describe("namespace helpers", () => {
  it("builds the per-lane namespace and detects an existing one", () => {
    expect(namespaceUrl("https://registry.unmap.dev", "react")).toBe("https://registry.unmap.dev/r/{name}.json");
    expect(namespaceUrl("http://localhost:8788/", "vue")).toBe("http://localhost:8788/r/vue/{name}.json");
    expect(namespaceArg("https://registry.unmap.dev", "vue")).toBe("@unmap=https://registry.unmap.dev/r/vue/{name}.json");
    expect(shadcnPackage("react")).toBe("shadcn@latest");
    expect(shadcnPackage("vue")).toBe("shadcn-vue@latest");
    expect(hasNamespace({ registries: { "@unmap": "https://x/{name}.json" } })).toBe(true);
    expect(hasNamespace({ registries: { "@unmap": { url: "https://x/{name}.json" } } })).toBe(true);
    expect(hasNamespace({ registries: {} })).toBe(false);
    expect(hasNamespace(null)).toBe(false);
  });

  it("resolves namespaceEntry for both string and object entry shapes", () => {
    expect(namespaceEntry({ registries: { "@unmap": "https://x/{name}.json" } })).toBe(
      "https://x/{name}.json",
    );
    expect(
      namespaceEntry({ registries: { "@unmap": { url: "https://y/{name}.json", headers: {} } } }),
    ).toBe("https://y/{name}.json");
    expect(namespaceEntry({ registries: { "@unmap": { nope: 1 } } })).toBeNull();
    expect(namespaceEntry({})).toBeNull();
  });
});

describe("verifyUrl", () => {
  it("builds a styles URL for the default style with the key", () => {
    expect(verifyUrl("um_test_x", { gateway: "https://api.unmap.dev/" })).toBe(
      "https://api.unmap.dev/styles/base.json?key=um_test_x",
    );
  });

  it("honours a chosen style", () => {
    expect(verifyUrl("k", { gateway: "https://g", style: "outdoor" })).toBe(
      "https://g/styles/outdoor.json?key=k",
    );
  });

  it("passes a theme through to styleUrl", () => {
    const url = verifyUrl("k", { gateway: "https://g", theme: "u4e" });
    expect(url).toContain("key=k");
    expect(url).toContain("theme=u4e");
  });
});

describe("keyStatusFromResponse", () => {
  it("maps HTTP status to a verdict", () => {
    expect(keyStatusFromResponse(200)).toBe("ok");
    expect(keyStatusFromResponse(401)).toBe("invalid");
    expect(keyStatusFromResponse(403)).toBe("invalid");
    expect(keyStatusFromResponse(500)).toBe("error");
  });
});

describe("resolveRegion", () => {
  it("passes through a known city case-insensitively", () => {
    expect(resolveRegion("MONTREAL")).toBe("montreal");
  });
  it("defaults unknown or missing regions to the first demo city", () => {
    expect(resolveRegion("paris")).toBe(DEMO_CITIES[0]);
    expect(resolveRegion(undefined)).toBe(DEMO_CITIES[0]);
  });
});

describe("generateConfig / serializeConfig", () => {
  it("produces a config with resolved style + tiles URLs", () => {
    const c = generateConfig({ key: "k", region: "calgary", gateway: "https://g/" });
    expect(c.region).toBe("calgary");
    expect(c.gateway).toBe("https://g");
    expect(c.style).toBe("https://g/styles/base.json?key=k");
    expect(c.tiles).toBe("https://g/tiles/{z}/{x}/{y}?key=k");
  });

  it("serializes to pretty JSON with a trailing newline", () => {
    const s = serializeConfig(generateConfig({ key: "k", region: "calgary" }));
    expect(s.endsWith("}\n")).toBe(true);
    expect(JSON.parse(s).key).toBe("k");
  });
});

describe("generateInitSnippet", () => {
  it("embeds the style URL and imports maplibre-gl", () => {
    const s = generateInitSnippet({ key: "k", region: "montreal", gateway: "https://g" });
    // MapLibre 6 is ESM-only with no default export; a default import throws at load.
    expect(s).toContain('import { Map } from "maplibre-gl"');
    expect(s).not.toContain("import maplibregl");
    expect(s).toContain("https://g/styles/base.json?key=k");
    expect(s).toContain('container: "map"');
  });
});

describe("create helpers", () => {
  it("maps frameworks to lanes and builds the init command", () => {
    expect(laneOf("next")).toBe("react");
    expect(laneOf("vite")).toBe("react");
    expect(laneOf("nuxt")).toBe("vue");
    expect(laneOf("vue")).toBe("vue");
    expect(initArgs("next", "my-app")).toEqual([
      "shadcn@latest", "init", "--template", "next", "--name", "my-app", "--no-monorepo", "--base", "base", "--preset", "nova", "--yes",
    ]);
    expect(initArgs("vite", "my-app", "base-nova")).toEqual([
      "shadcn@latest", "init", "--template", "vite", "--name", "my-app", "--no-monorepo", "--preset", "base-nova", "--yes",
    ]);
    expect(initArgs("nuxt", "my-app")).toEqual([
      "shadcn-vue@latest", "init", "--template", "nuxt", "--name", "my-app",
      "--base", "reka", "--icon-library", "lucide", "--preset", "nova", "--yes",
    ]);
    // `reka` is shadcn-vue's only base, so it rides along with a caller's preset too.
    expect(initArgs("vue", "my-app", "a2r6bw")).toEqual([
      "shadcn-vue@latest", "init", "--template", "vite", "--name", "my-app", "--base", "reka", "--preset", "a2r6bw", "--yes",
    ]);
  });

  it("validates --only, always keeping map", () => {
    expect(parseOnly(undefined)).toEqual(["map", "geocoder", "routing-panel", "marker-popup"]);
    expect(parseOnly("geocoder, map ,geocoder")).toEqual(["map", "geocoder"]);
    expect(parseOnly("marker-popup")).toEqual(["map", "marker-popup"]);
    expect(parseOnly("energy-map")).toEqual(["map", "energy-map"]);
    expect(parseOnly("route-line")).toEqual(["map", "route-line"]);
    expect(parseOnly("geojson-layer")).toEqual(["map", "geojson-layer"]);
    expect(parseOnly("measure,feature-inspector,time-slider")).toEqual([
      "map",
      "measure",
      "feature-inspector",
      "time-slider",
    ]);
    expect(parseOnly("well-search,legal-land-search,energy-popup,energy-layer-control")).toEqual([
      "map",
      "well-search",
      "legal-land-search",
      "energy-popup",
      "energy-layer-control",
    ]);
    expect(parseOnly("geocoder,store-locator")).toEqual({
      error: "'store-locator' is a block, a whole page: create the project first, then run unmap add store-locator in it.",
    });
    expect(parseOnly("globe")).toEqual({
      error:
        "unknown item 'globe'. Items: map, geocoder, routing-panel, route-line, route-steps, geojson-layer, cluster-layer, heatmap-layer, arc-layer, flow-layer, marker-popup, map-controls, map-themes, map-context, map-layers, layer-legend, measure, feature-inspector, time-slider, draw, compare-swipe, elevation-profile, store-locator, directions, flow-map, elevation-explorer, delivery-tracker, census-choropleth, land-treaty-inspector, address-playground, energy-explorer, energy-map, energy-layer-control, well-search, legal-land-search, energy-popup, treaty-context, api-calls, api-inspector, business-locator-01, local-guide-01, public-notices-01, map-story-01, map-markers-01, map-measure-01, map-inspect-01, map-timeline-01, map-draw-01, map-compare-01, map-elevation-01, map-geojson-01, map-clusters-01, map-heatmap-01, map-arcs-01, map-flows-01.",
    });
  });

  it("names the env file and variable per framework and never writes an empty key", () => {
    expect(envFile("next")).toEqual({ file: ".env.local", name: "NEXT_PUBLIC_UNMAP_KEY" });
    expect(envFile("vite")).toEqual({ file: ".env.local", name: "VITE_UNMAP_KEY" });
    expect(envFile("vue")).toEqual({ file: ".env.local", name: "VITE_UNMAP_KEY" });
    expect(envFile("nuxt")).toEqual({ file: ".env", name: "NUXT_PUBLIC_UNMAP_KEY" });
    expect(envLine("NEXT_PUBLIC_UNMAP_KEY", "um_live_abc")).toBe("NEXT_PUBLIC_UNMAP_KEY=um_live_abc\n");
    expect(envLine("NEXT_PUBLIC_UNMAP_KEY", null)).toBe("# Paste your unmap key from https://unmap.dev/dashboard\nNEXT_PUBLIC_UNMAP_KEY=\n");
  });

  it("writes vite-env.d.ts only on the Vite-based frameworks", () => {
    expect(viteEnvTypes("vite")).toEqual({
      path: "src/vite-env.d.ts",
      content: '/// <reference types="vite/client" />\n',
    });
    expect(viteEnvTypes("vue")).toEqual({
      path: "src/vite-env.d.ts",
      content: '/// <reference types="vite/client" />\n',
    });
    expect(viteEnvTypes("next")).toBeNull();
    expect(viteEnvTypes("nuxt")).toBeNull();
  });

  it("writes a demo page per framework that reads the key from the env and uses only the installed items", () => {
    const next = demoPage("next", { envName: "NEXT_PUBLIC_UNMAP_KEY", items: ["map", "geocoder", "marker-popup"] });
    expect(next.path).toBe("app/page.tsx");
    expect(next.content).toContain('import { Map } from "@/components/ui/map"');
    expect(next.content).toContain('import { Geocoder } from "@/components/ui/geocoder"');
    expect(next.content).toContain('import { Marker, Popup } from "@/components/ui/marker-popup"');
    expect(next.content).toContain("process.env.NEXT_PUBLIC_UNMAP_KEY");
    expect(next.content).not.toMatch(/um_(live|test)_/);
    expect(next.content).not.toContain("theme=");

    const vite = demoPage("vite", { envName: "VITE_UNMAP_KEY", items: ["map"], theme: "u4e", accent: "system" });
    expect(vite.path).toBe("src/App.tsx");
    expect(vite.content).toContain("import.meta.env.VITE_UNMAP_KEY");
    expect(vite.content).toContain('theme="u4e"');
    expect(vite.content).toContain('accent="system"');
    expect(vite.content).not.toContain("Geocoder");

    const vue = demoPage("vue", { envName: "VITE_UNMAP_KEY", items: ["map", "routing-panel"], theme: "u4e", accent: "theme" });
    expect(vue.path).toBe("src/App.vue");
    expect(vue.content).toContain('import { UnmapMap } from "@/components/ui/map";');
    expect(vue.content).toContain('import { UnmapRoutingPanel } from "@/components/ui/routing-panel";');
    expect(vue.content).not.toContain('import { UnmapGeocoder } from "@/components/ui/geocoder";');
    expect(vue.content).not.toContain('import { UnmapMarker, UnmapPopup } from "@/components/ui/marker-popup";');
    expect(vue.content).not.toMatch(/\.vue"/);
    expect(vue.content).toContain('theme="u4e"');
    expect(vue.content).toContain('accent="theme"');

    const vueAll = demoPage("vue", {
      envName: "VITE_UNMAP_KEY",
      items: ["map", "geocoder", "routing-panel", "marker-popup"],
    });
    expect(vueAll.content).toContain('import { UnmapGeocoder } from "@/components/ui/geocoder";');
    expect(vueAll.content).toContain('import { UnmapMarker, UnmapPopup } from "@/components/ui/marker-popup";');
    expect(vueAll.content).not.toMatch(/\.vue"/);

    const nuxt = demoPage("nuxt", { envName: "NUXT_PUBLIC_UNMAP_KEY", items: ["map"], nuxtAppDir: true });
    expect(nuxt.path).toBe("app/app.vue");
    expect(nuxt.content).toContain("useRuntimeConfig().public.unmapKey");
    expect(demoPage("nuxt", { envName: "NUXT_PUBLIC_UNMAP_KEY", items: ["map"], nuxtAppDir: false }).path).toBe("app.vue");
  });

  it("adds the public runtime config key to a stock nuxt.config and refuses an unfamiliar one", () => {
    const stock = "export default defineNuxtConfig({\n  compatibilityDate: '2025-07-15',\n  devtools: { enabled: true },\n})\n";
    expect(withNuxtRuntimeConfig(stock)).toBe(
      "export default defineNuxtConfig({\n  runtimeConfig: { public: { unmapKey: '' } },\n  compatibilityDate: '2025-07-15',\n  devtools: { enabled: true },\n})\n",
    );
    expect(withNuxtRuntimeConfig("export default defineNuxtConfig({ runtimeConfig: {} })")).toBe(
      "export default defineNuxtConfig({ runtimeConfig: { public: { unmapKey: '' } } })",
    );
    expect(withNuxtRuntimeConfig("module.exports = {}")).toBeNull();
  });

  it("adds unmapKey inside an existing runtimeConfig.public, keeping its formatting", () => {
    const withPublic = [
      "export default defineNuxtConfig({",
      "  runtimeConfig: {",
      "    apiSecret: '', // server only",
      "    public: {",
      "      apiBase: '/api',",
      "    },",
      "  },",
      "})",
      "",
    ].join("\n");
    expect(withNuxtRuntimeConfig(withPublic)).toBe(
      withPublic.replace("    public: {\n", "    public: {\n      unmapKey: '',\n"),
    );
    const oneLine = "export default defineNuxtConfig({ runtimeConfig: { public: { apiBase: '/api' } } })";
    expect(withNuxtRuntimeConfig(oneLine)).toBe(
      "export default defineNuxtConfig({ runtimeConfig: { public: { unmapKey: '', apiBase: '/api' } } })",
    );
    expect(withNuxtRuntimeConfig("defineNuxtConfig({ runtimeConfig: { public: {} } })")).toBe(
      "defineNuxtConfig({ runtimeConfig: { public: { unmapKey: '' } } })",
    );
  });

  it("adds a public block to an existing runtimeConfig that has none", () => {
    const noPublic = "export default defineNuxtConfig({\n  runtimeConfig: {\n    apiSecret: '{not a brace}',\n  },\n})\n";
    expect(withNuxtRuntimeConfig(noPublic)).toBe(
      "export default defineNuxtConfig({\n  runtimeConfig: {\n    public: { unmapKey: '' },\n    apiSecret: '{not a brace}',\n  },\n})\n",
    );
  });

  it("refuses a runtimeConfig it cannot edit safely", () => {
    // Not an object literal, twice declared, a non-literal public, or unbalanced.
    expect(withNuxtRuntimeConfig("const runtimeConfig = shared;\nexport default defineNuxtConfig({ runtimeConfig })")).toBeNull();
    expect(
      withNuxtRuntimeConfig("export default defineNuxtConfig({ runtimeConfig: {}, $production: { runtimeConfig: {} } })"),
    ).toBeNull();
    expect(withNuxtRuntimeConfig("export default defineNuxtConfig({ runtimeConfig: { public: publicConfig } })")).toBeNull();
    expect(withNuxtRuntimeConfig("export default defineNuxtConfig({ runtimeConfig: { public: { a: 1 }")).toBeNull();
  });

  it("finds a key line the way dotenv reads one", () => {
    expect(envDeclares("NUXT_PUBLIC_UNMAP_KEY=um_test_x\n", "NUXT_PUBLIC_UNMAP_KEY")).toBe(true);
    expect(envDeclares("A=1\nexport NUXT_PUBLIC_UNMAP_KEY=um_test_x\n", "NUXT_PUBLIC_UNMAP_KEY")).toBe(true);
    expect(envDeclares("  NUXT_PUBLIC_UNMAP_KEY = um_test_x\n", "NUXT_PUBLIC_UNMAP_KEY")).toBe(true);
    expect(envDeclares("NUXT_PUBLIC_UNMAP_KEY: um_test_x\n", "NUXT_PUBLIC_UNMAP_KEY")).toBe(true);
    expect(envDeclares("# NUXT_PUBLIC_UNMAP_KEY=\nNUXT_PUBLIC_UNMAP_KEY_OLD=1\n", "NUXT_PUBLIC_UNMAP_KEY")).toBe(false);
  });

  it("phrases the accent question and parses answers", () => {
    expect(accentQuestion("#d6136f")).toBe(
      "Markers and routes: this theme's accent (#d6136f) or your design system's primary? [theme/system] (theme) ",
    );
    expect(accentQuestion(null)).toBe(
      "Markers and routes: this theme's accent or your design system's primary? [theme/system] (theme) ",
    );
    expect(parseAccent("")).toBe("theme");
    expect(parseAccent(" System ")).toBe("system");
    expect(parseAccent("t")).toBe("theme");
    expect(parseAccent("s")).toBe("system");
    expect(parseAccent("blue")).toBeNull();
    expect(parseAccent(undefined)).toBeNull();
    expect(devCommand("pnpm")).toBe("pnpm dev");
    expect(devCommand("npm")).toBe("npm run dev");
    expect(devCommand("yarn")).toBe("yarn dev");
    expect(devCommand("bun")).toBe("bun dev");
  });
});

describe("block helpers", () => {
  it("knows the blocks and what their components are called in each lane", () => {
    expect([...REGISTRY_BLOCKS]).toEqual(["store-locator", "directions", "flow-map", "elevation-explorer", "delivery-tracker", "census-choropleth", "land-treaty-inspector", "address-playground", "energy-explorer"]);
    expect(isBlock("flow-map")).toBe(true);
    expect(isBlock("flow-layer")).toBe(false);
    expect(blockComponent("store-locator", "react")).toBe("StoreLocator");
    expect(blockComponent("elevation-explorer", "vue")).toBe("UnmapElevationExplorer");
    expect(blockComponent("census-choropleth", "vue")).toBe("UnmapCensusChoropleth");
    expect(blockComponent("land-treaty-inspector", "react")).toBe("LandTreatyInspector");
    expect(blockComponent("address-playground", "vue")).toBe("UnmapAddressPlayground");
    expect(blockComponent("energy-explorer", "react")).toBe("EnergyExplorer");
  });

  it("tells where a block's page can go before anything is installed", () => {
    const has = (...paths: string[]) => (path: string) => paths.includes(path);
    expect(pageHost("react", has("next.config.ts"))).toBe("next");
    expect(pageHost("react", has("next.config.mjs", "app"))).toBe("next");
    expect(pageHost("react", has("vite.config.ts"))).toBe("none");
    expect(pageHost("vue", has("nuxt.config.ts", "app"))).toBe("nuxt");
    expect(pageHost("vue", has("nuxt.config.mts", "app"))).toBe("nuxt");
    expect(pageHost("vue", has("nuxt.config.ts"))).toBe("nuxt3");
    expect(pageHost("vue", has("vite.config.ts", "src"))).toBe("none");
  });

  it("reads the Nuxt layout the way Nuxt does", () => {
    const has = (...paths: string[]) => (path: string) => paths.includes(path);
    // Nuxt 3 keeps pages at the root even with an app/ holding router options.
    expect(pageHost("vue", has("nuxt.config.ts", "app"), { major: 3, appEntries: ["router.options.ts"] })).toBe("nuxt3");
    expect(pageHost("vue", has("nuxt.config.ts", "app"), { major: 3, appEntries: ["app.vue"] })).toBe("nuxt3");
    // Nuxt 3 opted into the 4 layout.
    expect(
      pageHost("vue", has("nuxt.config.ts", "app"), {
        major: 3,
        config: "export default defineNuxtConfig({ future: { compatibilityVersion: 4 } })",
        appEntries: ["app.vue"],
      }),
    ).toBe("nuxt");
    // Nuxt 4 with an app/ that holds only what Nuxt ignores, beside a root app.vue: the legacy root layout.
    expect(
      pageHost("vue", has("nuxt.config.ts", "app", "app.vue"), {
        major: 4,
        appEntries: ["router.options.ts", "spa-loading-template.html"],
      }),
    ).toBe("nuxt3");
    expect(pageHost("vue", has("nuxt.config.ts", "app"), { major: 4, appEntries: ["spa-loading-template.html"] })).toBe("nuxt");
    expect(pageHost("vue", has("nuxt.config.ts"), { major: 4 })).toBe("nuxt3");
    // An explicit srcDir: unmap does not guess where pages go.
    expect(pageHost("vue", has("nuxt.config.ts", "app"), { major: 4, config: "defineNuxtConfig({ srcDir: 'src/' })" })).toBe(
      "none",
    );
  });

  it("reads Nuxt's major version from the installed package, then the declared range", () => {
    expect(nuxtMajor("3.17.2", "^4.1.0")).toBe(3);
    expect(nuxtMajor(null, "^4.1.0")).toBe(4);
    expect(nuxtMajor(undefined, "~3.12")).toBe(3);
    expect(nuxtMajor(null, "latest")).toBeNull();
    expect(nuxtMajor(null, null)).toBeNull();
    expect(nuxtSetsSrcDir("export default defineNuxtConfig({\n  srcDir: 'src/',\n})")).toBe(true);
    expect(nuxtSetsSrcDir("export default defineNuxtConfig({ dir: { pages: 'routes' } })")).toBe(false);
    expect(rendersNuxtPage("<template><NuxtLayout><NuxtPage /></NuxtLayout></template>")).toBe(true);
    expect(rendersNuxtPage("<template><nuxt-page /></template>")).toBe(true);
    expect(rendersNuxtPage("<template><NuxtWelcome /></template>")).toBe(false);
  });

  it("says where each block's page is, or how to render its component where there is none", () => {
    expect(blockNotes("next", "react", ["store-locator"])).toEqual([
      "store-locator: open http://localhost:3000/store-locator once the dev server runs.",
      "Paste your key into .env.local or .env as NEXT_PUBLIC_UNMAP_KEY (https://unmap.dev/dashboard).",
    ]);
    expect(
      blockNotes("next", "react", ["store-locator"], {
        pages: { "store-locator": "src/app/store-locator/page.tsx" },
        envFile: ".env",
      }),
    ).toEqual([
      "store-locator: open http://localhost:3000/store-locator once the dev server runs (page: src/app/store-locator/page.tsx).",
      "Paste your key into .env as NEXT_PUBLIC_UNMAP_KEY (https://unmap.dev/dashboard).",
    ]);
    expect(blockNotes("none", "react", ["flow-map"])).toEqual([
      "note: if your framework has no page folder shadcn recognises, flow-map's page was not installed. Render <FlowMap apiKey={yourKey} /> from @/components/ui/flow-map yourself.",
      "note: shadcn wrote an empty NEXT_PUBLIC_UNMAP_KEY line to .env.local or .env, which this framework never hands to the block. Pass your key (https://unmap.dev/dashboard) to the block's apiKey prop from your own env handling, such as import.meta.env.VITE_UNMAP_KEY on Vite.",
    ]);
    expect(blockNotes("none", "react", ["flow-map"], { pages: { "flow-map": "app/routes/flow-map.tsx" } })).toEqual([
      "flow-map: page at app/routes/flow-map.tsx.",
      "note: shadcn wrote an empty NEXT_PUBLIC_UNMAP_KEY line to .env.local or .env, which this framework never hands to the block. Pass your key (https://unmap.dev/dashboard) to the block's apiKey prop from your own env handling, such as import.meta.env.VITE_UNMAP_KEY on Vite.",
    ]);
    expect(blockNotes("none", "vue", ["flow-map"])).toEqual([
      'note: if your framework has no page folder shadcn-vue recognises, flow-map\'s page was not installed. Render <UnmapFlowMap :api-key="yourKey" /> from @/components/ui/flow-map yourself.',
      "note: shadcn-vue wrote an empty NUXT_PUBLIC_UNMAP_KEY line to .env.local or .env, which this framework never hands to the block. Pass your key (https://unmap.dev/dashboard) to the block's api-key prop from your own env handling, such as import.meta.env.VITE_UNMAP_KEY on Vite.",
    ]);
    expect(blockNotes("nuxt", "vue", ["directions"], { nuxtPageMissing: true, envFile: ".env" })).toEqual([
      "directions: open http://localhost:3000/directions once the dev server runs.",
      "Paste your key into .env as NUXT_PUBLIC_UNMAP_KEY (https://unmap.dev/dashboard).",
      "note: app/app.vue has no <NuxtPage />, so Nuxt shows app/app.vue on every route. Add <NuxtPage /> to it to reach the block's page.",
    ]);
    // A Nuxt 3 layout (or Nuxt 4 on the root layout) renders the root app.vue.
    expect(blockNotes("nuxt3", "vue", ["directions"], { nuxtPageMissing: true, envFile: ".env" })).toContain(
      "note: app.vue has no <NuxtPage />, so Nuxt shows app.vue on every route. Add <NuxtPage /> to it to reach the block's page.",
    );
    expect(blockNotes("nuxt3", "vue", ["directions"], { envFile: ".env.local", runtimeConfigManual: true })).toEqual([
      "directions: open http://localhost:3000/directions once the dev server runs.",
      "Paste your key into .env.local as NUXT_PUBLIC_UNMAP_KEY (https://unmap.dev/dashboard). Nuxt reads .env.local only when started with --dotenv .env.local.",
      "note: add `unmapKey: ''` under `runtimeConfig.public` in nuxt.config, or the page never sees NUXT_PUBLIC_UNMAP_KEY.",
    ]);
    expect(blockNotes("none", "vue", ["directions"], { nuxtSrcDir: true, envFile: ".env" })).toEqual([
      "note: nuxt.config sets srcDir, so unmap cannot tell where directions's page belongs. shadcn-vue writes it to app/pages/directions.vue; move it into your pages directory.",
      "Paste your key into .env as NUXT_PUBLIC_UNMAP_KEY (https://unmap.dev/dashboard).",
    ]);
  });
});
