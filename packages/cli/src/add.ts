import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_REGISTRY,
  FRAMEWORKS,
  NUXT_CONFIG_FILES,
  REGISTRY_ITEMS,
  blockNotes,
  detectFramework,
  envDeclares,
  envLine,
  isBlock,
  namespaceEntry,
  namespaceUrl,
  nuxtMajor,
  nuxtSetsSrcDir,
  pageHost,
  rendersNuxtPage,
  shadcnPackage,
  withNuxtRuntimeConfig,
  reactOnlyRefusal,
  REACT_BLOCKS,
  templatePage,
  unsupportedBlock,
  type Framework,
  type NuxtProbe,
  type PageHost,
  type ParsedArgs,
} from "./index";

/** Everything `runAdd` and `runCreate` need from the outside world, injectable for tests. */
export interface AddIO {
  fetch?: typeof fetch;
  spawn?: typeof nodeSpawn;
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  /** Ask the user a question and resolve their answer. Absent means non-interactive. */
  ask?: (question: string) => Promise<string>;
}

/** Write `contents` to `path` unless a file is already there. Reports either way. Returns true when written. */
export async function writeIfAbsent(
  path: string,
  contents: string,
  io: Pick<AddIO, "stdout" | "stderr"> = {},
  overwrite = false,
): Promise<boolean> {
  const out = io.stdout ?? ((text) => process.stdout.write(text));
  const err = io.stderr ?? ((text) => process.stderr.write(text));
  if (!overwrite && existsSync(path)) {
    err(`  skipped ${path} (already exists)\n`);
    return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
  out(`  wrote ${path}\n`);
  return true;
}

/** Run a child process with inherited stdio; resolves to its exit code (1 on spawn error). */
export function run(spawn: typeof nodeSpawn, command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((done) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", () => done(1));
    child.on("close", (code) => done(code ?? 1));
  });
}

export async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Make sure `components.json` in `cwd` names the `@unmap` registry. Returns 0 once it does.
 *
 * Both lanes get there the same way: we write the `registries["@unmap"]` entry into
 * `components.json` ourselves. Neither CLI can be relied on to do it. `shadcn-vue` (2.8.2) has no
 * `registry add` at all — its verbs are init, add, apply, diff, docs, view, search, migrate, info,
 * build, mcp, and `registry add` exits 1 with `unknown command 'registry'`. `shadcn` (4.21) does
 * have `registry add`, but it refuses to touch a name that is already configured: it prints
 * `Skipped 1 registry: (already configured)` and exits 0 without changing the file, and there is no
 * overwrite flag, so it could never honour an explicit `--registry` that rebases the namespace.
 * Both CLIs honour a hand-written string entry — the discovery test proves `search` and `view`
 * resolve `@unmap` from one — so writing it is both simpler and the only thing that always works.
 *
 * An existing entry pointing at a different URL is left alone, so a stale local edit does not get
 * silently clobbered — unless `options.force` is set, which is how a caller who explicitly passed
 * `--registry` says they mean it.
 */
export interface EnsureNamespaceResult {
  code: number;
  /** True once this call actually wrote the `@unmap` entry to components.json. */
  wrote: boolean;
  /** True when `options.dryRun` stopped short of a write that would otherwise have happened. */
  wouldWrite: boolean;
  /** True when a differently-configured existing entry is the one being replaced (force, i.e. an explicit `--registry`). */
  replacing: boolean;
}

export async function ensureNamespace(
  lane: Framework,
  registry: string,
  cwd: string,
  out: (text: string) => void,
  err: (text: string) => void = (text) => process.stderr.write(text),
  options: { dryRun?: boolean; force?: boolean } = {},
): Promise<EnsureNamespaceResult> {
  const path = resolve(cwd, "components.json");
  const components = await readJson(path);
  const configured = namespaceEntry(components);
  const wanted = namespaceUrl(registry, lane);
  const replacing = Boolean(configured) && configured !== wanted && options.force === true;
  if (configured === wanted) return { code: 0, wrote: false, wouldWrite: false, replacing: false };
  if (configured && !options.force) return { code: 0, wrote: false, wouldWrite: false, replacing: false };

  if (!components) {
    err(`error: components.json could not be parsed; add "registries": {"@unmap": "${wanted}"} by hand.\n`);
    return { code: 1, wrote: false, wouldWrite: false, replacing };
  }
  if (options.dryRun) {
    out(`Would register @unmap in components.json as ${wanted}\n`);
    return { code: 0, wrote: false, wouldWrite: true, replacing };
  }
  const registries =
    components.registries && typeof components.registries === "object" && !Array.isArray(components.registries)
      ? (components.registries as Record<string, unknown>)
      : {};
  const next = { ...components, registries: { ...registries, "@unmap": wanted } };
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  out("Registered the @unmap registry in components.json\n");
  return { code: 0, wrote: true, wouldWrite: false, replacing };
}

/** The nuxt.config file in `cwd`, relative, or null. */
function nuxtConfigFile(cwd: string): string | null {
  return NUXT_CONFIG_FILES.find((file) => existsSync(resolve(cwd, file))) ?? null;
}

/** Nuxt's version, config and `app/` contents, read the way Nuxt itself would decide its layout. */
export async function probeNuxt(cwd: string): Promise<NuxtProbe> {
  const installed = await readJson(resolve(cwd, "node_modules/nuxt/package.json"));
  const pkg = await readJson(resolve(cwd, "package.json"));
  const declared = [pkg?.dependencies, pkg?.devDependencies]
    .map((deps) => (deps && typeof deps === "object" ? (deps as Record<string, unknown>).nuxt : undefined))
    .find((range): range is string => typeof range === "string");
  const configFile = nuxtConfigFile(cwd);
  const app = resolve(cwd, "app");
  return {
    major: nuxtMajor(typeof installed?.version === "string" ? installed.version : null, declared),
    config: configFile ? await readFile(resolve(cwd, configFile), "utf8") : null,
    ...(existsSync(app) ? { appEntries: readdirSync(app) } : {}),
  };
}

export interface NuxtPreparation {
  /** The env file holding NUXT_PUBLIC_UNMAP_KEY, relative. */
  envFile: string;
  /** True when nuxt.config could not be edited and the reader has to declare `unmapKey` by hand. */
  runtimeConfigManual: boolean;
}

/**
 * Nuxt reads `.env`, and exposes a `NUXT_PUBLIC_*` variable only through a key that
 * `runtimeConfig.public` declares. shadcn-vue's own envVars step writes to `.env.local` when it
 * exists or when there is no `.env`, and Nuxt ignores `.env.local` unless started with
 * `--dotenv`, so a block page would get no key. Write both first: the `.env` line (unless `.env`
 * or `.env.local` already assigns the variable, in any form dotenv reads) and `unmapKey` under
 * `runtimeConfig.public` (unless nuxt.config already mentions `unmapKey`).
 */
export async function prepareNuxt(cwd: string, out: (text: string) => void): Promise<NuxtPreparation> {
  const name = "NUXT_PUBLIC_UNMAP_KEY";
  let envFile = ".env";
  const holder = [".env", ".env.local"].find(
    (file) => existsSync(resolve(cwd, file)) && envDeclares(readFileSync(resolve(cwd, file), "utf8"), name),
  );
  if (holder) {
    envFile = holder;
  } else if (existsSync(resolve(cwd, ".env"))) {
    const existing = await readFile(resolve(cwd, ".env"), "utf8");
    await writeFile(resolve(cwd, ".env"), `${existing}${existing === "" || existing.endsWith("\n") ? "" : "\n"}${envLine(name, null)}`, "utf8");
    out(`  appended ${name} to .env\n`);
  } else {
    await writeFile(resolve(cwd, ".env"), envLine(name, null), "utf8");
    out(`  wrote .env with an empty ${name}\n`);
  }

  const configFile = nuxtConfigFile(cwd);
  const source = configFile ? await readFile(resolve(cwd, configFile), "utf8") : null;
  if (configFile && source && /unmapKey/.test(source)) return { envFile, runtimeConfigManual: false };
  const updated = source ? withNuxtRuntimeConfig(source) : null;
  if (configFile && updated) {
    await writeFile(resolve(cwd, configFile), updated, "utf8");
    out(`  declared runtimeConfig.public.unmapKey in ${configFile}\n`);
    return { envFile, runtimeConfigManual: false };
  }
  out("  add `unmapKey: ''` under `runtimeConfig.public` in nuxt.config so NUXT_PUBLIC_UNMAP_KEY reaches the page.\n");
  return { envFile, runtimeConfigManual: true };
}

/** What each block's `app/pages/<name>.vue` held before the handoff (null: absent), so only files this run wrote are moved. */
export function snapshotPages(cwd: string, blocks: string[]): Map<string, string | null> {
  return new Map(
    blocks.map((block) => {
      const path = resolve(cwd, "app/pages", `${block}.vue`);
      return [block, existsSync(path) ? readFileSync(path, "utf8") : null] as const;
    }),
  );
}

/**
 * shadcn-vue writes a block page to `app/pages/<name>.vue` whatever the layout. Where pages live
 * at the root, move each page this run wrote to `pages/`. On a collision the existing page wins
 * and the fresh copy is deleted, unless `overwrite` says to replace it. Then remove `app/pages`
 * and `app` if they are empty: a leftover `app/` holding pages would make the next run read the
 * Nuxt 4 layout, and makes Nuxt 4 itself switch `srcDir` to `app/`.
 */
export async function movePagesToNuxt3(
  cwd: string,
  blocks: string[],
  out: (text: string) => void,
  err: (text: string) => void,
  options: { overwrite?: boolean; before?: Map<string, string | null> } = {},
): Promise<void> {
  for (const block of blocks) {
    const fromRelative = `app/pages/${block}.vue`;
    const toRelative = `pages/${block}.vue`;
    const from = resolve(cwd, fromRelative);
    const to = resolve(cwd, toRelative);
    if (!existsSync(from)) continue;
    const before = options.before?.get(block);
    if (typeof before === "string" && readFileSync(from, "utf8") === before) continue;
    if (existsSync(to) && !options.overwrite) {
      await unlink(from);
      err(`  kept ${toRelative} and removed the new ${fromRelative}; pass --overwrite to replace it\n`);
      continue;
    }
    const replacing = existsSync(to);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    out(
      replacing
        ? `  replaced ${toRelative} with ${fromRelative} (Nuxt 3 layout)\n`
        : `  moved ${fromRelative} to ${toRelative} (Nuxt 3 layout)\n`,
    );
  }
  for (const directory of ["app/pages", "app"]) {
    const path = resolve(cwd, directory);
    if (existsSync(path) && readdirSync(path).length === 0) await rmdir(path);
  }
}

/** Where shadcn or shadcn-vue may have put a block's page, relative, in the order they would. */
function pageCandidates(lane: Framework, host: PageHost, block: string): string[] {
  if (lane === "vue") {
    return [host === "nuxt3" ? `pages/${block}.vue` : `app/pages/${block}.vue`, `resources/js/pages/${block}.vue`];
  }
  return [
    `app/${block}/page.tsx`,
    `src/app/${block}/page.tsx`,
    `pages/${block}.tsx`,
    `src/pages/${block}.tsx`,
    `app/routes/${block}.tsx`,
    `src/app/routes/${block}.tsx`,
    `resources/js/pages/${block}.tsx`,
  ];
}

/**
 * `unmap add <item...>`: install registry components into the current project the shadcn way.
 *
 * Detects the lane from package.json, makes sure `components.json` names `@unmap` by writing the
 * `registries` entry itself on both lanes (see {@link ensureNamespace}), then hands off to
 * `npx shadcn add @unmap/<item>` (React) or `npx shadcn-vue add @unmap/<item>` (Vue, Nuxt). Those
 * CLIs own file placement, alias rewriting, the overwrite prompt and dependency installs, which is
 * the whole point: the components land exactly where the customer's own do.
 *
 * `--dry-run` is the one flag that does not survive the handoff on the Vue lane: shadcn-vue 2.8.2
 * rejects it outright (`The --dry-run, --diff and --view options are not yet supported in
 * shadcn-vue.`, exit 1), so there we print the command that would run and stop.
 */
export async function runAdd(args: ParsedArgs, io: AddIO = {}): Promise<number> {
  const out = io.stdout ?? ((text) => process.stdout.write(text));
  const err = io.stderr ?? ((text) => process.stderr.write(text));
  const spawn = io.spawn ?? nodeSpawn;
  const cwd = io.cwd ?? process.cwd();

  const names = args.positionals;
  const explicitRegistry = args.registry?.trim() ? args.registry.trim() : undefined;
  const registry = (explicitRegistry ?? DEFAULT_REGISTRY).replace(/\/+$/, "");
  // What each item is, for a person or an agent that named none or a wrong one. The registry build
  // writes it (apps/registry/scripts/generate-llms.ts), so a --registry preview has its own.
  const catalog = `${registry}/llms.txt`;
  if (names.length === 0) {
    err(`error: name at least one item to add: ${REGISTRY_ITEMS.join(", ")}.\nWhat each one is: ${catalog}\n`);
    return 1;
  }
  const unknown = names.find((name) => !(REGISTRY_ITEMS as readonly string[]).includes(name));
  if (unknown) {
    err(`error: unknown item '${unknown}'. Items: ${REGISTRY_ITEMS.join(", ")}.\nWhat each one is: ${catalog}\n`);
    return 1;
  }

  let lane: Framework | undefined;
  if (args.framework != null) {
    if (!(FRAMEWORKS as readonly string[]).includes(args.framework)) {
      err(`error: unknown framework '${args.framework}'. Use ${FRAMEWORKS.join(" or ")}.\n`);
      return 1;
    }
    lane = args.framework as Framework;
  } else {
    const pkg = await readJson(resolve(cwd, "package.json"));
    lane = pkg ? detectFramework(pkg) : undefined;
    if (!lane) {
      err("error: could not tell React from Vue in package.json. Pass --framework react or --framework vue.\n");
      return 1;
    }
  }

  const unsupported = unsupportedBlock(names, lane);
  if (unsupported) {
    err(reactOnlyRefusal(unsupported, "Use a React project with shadcn (Base UI)"));
    return 1;
  }

  if (!existsSync(resolve(cwd, "components.json"))) {
    const init = lane === "vue" ? "npx shadcn-vue@latest init" : "npx shadcn@latest init";
    err(
      `error: no components.json here. Start a new project with 'unmap create <name>' or initialise this one with '${init}'.\n` +
        (lane === "vue"
          ? "Not on shadcn-vue? @unmap/vue and @unmap/nuxt provide the map, geocoder and routing as composables for any UI.\n"
          : ""),
    );
    return 1;
  }

  const registered = await ensureNamespace(lane, registry, cwd, out, err, {
    dryRun: args.dryRun,
    force: explicitRegistry != null,
  });
  if (registered.code !== 0) return registered.code;

  if (lane === "react" && args.dryRun && registered.wouldWrite) {
    const urls = names.map((name) => namespaceUrl(registry, "react").replace("{name}", name));
    const until = registered.replacing ? "the entry is updated" : "the entry exists";
    out(
      `note: shadcn's --dry-run cannot resolve @unmap until ${until}; this run will fail. Run once without ` +
        `--dry-run, or preview the URL form: npx ${shadcnPackage(lane)} add --dry-run ${urls.join(" ")}\n`,
    );
  }

  const flags = [
    ...(args.overwrite ? ["--overwrite"] : []),
    // shadcn-vue would exit 1 on --dry-run, so it never appears in the Vue lane's command.
    ...(args.dryRun && lane !== "vue" ? ["--dry-run"] : []),
    ...(args.yes ? ["--yes"] : []),
  ];
  const addArgs = [shadcnPackage(lane), "add", ...flags, ...names.map((name) => `@unmap/${name}`)];
  if (lane === "vue" && args.dryRun) {
    out(`shadcn-vue 2.8 has no --dry-run; would run: npx ${addArgs.join(" ")}\n`);
    return 0;
  }

  // Blocks carry a page; judge where it can go before the handoff creates any directory, and
  // give a Nuxt project its key wiring first (see prepareNuxt).
  const blocks = names.filter(isBlock);
  const exists = (relativePath: string) => existsSync(resolve(cwd, relativePath));
  const nuxtProject = lane === "vue" && nuxtConfigFile(cwd) !== null;
  const probe = blocks.length > 0 && nuxtProject ? await probeNuxt(cwd) : {};
  const host = blocks.length > 0 ? pageHost(lane, exists, probe) : "none";
  const nuxtSrcDir = nuxtProject && nuxtSetsSrcDir(probe.config);
  const prepared = blocks.length > 0 && nuxtProject && !args.dryRun ? await prepareNuxt(cwd, out) : null;
  const before = host === "nuxt3" ? snapshotPages(cwd, blocks) : undefined;

  out(`${lane === "vue" ? "Vue" : "React"} project: npx ${addArgs.join(" ")}\n`);
  const code = await run(spawn, "npx", addArgs, cwd);
  if (args.dryRun) return code;
  if (blocks.length === 0) {
    if (code === 0) out(itemPages(registry, lane, names));
    return code;
  }
  // Even after a failure: shadcn-vue writes files before it installs dependencies.
  if (host === "nuxt3") await movePagesToNuxt3(cwd, blocks, out, err, { overwrite: args.overwrite, before });
  if (code !== 0) return code;

  const pages: Record<string, string> = {};
  if (!nuxtSrcDir) {
    for (const block of blocks) {
      const found = pageCandidates(lane, host, block).find(exists);
      if (found) pages[block] = found;
    }
  }
  const envFile =
    prepared?.envFile ??
    (host === "next"
      ? [".env.local", ".env"].find((file) => exists(file) && envDeclares(readFileSync(resolve(cwd, file), "utf8"), "NEXT_PUBLIC_UNMAP_KEY"))
      : undefined);
  const appVue = host === "nuxt" ? "app/app.vue" : host === "nuxt3" ? "app.vue" : null;
  const nuxtPageMissing = appVue !== null && exists(appVue) && !rendersNuxtPage(await readFile(resolve(cwd, appVue), "utf8"));
  const notes = blockNotes(host, lane, blocks, {
    nuxtPageMissing,
    pages,
    ...(envFile ? { envFile } : {}),
    runtimeConfigManual: prepared?.runtimeConfigManual ?? false,
    nuxtSrcDir,
  });
  for (const line of notes) out(`${line}\n`);
  out(itemPages(registry, lane, names));
  return 0;
}

/**
 * Where to read up on what `add` just installed: each item's Markdown page in this lane (install
 * notes, props and usage, written by the registry build in apps/registry/scripts/generate-llms.ts),
 * and for a page block, template or example its gallery page too. Output only; nothing is fetched.
 */
function itemPages(registry: string, lane: Framework, names: readonly string[]): string {
  const lines = names.map((name) => {
    const page = `  ${name}: ${registry}/llm/${lane === "vue" ? "vue/" : ""}${name}.md\n`;
    const inGallery = isBlock(name) || (REACT_BLOCKS as readonly string[]).includes(name);
    return inGallery ? `${page}    Preview and setup: ${templatePage(name)}\n` : page;
  });
  return `Docs for each item, for you or a coding agent:\n${lines.join("")}`;
}
