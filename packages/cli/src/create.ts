import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureNamespace, run, writeIfAbsent, type AddIO } from "./add";
import {
  CREATE_FRAMEWORKS,
  DEFAULT_GATEWAY,
  DEFAULT_REGISTRY,
  accentQuestion,
  demoPage,
  detectPackageManager,
  devCommand,
  envFile,
  envLine,
  initArgs,
  keyStatusFromResponse,
  laneOf,
  parseAccent,
  parseOnly,
  shadcnPackage,
  reactOnlyRefusal,
  unsupportedBlock,
  verifyUrl,
  viteEnvTypes,
  withNuxtRuntimeConfig,
  type CreateFramework,
  type ParsedArgs,
} from "./index";

/**
 * The theme's marker colour, read from the gateway's resolved style metadata, so the accent
 * question can show the hex it is asking about. Null when it cannot be read (no key, network).
 */
export async function themeAccentHex(
  fetchImpl: typeof fetch,
  gateway: string | undefined,
  key: string | null,
  theme: string,
): Promise<string | null> {
  if (!key) return null;
  try {
    const url = verifyUrl(key, { gateway, theme });
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const style = (await response.json()) as { metadata?: Record<string, unknown> };
    const meta = style.metadata?.["unmap:theme"] as { marker?: { color?: string } } | undefined;
    const color = meta?.marker?.color;
    return typeof color === "string" && !color.includes("var(") ? color : null;
  } catch {
    return null;
  }
}

/**
 * `unmap create <name>`: a new shadcn or shadcn-vue project with the map components in it.
 *
 * A conductor, not a scaffolder: `shadcn init` / `shadcn-vue init` build the project with the
 * customer's chosen template and preset, then this registers `@unmap`, adds the items, writes
 * the key to the framework's public env file, and replaces the template home page with a map.
 */
export async function runCreate(args: ParsedArgs, io: AddIO = {}): Promise<number> {
  const out = io.stdout ?? ((text) => process.stdout.write(text));
  const err = io.stderr ?? ((text) => process.stderr.write(text));
  const fetchImpl = io.fetch ?? globalThis.fetch;
  const spawn = io.spawn ?? nodeSpawn;
  const cwd = io.cwd ?? process.cwd();

  const name = args.positionals[0];
  if (!name || !/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    err("error: give the project a name: unmap create <name>.\n");
    return 1;
  }
  const project = resolve(cwd, name);
  if (existsSync(project)) {
    if (!statSync(project).isDirectory()) {
      err(`error: ${name} exists and is a file.\n`);
      return 1;
    }
    if (readdirSync(project).length > 0 && !args.force) {
      err(`error: ${name} exists and is not empty. Pass --force to scaffold into it anyway.\n`);
      return 1;
    }
  }

  let framework: CreateFramework;
  if (args.framework != null) {
    if (!(CREATE_FRAMEWORKS as readonly string[]).includes(args.framework)) {
      err(`error: unknown framework '${args.framework}'. Use ${CREATE_FRAMEWORKS.join(", ")}.\n`);
      return 1;
    }
    framework = args.framework as CreateFramework;
  } else if (io.ask) {
    const answer = (await io.ask(`Framework? [${CREATE_FRAMEWORKS.join("/")}] (next) `)).trim().toLowerCase();
    if (answer && !(CREATE_FRAMEWORKS as readonly string[]).includes(answer)) {
      err(`error: unknown framework '${answer}'. Use ${CREATE_FRAMEWORKS.join(", ")}.\n`);
      return 1;
    }
    framework = (answer || "next") as CreateFramework;
  } else {
    framework = "next";
  }
  const lane = laneOf(framework);

  const items = parseOnly(args.only);
  if (!Array.isArray(items)) {
    err(`error: ${items.error}\n`);
    return 1;
  }
  const unsupported = unsupportedBlock(items, lane);
  if (unsupported) {
    err(reactOnlyRefusal(unsupported, "Choose --framework next or --framework vite"));
    return 1;
  }

  if (args.accent != null && !args.theme) {
    err("error: --accent only applies with --theme.\n");
    return 1;
  }

  let accent: "theme" | "system" | undefined;
  if (args.accent != null) {
    const parsed = parseAccent(args.accent);
    if (!parsed) {
      err("error: --accent must be 'theme' or 'system'.\n");
      return 1;
    }
    accent = parsed;
  }

  const key = args.key ?? process.env.UNMAP_KEY ?? null;
  if (key) {
    out(`Verifying key against ${args.gateway ?? DEFAULT_GATEWAY}...\n`);
    let status: "ok" | "invalid" | "error";
    try {
      const response = await fetchImpl(verifyUrl(key, { gateway: args.gateway }), { headers: { accept: "application/json" } });
      status = keyStatusFromResponse(response.status);
    } catch {
      status = "error";
    }
    if (status === "invalid") {
      err("error: key rejected by the gateway (401/403). Check the key and try again.\n");
      return 1;
    }
    if (status === "error") err("warning: could not reach the gateway to verify the key; continuing anyway.\n");
    else out("  key ok\n");
  }

  if (args.theme && accent === undefined) {
    if (io.ask) {
      const hex = await themeAccentHex(fetchImpl, args.gateway, key, args.theme);
      const parsed = parseAccent(await io.ask(accentQuestion(hex)));
      if (!parsed) {
        err("error: answer 'theme' or 'system'.\n");
        return 1;
      }
      accent = parsed;
    } else {
      accent = "theme";
    }
  }

  const explicitRegistry = args.registry?.trim() ? args.registry.trim() : undefined;
  const registry = (explicitRegistry ?? DEFAULT_REGISTRY).replace(/\/+$/, "");

  const init = initArgs(framework, name, args.preset);
  out(`Scaffolding with npx ${init.join(" ")}\n`);
  const initCode = await run(spawn, "npx", init, cwd);
  if (initCode !== 0) return initCode;
  if (!existsSync(resolve(project, "components.json"))) {
    err(`error: ${shadcnPackage(lane)} init finished but ${name}/components.json is missing. Nothing else was changed.\n`);
    return 1;
  }

  const registered = await ensureNamespace(lane, registry, project, out, err, {
    force: explicitRegistry != null,
  });
  if (registered.code !== 0) return registered.code;

  const add = [shadcnPackage(lane), "add", "--yes", ...items.map((item) => `@unmap/${item}`)];
  out(`Adding components: npx ${add.join(" ")}\n`);
  const addCode = await run(spawn, "npx", add, project);
  if (addCode !== 0) return addCode;

  const env = envFile(framework);
  const envPath = resolve(project, env.file);
  if (existsSync(envPath)) {
    const existing = await readFile(envPath, "utf8");
    if (new RegExp(`^${env.name}=`, "m").test(existing)) {
      out(`  left ${env.file} alone: ${env.name} is already set\n`);
    } else {
      await writeFile(
        envPath,
        `${existing}${existing.endsWith("\n") || existing === "" ? "" : "\n"}${envLine(env.name, key)}`,
        "utf8",
      );
      out(`  appended ${env.name} to ${env.file}\n`);
    }
  } else {
    await writeIfAbsent(envPath, envLine(env.name, key), { stdout: out, stderr: err });
  }
  if (!key) out(`  no key given: paste one into ${env.file} as ${env.name} (https://unmap.dev/dashboard)\n`);

  let nuxtAppDir = false;
  if (framework === "nuxt") {
    nuxtAppDir = existsSync(resolve(project, "app"));
    const configPath = ["nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs"]
      .map((file) => resolve(project, file))
      .find((path) => existsSync(path));
    const source = configPath ? await readFile(configPath, "utf8") : null;
    const updated = source ? withNuxtRuntimeConfig(source) : null;
    if (configPath && updated) {
      await writeIfAbsent(configPath, updated, { stdout: out, stderr: err }, true);
    } else {
      out("  add `unmapKey: ''` under `runtimeConfig.public` in nuxt.config so NUXT_PUBLIC_UNMAP_KEY reaches the page.\n");
    }
  }

  const page = demoPage(framework, { envName: env.name, items, theme: args.theme, accent, nuxtAppDir });
  // The template's home page is ours to replace: this directory was empty (or --force) a moment ago.
  await writeIfAbsent(resolve(project, page.path), page.content, { stdout: out, stderr: err }, true);

  const envTypes = viteEnvTypes(framework);
  if (envTypes) {
    const hasEnvTypes = ["src/vite-env.d.ts", "src/env.d.ts", "env.d.ts"].some((candidate) =>
      existsSync(resolve(project, candidate)),
    );
    if (!hasEnvTypes) {
      await writeIfAbsent(resolve(project, envTypes.path), envTypes.content, { stdout: out, stderr: err });
    }
  }

  const manager = detectPackageManager((relativePath) => existsSync(resolve(project, relativePath)));
  out(`\nDone. Next:\n  cd ${name}\n  ${devCommand(manager)}\n\nDocs: https://unmap.dev/docs/frontend/components\n`);
  return 0;
}
