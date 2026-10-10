import { DEFAULT_GATEWAY, styleUrl, tileUrl } from "@unmap/core";
import { DEFAULT_OPTIONS, type BatchOptions } from "./batch/plan";

export { DEFAULT_GATEWAY } from "@unmap/core";

/**
 * The three launch demo cities, offered as `init` defaults. Duplicated here
 * (rather than imported from `@unmap/maps`) so the CLI stays a zero-runtime-dep
 * Node tool and never pulls in the browser-only maplibre-gl bundle.
 */
export const DEMO_CITIES = ["calgary", "montreal", "iqaluit"] as const;
export type Region = (typeof DEMO_CITIES)[number];

/** The public component registry (`unmap add` fetches items from here). */
export const DEFAULT_REGISTRY = "https://registry.unmap.dev";

/** The registry lanes `unmap add` knows how to install. */
export const FRAMEWORKS = ["react", "vue"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

/** Templates and examples currently distributed in the React lane. */
export const REACT_BLOCKS = [
  "business-locator-01",
  "local-guide-01",
  "public-notices-01",
  "map-story-01",
  "map-markers-01",
  "map-measure-01",
  "map-inspect-01",
  "map-timeline-01",
  "map-draw-01",
  "map-compare-01",
  "map-elevation-01",
  "map-geojson-01",
  "map-clusters-01",
  "map-heatmap-01",
  "map-arcs-01",
  "map-flows-01",
] as const;

/**
 * The React blocks that also come as a standalone HTML page, downloadable from their template page:
 * the site's place templates. `registry-items.test.ts` holds this to apps/web's PLACE_TEMPLATE_SLUGS.
 */
export const HTML_STARTERS = ["business-locator-01", "local-guide-01", "public-notices-01"] as const;

/**
 * Each React example's section of the unmap.dev docs: the items it is built on, which ship in both
 * lanes. The gallery's own data (GALLERY in apps/web/lib/templates.ts) is the source; the CLI cannot
 * import apps/web, so `registry-items.test.ts` holds this table to it.
 */
export const EXAMPLE_GUIDES: Readonly<Record<string, string>> = {
  "map-markers-01": "/docs/frontend/map#markers-and-interaction",
  "map-measure-01": "/docs/frontend/tools#measure-distances",
  "map-inspect-01": "/docs/frontend/tools#inspect-features",
  "map-timeline-01": "/docs/frontend/tools#time-slider",
  "map-draw-01": "/docs/frontend/tools#draw-on-the-map",
  "map-compare-01": "/docs/frontend/tools#compare-two-maps",
  "map-elevation-01": "/docs/frontend/tools#elevation-profile",
  "map-geojson-01": "/docs/frontend/layers#geojson",
  "map-clusters-01": "/docs/frontend/layers#clusters",
  "map-heatmap-01": "/docs/frontend/layers#heatmap",
  "map-arcs-01": "/docs/frontend/layers#arcs",
  "map-flows-01": "/docs/frontend/layers#flows",
};

/**
 * The installable items the registry lanes ship, for help text and validation. `registry-items.test.ts`
 * holds this to `apps/registry/registry.json`: add an item there and it must land here too.
 */
export const REGISTRY_ITEMS = [
  "map",
  "geocoder",
  "routing-panel",
  "route-line",
  "geojson-layer",
  "cluster-layer",
  "heatmap-layer",
  "arc-layer",
  "flow-layer",
  "marker-popup",
  "map-controls",
  "map-themes",
  "map-context",
  "map-layers",
  "layer-legend",
  "measure",
  "feature-inspector",
  "time-slider",
  "draw",
  "compare-swipe",
  "elevation-profile",
  "store-locator",
  "directions",
  "flow-map",
  "elevation-explorer",
  "delivery-tracker",
  "census-choropleth",
  "land-treaty-inspector",
  "address-playground",
  "energy-explorer",
  "energy-map",
  "energy-layer-control",
  "well-search",
  "legal-land-search",
  "energy-popup",
  "treaty-context",
  ...REACT_BLOCKS,
] as const;

/**
 * The registry's page blocks: whole pages (a Next.js App Router page, a Nuxt page) rather than
 * components. Each is also in REGISTRY_ITEMS; `registry-items.test.ts` holds this list to the
 * manifests' blocks containing a `registry:page` file, in order.
 */
export const REGISTRY_BLOCKS = [
  "store-locator",
  "directions",
  "flow-map",
  "elevation-explorer",
  "delivery-tracker",
  "census-choropleth",
  "land-treaty-inspector",
  "address-playground",
  "energy-explorer",
] as const;

export function isBlock(name: string): boolean {
  return (REGISTRY_BLOCKS as readonly string[]).includes(name);
}

/** What a block's component is called: `StoreLocator` on React, `UnmapStoreLocator` on Vue. */
export function blockComponent(name: string, lane: Framework): string {
  const pascal = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return lane === "vue" ? `Unmap${pascal}` : pascal;
}

/** Where a block's page can go in this project: `nuxt3` is any Nuxt project whose pages sit at the root. */
export type PageHost = "next" | "nuxt" | "nuxt3" | "none";

const NEXT_CONFIG_FILES = ["next.config.js", "next.config.mjs", "next.config.cjs", "next.config.ts", "next.config.mts"];
/** Every extension Nuxt loads a config from; shadcn-vue takes any `nuxt.config.*`. */
export const NUXT_CONFIG_FILES = [
  "nuxt.config.ts",
  "nuxt.config.js",
  "nuxt.config.mjs",
  "nuxt.config.cjs",
  "nuxt.config.mts",
  "nuxt.config.cts",
] as const;

/** What `pageHost` needs to know about a Nuxt project beyond which files exist. */
export interface NuxtProbe {
  /** Nuxt's major version (see {@link nuxtMajor}); unknown reads as 4, which is shadcn-vue's own default. */
  major?: number | null;
  /** nuxt.config's source, for `compatibilityVersion` and `srcDir`. */
  config?: string | null;
  /** What `app/` holds. Absent means "something Nuxt counts". */
  appEntries?: string[];
}

/** The major version of the installed nuxt package, or else of the range package.json declares (semver-coerced). */
export function nuxtMajor(installed: string | null | undefined, declared: string | null | undefined): number | null {
  for (const version of [installed, declared]) {
    const match = version?.match(/(\d+)(?:\.\d+){0,2}/);
    if (match) return Number(match[1]);
  }
  return null;
}

/** True when nuxt.config sets `srcDir` itself, which moves the pages directory somewhere unmap does not guess at. */
export function nuxtSetsSrcDir(config: string | null | undefined): boolean {
  return /\bsrcDir\s*:/.test(config ?? "");
}

/** True when an app.vue renders the page outlet, spelled either way Vue allows. */
export function rendersNuxtPage(source: string): boolean {
  return /<(?:NuxtPage|nuxt-page)\b/.test(source);
}

/** True when dotenv would read a line assigning `name` (`export`, surrounding spaces and `:` included). */
export function envDeclares(content: string, name: string): boolean {
  return new RegExp(`^\\s*(?:export\\s+)?${name}\\s*[=:]`, "m").test(content);
}

/**
 * Judged before anything is installed. shadcn places a `registry:page` in a Next.js project (a
 * next.config file); shadcn-vue in a Nuxt project (a nuxt.config file), where it writes the target
 * as given, `app/pages/<name>.vue`, whatever the layout. Where pages actually live is Nuxt's call,
 * mirrored here: Nuxt 3 keeps them at the root; Nuxt 4 (or 3 with `compatibilityVersion: 4`) uses
 * `app/` when it holds anything besides `router.options.*` and `spa-loading-template.html`, and
 * falls back to the root when it does not and a root `app.vue` exists. An explicit `srcDir` is
 * `none`: the caller says so rather than guessing.
 */
export function pageHost(lane: Framework, exists: (relativePath: string) => boolean, nuxt: NuxtProbe = {}): PageHost {
  if (lane === "react") return NEXT_CONFIG_FILES.some(exists) ? "next" : "none";
  if (!NUXT_CONFIG_FILES.some(exists)) return "none";
  if (nuxtSetsSrcDir(nuxt.config)) return "none";
  const v4 = (nuxt.major ?? 4) >= 4 || /\bcompatibilityVersion\s*:\s*4\b/.test(nuxt.config ?? "");
  if (!v4 || !exists("app")) return "nuxt3";
  if (!nuxt.appEntries) return "nuxt";
  const counted = nuxt.appEntries.filter((entry) => entry !== "spa-loading-template.html" && !entry.startsWith("router.options"));
  if (counted.length > 0) return "nuxt";
  return exists("app.vue") || exists("App.vue") ? "nuxt3" : "nuxt";
}

export interface BlockNoteOptions {
  /** The app.vue Nuxt renders (app/app.vue on Nuxt 4's app/ layout) has no page outlet. */
  nuxtPageMissing?: boolean;
  /** Where each block's page landed, relative to the project, when it was found. */
  pages?: Record<string, string>;
  /** The env file that holds the key line. */
  envFile?: string;
  /** nuxt.config could not be edited, so `runtimeConfig.public.unmapKey` is still the reader's to add. */
  runtimeConfigManual?: boolean;
  /** nuxt.config sets `srcDir`. */
  nuxtSrcDir?: boolean;
}

/** What to tell the reader once a block's files are in. */
export function blockNotes(host: PageHost, lane: Framework, blocks: string[], options: BlockNoteOptions = {}): string[] {
  const nuxt = host === "nuxt" || host === "nuxt3" || options.nuxtSrcDir === true;
  const lines = blocks.map((block) => {
    const page = options.pages?.[block];
    if (host !== "none") {
      return `${block}: open http://localhost:3000/${block} once the dev server runs${page ? ` (page: ${page})` : ""}.`;
    }
    if (options.nuxtSrcDir) {
      return `note: nuxt.config sets srcDir, so unmap cannot tell where ${block}'s page belongs. shadcn-vue writes it to app/pages/${block}.vue; move it into your pages directory.`;
    }
    if (page) return `${block}: page at ${page}.`;
    const component = blockComponent(block, lane);
    return lane === "vue"
      ? `note: if your framework has no page folder shadcn-vue recognises, ${block}'s page was not installed. Render <${component} :api-key="yourKey" /> from @/components/ui/${block} yourself.`
      : `note: if your framework has no page folder shadcn recognises, ${block}'s page was not installed. Render <${component} apiKey={yourKey} /> from @/components/ui/${block} yourself.`;
  });
  if (host === "next") {
    lines.push(`Paste your key into ${options.envFile ?? ".env.local or .env"} as NEXT_PUBLIC_UNMAP_KEY (https://unmap.dev/dashboard).`);
  }
  if (host === "none" && !nuxt) {
    // The item's env line is written for Next.js or Nuxt; Vite and the rest never hand it to the block.
    const [cli, variable, prop] = lane === "vue" ? ["shadcn-vue", "NUXT_PUBLIC_UNMAP_KEY", "api-key"] : ["shadcn", "NEXT_PUBLIC_UNMAP_KEY", "apiKey"];
    lines.push(
      `note: ${cli} wrote an empty ${variable} line to .env.local or .env, which this framework never hands to the block. ` +
        `Pass your key (https://unmap.dev/dashboard) to the block's ${prop} prop from your own env handling, such as import.meta.env.VITE_UNMAP_KEY on Vite.`,
    );
  }
  if (nuxt) {
    const file = options.envFile ?? ".env";
    lines.push(
      `Paste your key into ${file} as NUXT_PUBLIC_UNMAP_KEY (https://unmap.dev/dashboard).` +
        (file === ".env" ? "" : ` Nuxt reads ${file} only when started with --dotenv ${file}.`),
    );
  }
  if (options.runtimeConfigManual) {
    lines.push("note: add `unmapKey: ''` under `runtimeConfig.public` in nuxt.config, or the page never sees NUXT_PUBLIC_UNMAP_KEY.");
  }
  if (options.nuxtPageMissing) {
    // Nuxt 4's app/ layout renders app/app.vue; a Nuxt 3 layout (or Nuxt 4 on the root layout) renders app.vue.
    const appVue = host === "nuxt" ? "app/app.vue" : "app.vue";
    lines.push(`note: ${appVue} has no <NuxtPage />, so Nuxt shows ${appVue} on every route. Add <NuxtPage /> to it to reach the block's page.`);
  }
  return lines;
}

/** A page block's, template's or example's preview and setup page in the unmap.dev gallery. */
export function templatePage(item: string): string {
  return `https://unmap.dev/templates/${item.replace(/-01$/, "")}`;
}

/** Reject React-only blocks before modifying a Vue consumer project. */
export function unsupportedBlock(items: readonly string[], lane: Framework): string | undefined {
  return lane === "vue" ? items.find((item) => (REACT_BLOCKS as readonly string[]).includes(item)) : undefined;
}

/**
 * Why a React-only block cannot land in a Vue project, and what to do instead. `fix` is the
 * command's own advice (`unmap add`: use a React project; `unmap create`: pick a React framework).
 * Only the three place templates have an HTML starter to offer; the rest are composed from items
 * that ship in both lanes, so the Vue reader is sent to those items' docs: an example's own section
 * (EXAMPLE_GUIDES), or the components docs for a template that has none.
 */
export function reactOnlyRefusal(item: string, fix: string): string {
  const page = templatePage(item);
  const docs = `https://unmap.dev${EXAMPLE_GUIDES[item] ?? "/docs/frontend/components"}`;
  const instead = (HTML_STARTERS as readonly string[]).includes(item)
    ? `${fix}, or download its HTML starter.`
    : `${fix}. In Vue, add the items it is built on: ${docs}.`;
  return `error: '${item}' is React-only. ${instead} Preview and setup: ${page}\n`;
}

export interface ParsedArgs {
  command: string | undefined;
  key?: string;
  gateway?: string;
  region?: string;
  /** `add`/`create`: registry base URL. Defaults to {@link DEFAULT_REGISTRY}. */
  registry?: string;
  /** `add`: force a lane instead of detecting one from package.json. `create`: next | vite | nuxt | vue. */
  framework?: string;
  /** `create`: a shadcn / shadcn-vue preset name or code, passed through to `init`. */
  preset?: string;
  /** `create`: comma-separated items instead of the default four. */
  only?: string;
  /** `create`: a theme code for the demo page. */
  theme?: string;
  /** `create`: "theme" | "system", answers the accent question non-interactively. */
  accent?: string;
  /** `add`: replace files that already exist. */
  overwrite: boolean;
  /** `add`: preview without writing. */
  dryRun: boolean;
  /** `add`: skip the shadcn CLI's confirmation prompt. */
  yes: boolean;
  /** `create`: scaffold into a non-empty directory. */
  force: boolean;
  /** `geocode csv`: header name of the column holding addresses. */
  queryColumn?: string;
  /** `geocode csv`: where the annotated copy of the input goes. */
  output?: string;
  /** `geocode csv`: where the needs-a-look subset goes. */
  reviewOutput?: string;
  /** `geocode csv`: where the resume record lives. */
  checkpoint?: string;
  /** `geocode csv`: requests per second, averaged. */
  rate?: string;
  /** `geocode csv`: requests in flight at once. */
  concurrency?: string;
  /** `geocode csv`: attempts per row, including the first. */
  maxAttempts?: string;
  /** `geocode csv`: stop after this many rows with an address. Uses requests. */
  sample?: string;
  /** `geocode csv`: result language. */
  lang?: string;
  /** `geocode csv`: count and validate without sending anything. */
  estimate: boolean;
  /** `geocode csv`: continue an existing checkpoint. */
  resume: boolean;
  /** `geocode csv`: prefix a tab onto values a spreadsheet would evaluate. */
  spreadsheetSafe: boolean;
  /** Positional arguments after the command. */
  positionals: string[];
  help: boolean;
}

/** Flags that never take a value; without this list `--yes map` would swallow `map`. */
const BOOLEAN_FLAGS = new Set(["overwrite", "dry-run", "yes", "force", "estimate", "resume", "spreadsheet-safe"]);

/**
 * Tiny `process.argv.slice(2)`-style parser. Supports `--flag value`,
 * `--flag=value`, boolean flags, and `-h/--help`. No external dependency.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    command: undefined,
    positionals: [],
    help: false,
    overwrite: false,
    dryRun: false,
    yes: false,
    force: false,
    estimate: false,
    resume: false,
    spreadsheetSafe: false,
  };
  let i = 0;
  for (; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "-h" || token === "--help") {
      out.help = true;
      continue;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      let name: string;
      let value: string | undefined;
      if (eq >= 0) {
        name = body.slice(0, eq);
        value = body.slice(eq + 1);
      } else {
        name = body;
        const next = argv[i + 1];
        if (!BOOLEAN_FLAGS.has(name) && next != null && !next.startsWith("-")) {
          value = next;
          i++;
        }
      }
      if (name === "key") out.key = value;
      else if (name === "gateway") out.gateway = value;
      else if (name === "region") out.region = value;
      else if (name === "registry") out.registry = value;
      else if (name === "framework") out.framework = value;
      else if (name === "preset") out.preset = value;
      else if (name === "only") out.only = value;
      else if (name === "theme") out.theme = value;
      else if (name === "accent") out.accent = value;
      else if (name === "overwrite") out.overwrite = true;
      else if (name === "dry-run") out.dryRun = true;
      else if (name === "yes") out.yes = true;
      else if (name === "force") out.force = true;
      else if (name === "query-column") out.queryColumn = value;
      else if (name === "output") out.output = value;
      else if (name === "review-output") out.reviewOutput = value;
      else if (name === "checkpoint") out.checkpoint = value;
      else if (name === "rate") out.rate = value;
      else if (name === "concurrency") out.concurrency = value;
      else if (name === "max-attempts") out.maxAttempts = value;
      else if (name === "sample") out.sample = value;
      else if (name === "lang") out.lang = value;
      else if (name === "estimate") out.estimate = true;
      else if (name === "resume") out.resume = true;
      else if (name === "spreadsheet-safe") out.spreadsheetSafe = true;
      continue;
    }
    if (out.command === undefined) out.command = token;
    else out.positionals.push(token);
  }
  return out;
}

const trimGateway = (g?: string) => (g?.trim() || DEFAULT_GATEWAY).replace(/\/+$/, "");

/**
 * URL used to verify a key: a small, always-present style document. A 200 means
 * the key is valid; 401/403 means invalid; anything else is an unexpected error.
 */
export function verifyUrl(key: string, opts: { gateway?: string; style?: string; theme?: string } = {}): string {
  return styleUrl(key, opts.style ?? "base", {
    gateway: trimGateway(opts.gateway),
    ...(opts.theme ? { theme: opts.theme } : {}),
  });
}

export type KeyStatus = "ok" | "invalid" | "error";

/** Map an HTTP status from {@link verifyUrl} to a key verdict. */
export function keyStatusFromResponse(status: number): KeyStatus {
  if (status === 200) return "ok";
  if (status === 401 || status === 403) return "invalid";
  return "error";
}

/** Coerce an arbitrary `--region` value to a known demo city, defaulting to the first. */
export function resolveRegion(region?: string): Region {
  const r = region?.trim().toLowerCase();
  return (DEMO_CITIES as readonly string[]).includes(r ?? "") ? (r as Region) : DEMO_CITIES[0];
}

export interface UnmapConfig {
  $schema: string;
  key: string;
  gateway: string;
  region: Region;
  style: string;
  tiles: string;
}

/** Build the starter `unmap.config.json` contents. */
export function generateConfig(opts: { key: string; region: Region; gateway?: string }): UnmapConfig {
  const gateway = trimGateway(opts.gateway);
  return {
    $schema: "https://unmap.dev/schema/config.json",
    key: opts.key,
    gateway,
    region: opts.region,
    style: styleUrl(opts.key, "base", { gateway }),
    tiles: tileUrl(opts.key, { gateway }),
  };
}

/** Serialize config to pretty JSON with a trailing newline. */
export function serializeConfig(config: UnmapConfig): string {
  return JSON.stringify(config, null, 2) + "\n";
}

/** A minimal, copy-pasteable MapLibre GL init snippet wired to the gateway. */
export function generateInitSnippet(opts: { key: string; region: Region; gateway?: string }): string {
  const style = styleUrl(opts.key, "base", { gateway: trimGateway(opts.gateway) });
  return `import { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Style and key come from unmap.config.json (do not hardcode the key in source).
const map = new Map({
  container: "map",
  style: ${JSON.stringify(style)},
});
`;
}

// ---------------------------------------------------------------------------
// `unmap add` / `unmap create` helpers. Pure functions: everything that touches
// the network, the file system or a child process lives in add.ts / create.ts.
// ---------------------------------------------------------------------------

type PackageJsonLike = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Pick the registry lane from a project's package.json, or undefined when neither fits. */
export function detectFramework(pkg: PackageJsonLike): Framework | undefined {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if ("vue" in deps || "nuxt" in deps) return "vue";
  if ("react" in deps || "next" in deps) return "react";
  return undefined;
}

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

/** Pick a package manager from the lockfile present in the project root. */
export function detectPackageManager(exists: (relativePath: string) => boolean): PackageManager {
  if (exists("pnpm-lock.yaml")) return "pnpm";
  if (exists("yarn.lock")) return "yarn";
  if (exists("bun.lock") || exists("bun.lockb")) return "bun";
  return "npm";
}

const trimUrl = (url: string) => url.trim().replace(/\/+$/, "");

/** The shadcn CLI that owns a lane. Only that CLI can resolve the lane's bare registry dependencies. */
export function shadcnPackage(lane: Framework): "shadcn@latest" | "shadcn-vue@latest" {
  return lane === "vue" ? "shadcn-vue@latest" : "shadcn@latest";
}

/** The `{name}` URL template for a lane, what `components.json` `registries["@unmap"]` holds. */
export function namespaceUrl(registry: string, lane: Framework): string {
  return `${trimUrl(registry)}/r/${lane === "vue" ? "vue/" : ""}{name}.json`;
}

/** The argument `shadcn registry add` takes. */
export function namespaceArg(registry: string, lane: Framework): string {
  return `@unmap=${namespaceUrl(registry, lane)}`;
}

/** True when a parsed components.json already names the `@unmap` registry. */
export function hasNamespace(componentsJson: unknown): boolean {
  if (!componentsJson || typeof componentsJson !== "object") return false;
  const registries = (componentsJson as { registries?: unknown }).registries;
  if (!registries || typeof registries !== "object") return false;
  const entry = (registries as Record<string, unknown>)["@unmap"];
  return typeof entry === "string" || (!!entry && typeof entry === "object");
}

/**
 * The `@unmap` registry URL a parsed components.json currently configures, or null when none is
 * set. Unlike {@link hasNamespace} this resolves the actual URL (a string entry, or an object
 * entry's `url`) so callers can tell an existing entry apart from the URL they want.
 */
export function namespaceEntry(componentsJson: unknown): string | null {
  if (!componentsJson || typeof componentsJson !== "object") return null;
  const registries = (componentsJson as { registries?: unknown }).registries;
  if (!registries || typeof registries !== "object") return null;
  const entry = (registries as Record<string, unknown>)["@unmap"];
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const url = (entry as { url?: unknown }).url;
    return typeof url === "string" ? url : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// `unmap create` decisions.
// ---------------------------------------------------------------------------

/** What `create` can scaffold. `vite` is React on Vite; `vue` is Vue on Vite. */
export const CREATE_FRAMEWORKS = ["next", "vite", "nuxt", "vue"] as const;
export type CreateFramework = (typeof CREATE_FRAMEWORKS)[number];

export function laneOf(framework: CreateFramework): Framework {
  return framework === "nuxt" || framework === "vue" ? "vue" : "react";
}

/** The items a new project gets unless `--only` says otherwise. `map-context` and `map-themes` ride along as dependencies. */
export const DEFAULT_ITEMS = ["map", "geocoder", "routing-panel", "marker-popup"] as const;

/** Validate `--only`. `map` is always first: every other item needs it. */
export function parseOnly(only: string | undefined): string[] | { error: string } {
  if (only == null || only.trim() === "") return [...DEFAULT_ITEMS];
  const requested = only.split(",").map((name) => name.trim()).filter(Boolean);
  for (const name of requested) {
    if (!(REGISTRY_ITEMS as readonly string[]).includes(name)) {
      return { error: `unknown item '${name}'. Items: ${REGISTRY_ITEMS.join(", ")}.` };
    }
  }
  // `create` writes its own home page; on Nuxt it has no <NuxtPage />, so a block page would be
  // unreachable. Blocks go in with `add` once the project exists.
  const block = requested.find(isBlock);
  if (block) {
    return { error: `'${block}' is a block, a whole page: create the project first, then run unmap add ${block} in it.` };
  }
  return [...new Set(["map", ...requested])];
}

/**
 * The `npx` argument list that scaffolds the project. The template is the framework's own name
 * except Vue-on-Vite.
 *
 * On shadcn CLI 4.21.0 / shadcn-vue 2.8.2, `--yes` alone does not silence `init`'s prompts:
 * "Would you like to set up a monorepo?", "Select a component library", "Which icon library
 * would you like to use?" and "Which preset would you like to use?". `run()` inherits stdio, so
 * a person at a terminal does have a TTY and could answer them; the flags exist for CI, scripts
 * and any other non-interactive caller, where an unanswered prompt hangs the child forever and
 * `init` never writes `components.json`.
 *
 * `--no-monorepo` (React-lane only; `shadcn-vue init` has no monorepo prompt/flag) skips the
 * first. `--base` (`base`/`radix`/`aria` for `shadcn`, `reka` for `shadcn-vue`) answers the
 * second; on the Vue lane it is passed unconditionally, since `reka` is shadcn-vue's only base
 * and so cannot contradict a `--preset`. `--icon-library lucide` (shadcn-vue's own default)
 * answers the third. Neither skips the last: only an explicit `--preset` (a style name: `nova`,
 * `vega`, `maia`, `lyra`, `mira`, `luma`, `sera`, `rhea` for React; the same list minus `rhea`
 * for Vue) silences "Which preset", and a caller-supplied preset also carries its own icon
 * library, which is why `--icon-library` is only added when no preset is given.
 */
export function initArgs(framework: CreateFramework, name: string, preset?: string): string[] {
  const template = framework === "vue" ? "vite" : framework;
  const lane = laneOf(framework);
  const base: string[] =
    lane === "vue"
      ? ["--base", "reka", ...(preset ? ["--preset", preset] : ["--icon-library", "lucide", "--preset", "nova"])]
      : ["--no-monorepo", ...(preset ? ["--preset", preset] : ["--base", "base", "--preset", "nova"])];
  return [shadcnPackage(lane), "init", "--template", template, "--name", name, ...base, "--yes"];
}

/** Where the key goes and what the framework's bundler exposes it as. */
export function envFile(framework: CreateFramework): { file: string; name: string } {
  switch (framework) {
    case "next":
      return { file: ".env.local", name: "NEXT_PUBLIC_UNMAP_KEY" };
    case "nuxt":
      return { file: ".env", name: "NUXT_PUBLIC_UNMAP_KEY" };
    case "vite":
    case "vue":
      return { file: ".env.local", name: "VITE_UNMAP_KEY" };
  }
}

export function envLine(name: string, key: string | null): string {
  return key ? `${name}=${key}\n` : `# Paste your unmap key from https://unmap.dev/dashboard\n${name}=\n`;
}

/**
 * The demo page reads `import.meta.env.VITE_UNMAP_KEY`, which only typechecks under `vue-tsc`/
 * `tsc` when something declares `vite/client` types. `shadcn init --template vite` does not
 * always ship `src/vite-env.d.ts` (shadcn-vue's template omits it), so `runCreate` writes this
 * file itself on the Vite-based frameworks. Null on `next`/`nuxt`, which don't use `import.meta.env`.
 */
export function viteEnvTypes(framework: CreateFramework): { path: string; content: string } | null {
  if (framework !== "vite" && framework !== "vue") return null;
  return { path: "src/vite-env.d.ts", content: '/// <reference types="vite/client" />\n' };
}

const CALGARY = "[-114.07, 51.05]";

/**
 * The home page of a fresh project: a full-height map, the search box over it, one pin. Reads the
 * key from the framework's public env so no key is ever in source. Only installed items appear.
 */
export function demoPage(
  framework: CreateFramework,
  opts: { envName: string; items: string[]; theme?: string; accent?: "theme" | "system"; nuxtAppDir?: boolean },
): { path: string; content: string } {
  const has = (item: string) => opts.items.includes(item);
  const themeProps = opts.theme ? ` theme="${opts.theme}"${opts.accent ? ` accent="${opts.accent}"` : ""}` : "";

  if (framework === "next" || framework === "vite") {
    const keyExpr = framework === "next" ? `process.env.${opts.envName}` : `import.meta.env.${opts.envName}`;
    const imports = [
      `import { Map } from "@/components/ui/map";`,
      has("geocoder") ? `import { Geocoder } from "@/components/ui/geocoder";` : null,
      has("routing-panel") ? `import { RoutingPanel } from "@/components/ui/routing-panel";` : null,
      has("marker-popup") ? `import { Marker, Popup } from "@/components/ui/marker-popup";` : null,
    ].filter(Boolean);
    const overlay = [
      has("geocoder") ? `        <Geocoder apiKey={apiKey} />` : null,
      has("routing-panel") ? `        <RoutingPanel apiKey={apiKey} />` : null,
    ].filter(Boolean);
    const body = [
      overlay.length ? `      <div className="absolute top-4 left-4 z-10 flex w-80 flex-col gap-4">\n${overlay.join("\n")}\n      </div>` : null,
      has("marker-popup") ? `      <Marker lngLat={${CALGARY}}>\n        <Popup>Calgary</Popup>\n      </Marker>` : null,
    ].filter(Boolean);
    const content = `${imports.join("\n")}

const apiKey = ${keyExpr} ?? "";

export default function ${framework === "next" ? "Home" : "App"}() {
  return (
    <main className="h-dvh p-4">
      <Map apiKey={apiKey} center={${CALGARY}} zoom={11}${themeProps} className="h-full">
${body.join("\n")}
      </Map>
    </main>
  );
}
`;
    return { path: framework === "next" ? "app/page.tsx" : "src/App.tsx", content };
  }

  const keyExpr = framework === "nuxt" ? "useRuntimeConfig().public.unmapKey" : `import.meta.env.${opts.envName} ?? ""`;
  const imports = [
    `import { UnmapMap } from "@/components/ui/map";`,
    has("geocoder") ? `import { UnmapGeocoder } from "@/components/ui/geocoder";` : null,
    has("routing-panel") ? `import { UnmapRoutingPanel } from "@/components/ui/routing-panel";` : null,
    has("marker-popup") ? `import { UnmapMarker, UnmapPopup } from "@/components/ui/marker-popup";` : null,
  ].filter(Boolean);
  const overlay = [
    has("geocoder") ? `        <UnmapGeocoder :api-key="apiKey" />` : null,
    has("routing-panel") ? `        <UnmapRoutingPanel :api-key="apiKey" />` : null,
  ].filter(Boolean);
  const body = [
    overlay.length ? `      <div class="absolute top-4 left-4 z-10 flex w-80 flex-col gap-4">\n${overlay.join("\n")}\n      </div>` : null,
    has("marker-popup") ? `      <UnmapMarker :lng-lat="${CALGARY}">\n        <UnmapPopup>Calgary</UnmapPopup>\n      </UnmapMarker>` : null,
  ].filter(Boolean);
  const content = `<script setup lang="ts">
${imports.join("\n")}

const apiKey = ${keyExpr};
</script>

<template>
  <main class="h-dvh p-4">
    <UnmapMap :api-key="apiKey" :center="${CALGARY}" :zoom="11"${themeProps} class="h-full">
${body.join("\n")}
    </UnmapMap>
  </main>
</template>
`;
  const path = framework === "nuxt" ? (opts.nuxtAppDir ? "app/app.vue" : "app.vue") : "src/App.vue";
  return { path, content };
}

/**
 * The brace that closes the object opening at `open`, and the keys at that object's top level,
 * skipping strings and comments. Null when the braces never balance.
 */
function scanObject(source: string, open: number): { close: number; keys: Map<string, number> } | null {
  const keys = new Map<string, number>();
  let depth = 0;
  let expectKey = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i]!;
    if (c === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      if (newline < 0) return null;
      i = newline;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 1;
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === "\\" ? 2 : 1;
      if (j >= source.length) return null;
      if (depth === 1 && expectKey && !keys.has(source.slice(i + 1, j))) keys.set(source.slice(i + 1, j), i);
      expectKey = false;
      i = j;
      continue;
    }
    if (c === "{") {
      depth++;
      expectKey = depth === 1;
      continue;
    }
    if (c === "}") {
      depth--;
      if (depth === 0) return { close: i, keys };
      continue;
    }
    if (c === "," && depth === 1) {
      expectKey = true;
      continue;
    }
    const identifier = depth === 1 && expectKey ? /^[A-Za-z_$][\w$]*/.exec(source.slice(i)) : null;
    if (identifier) {
      if (!keys.has(identifier[0])) keys.set(identifier[0], i);
      i += identifier[0].length - 1;
    }
    expectKey = false;
  }
  return null;
}

/** Insert `entry` as the first property of the object opening at `open`, in that object's own layout. */
function insertFirstProperty(source: string, open: number, entry: string): string {
  const head = source.slice(0, open + 1);
  const rest = source.slice(open + 1);
  const empty = /^\s*\}/.exec(rest);
  if (empty) return `${head} ${entry} ${rest.slice(empty[0].length - 1)}`;
  const multiline = /^[ \t]*(\r?\n)([ \t]*)/.exec(rest);
  if (multiline) return `${head}${multiline[1]}${multiline[2]}${entry},${rest}`;
  return `${head} ${entry},${rest.startsWith(" ") ? "" : " "}${rest}`;
}

/**
 * Nuxt only exposes `NUXT_PUBLIC_*` env vars through declared runtime config. Declare
 * `unmapKey` by splicing the source, so its formatting survives: into an existing
 * `runtimeConfig.public`, into an existing `runtimeConfig` as a new `public`, or as a new
 * `runtimeConfig` at the top of a stock `defineNuxtConfig({ ... })`. Null when the file is not a
 * shape that can be edited safely (runtimeConfig declared twice, or not as an object literal,
 * `public` not an object literal, braces that never balance), so the caller prints the manual
 * line instead of guessing.
 */
export function withNuxtRuntimeConfig(source: string): string | null {
  const entry = "unmapKey: ''";
  const mentions = source.match(/runtimeConfig/g)?.length ?? 0;
  if (mentions === 0) {
    const match = source.match(/defineNuxtConfig\(\{\n?/);
    if (!match || match.index == null) return null;
    const insertAt = match.index + match[0].length;
    const indent = match[0].endsWith("\n") ? "  " : " ";
    return `${source.slice(0, insertAt)}${indent}runtimeConfig: { public: { ${entry} } },${match[0].endsWith("\n") ? "\n" : " "}${source.slice(insertAt)}`;
  }
  if (mentions > 1) return null;
  const declaration = /runtimeConfig\s*:\s*\{/.exec(source);
  if (!declaration) return null;
  const runtimeOpen = declaration.index + declaration[0].length - 1;
  const runtime = scanObject(source, runtimeOpen);
  if (!runtime) return null;
  const publicAt = runtime.keys.get("public");
  if (publicAt === undefined) return insertFirstProperty(source, runtimeOpen, `public: { ${entry} }`);
  const publicDeclaration = /^["']?public["']?\s*:\s*\{/.exec(source.slice(publicAt));
  if (!publicDeclaration) return null;
  const publicOpen = publicAt + publicDeclaration[0].length - 1;
  if (!scanObject(source, publicOpen)) return null;
  return insertFirstProperty(source, publicOpen, entry);
}

export function accentQuestion(themeHex: string | null): string {
  const accent = themeHex ? `this theme's accent (${themeHex})` : "this theme's accent";
  return `Markers and routes: ${accent} or your design system's primary? [theme/system] (theme) `;
}

/** "theme" for an empty answer or t/theme, "system" for s/system, null for anything else. */
export function parseAccent(answer: string | undefined): "theme" | "system" | null {
  if (answer == null) return null;
  const normalised = answer.trim().toLowerCase();
  if (normalised === "" || normalised === "t" || normalised === "theme") return "theme";
  if (normalised === "s" || normalised === "system") return "system";
  return null;
}

export function devCommand(manager: PackageManager): string {
  return manager === "npm" ? "npm run dev" : `${manager} dev`;
}

// ---------------------------------------------------------------------------
// `unmap geocode csv` option coercion. Pure, so the clamps are testable without
// a file system; the command itself lives in geocode.ts.
// ---------------------------------------------------------------------------

/**
 * Turn `--rate` / `--concurrency` / `--max-attempts` / `--sample` into numbers, clamped.
 *
 * Clamped rather than rejected, for the same reason `parseLimit` in the geocode service clamps:
 * an out-of-range value is not a malformed command, it is one to cap. The ceilings exist because
 * a batch job shares an account's allowance with whatever that account is serving to real users
 * — the published burst limit is 1,000 requests per 60 seconds per key per location, and a CLI
 * that lets someone type `--rate 500` is a CLI that gets their production maps rate limited.
 */
export function parseBatchOptions(args: {
  rate?: string;
  concurrency?: string;
  maxAttempts?: string;
  sample?: string;
  lang?: string;
  spreadsheetSafe?: boolean;
}): BatchOptions {
  const num = (raw: string | undefined, fallback: number, min: number, max: number) => {
    if (raw == null || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  };
  return {
    rate: num(args.rate, DEFAULT_OPTIONS.rate, 1, 100),
    concurrency: num(args.concurrency, DEFAULT_OPTIONS.concurrency, 1, 16),
    maxAttempts: num(args.maxAttempts, DEFAULT_OPTIONS.maxAttempts, 1, 10),
    ...(args.sample != null && args.sample.trim() !== ""
      ? { sample: num(args.sample, 100, 1, 1_000_000) }
      : {}),
    spreadsheetSafe: args.spreadsheetSafe === true,
    ...(args.lang?.trim() ? { lang: args.lang.trim() } : {}),
  };
}
