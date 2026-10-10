import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddIO } from "./add";
import { runCreate } from "./create";
import { parseArgs } from "./index";

const STYLE_URL = /\/styles\/base\.json\?/;

/**
 * A spawn that also performs the side effect `shadcn init` would: creating the project directory
 * with the files a template leaves behind, so later steps have something to read and overwrite.
 */
function fakeSpawn(cwd: string, exitCodes: number[] = [], scaffold: (dir: string) => void = () => {}) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const impl = vi.fn((command: string, args: string[], options: { cwd: string }) => {
    calls.push({ command, args, cwd: options.cwd });
    if (args[1] === "init") {
      const dir = join(cwd, args[args.indexOf("--name") + 1]!);
      mkdirSync(dir, { recursive: true });
      scaffold(dir);
    }
    const child = new EventEmitter();
    const code = exitCodes.shift() ?? 0;
    queueMicrotask(() => child.emit("close", code));
    return child;
  });
  return { impl: impl as unknown as AddIO["spawn"], calls };
}

function fakeFetch(status = 200, body: unknown = { metadata: {} }) {
  const calls: string[] = [];
  const impl = vi.fn(async (input: string | URL | Request) => {
    calls.push(String(input));
    return { ok: status === 200, status, json: async () => body } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

let cwd: string;
let output: string[];
let errors: string[];
let io: AddIO;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "unmap-create-"));
  output = [];
  errors = [];
  io = { cwd, stdout: (text) => output.push(text), stderr: (text) => errors.push(text) };
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("unmap create", () => {
  it("rejects React blocks in a Vue scaffold before running initialization", async () => {
    const spawn = fakeSpawn(cwd);
    const code = await runCreate(parseArgs(["create", "app", "--framework", "nuxt", "--only", "public-notices-01"]), { ...io, spawn: spawn.impl });
    expect(code).toBe(1);
    expect(errors.join("")).toContain("'public-notices-01' is React-only. Choose --framework next or --framework vite");
    expect(errors.join("")).toContain("https://unmap.dev/templates/public-notices\n");
    expect(spawn.calls).toHaveLength(0);
  });
  it("scaffolds a Next.js project: init, namespace, items, key, demo page, next steps", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => {
      mkdirSync(join(dir, "app"));
      writeFileSync(join(dir, "app/page.tsx"), "export default function Page() { return null }\n");
      writeFileSync(join(dir, "components.json"), JSON.stringify({ aliases: {} }));
      writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    });
    const fetch = fakeFetch(200);

    const code = await runCreate(parseArgs(["create", "my-app", "--key", "um_live_abc"]), { ...io, spawn: spawn.impl, fetch: fetch.impl });

    expect(code).toBe(0);
    const project = join(cwd, "my-app");
    // No `registry add` spawn on either lane: the entry is written into components.json directly.
    expect(spawn.calls).toEqual([
      { command: "npx", args: ["shadcn@latest", "init", "--template", "next", "--name", "my-app", "--no-monorepo", "--base", "base", "--preset", "nova", "--yes"], cwd },
      { command: "npx", args: ["shadcn@latest", "add", "--yes", "@unmap/map", "@unmap/geocoder", "@unmap/routing-panel", "@unmap/marker-popup"], cwd: project },
    ]);
    expect(JSON.parse(readFileSync(join(project, "components.json"), "utf8")).registries).toEqual({
      "@unmap": "https://registry.unmap.dev/r/{name}.json",
    });
    expect(fetch.calls[0]).toMatch(STYLE_URL);
    expect(readFileSync(join(project, ".env.local"), "utf8")).toBe("NEXT_PUBLIC_UNMAP_KEY=um_live_abc\n");
    const page = readFileSync(join(project, "app/page.tsx"), "utf8");
    expect(page).toContain("process.env.NEXT_PUBLIC_UNMAP_KEY");
    expect(page).toContain("<Geocoder");
    expect(page).not.toContain("um_live_abc");
    expect(output.join("")).toContain("cd my-app");
    expect(output.join("")).toContain("pnpm dev");
  });

  it("writes a placeholder env line and a reminder when no key is given, and honours --only", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "components.json"), "{}");
    });

    const code = await runCreate(parseArgs(["create", "app", "--framework", "vite", "--only", "marker-popup"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl });

    expect(code).toBe(0);
    expect(spawn.calls[1]?.args).toEqual(["shadcn@latest", "add", "--yes", "@unmap/map", "@unmap/marker-popup"]);
    expect(readFileSync(join(cwd, "app/.env.local"), "utf8")).toBe("# Paste your unmap key from https://unmap.dev/dashboard\nVITE_UNMAP_KEY=\n");
    const page = readFileSync(join(cwd, "app/src/App.tsx"), "utf8");
    expect(page).toContain("<Marker");
    expect(page).not.toContain("Geocoder");
    expect(output.join("")).toMatch(/VITE_UNMAP_KEY/);
  });

  it("scaffolds Nuxt through shadcn-vue, declares the runtime config key, and writes app/app.vue", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => {
      mkdirSync(join(dir, "app"));
      writeFileSync(join(dir, "app/app.vue"), "<template><NuxtWelcome /></template>\n");
      writeFileSync(join(dir, "nuxt.config.ts"), "export default defineNuxtConfig({\n  devtools: { enabled: true },\n})\n");
      writeFileSync(join(dir, "components.json"), "{}");
    });

    const code = await runCreate(parseArgs(["create", "site", "--framework", "nuxt", "--key", "um_test_x"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl });

    expect(code).toBe(0);
    expect(spawn.calls).toHaveLength(2);
    expect(spawn.calls[0]?.args).toEqual([
      "shadcn-vue@latest", "init", "--template", "nuxt", "--name", "site",
      "--base", "reka", "--icon-library", "lucide", "--preset", "nova", "--yes",
    ]);
    // No `registry add` spawn: shadcn-vue has no such command, and shadcn's skips an entry that
    // already exists, so both lanes write the entry into components.json directly.
    expect(JSON.parse(readFileSync(join(cwd, "site/components.json"), "utf8")).registries).toEqual({
      "@unmap": "https://registry.unmap.dev/r/vue/{name}.json",
    });
    expect(spawn.calls[1]?.args).toEqual([
      "shadcn-vue@latest", "add", "--yes", "@unmap/map", "@unmap/geocoder", "@unmap/routing-panel", "@unmap/marker-popup",
    ]);
    expect(readFileSync(join(cwd, "site/.env"), "utf8")).toBe("NUXT_PUBLIC_UNMAP_KEY=um_test_x\n");
    expect(readFileSync(join(cwd, "site/nuxt.config.ts"), "utf8")).toContain("runtimeConfig: { public: { unmapKey: '' } }");
    expect(readFileSync(join(cwd, "site/app/app.vue"), "utf8")).toContain("useRuntimeConfig().public.unmapKey");
  });

  it("asks the accent question when --theme is given, showing the theme's marker colour, and writes the answer", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "components.json"), "{}");
    });
    const fetch = fakeFetch(200, { metadata: { "unmap:theme": { marker: { color: "#d6136f" } } } });
    const ask = vi.fn(async () => "system");

    const code = await runCreate(parseArgs(["create", "app", "--framework", "vue", "--key", "um_live_k", "--theme", "u4e"]), { ...io, spawn: spawn.impl, fetch: fetch.impl, ask });

    expect(code).toBe(0);
    expect(ask).toHaveBeenCalledWith("Markers and routes: this theme's accent (#d6136f) or your design system's primary? [theme/system] (theme) ");
    expect(fetch.calls.some((url) => /theme=u4e/.test(url))).toBe(true);
    // The theme-accent lookup URL carries both key and theme, and theme is appended by
    // verifyUrl's own querystring builder, not by string-concatenating a second `&theme=`.
    expect(fetch.calls.some((url) => /\?key=[^&]+&theme=u4e$/.test(url))).toBe(true);
    const page = readFileSync(join(cwd, "app/src/App.vue"), "utf8");
    expect(page).toContain('theme="u4e"');
    expect(page).toContain('accent="system"');
  });

  it("takes --accent without asking, defaults to theme when non-interactive, and rejects a bad answer", async () => {
    const scaffold = (dir: string) => {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "components.json"), "{}");
    };
    const ask = vi.fn(async () => "system");

    await runCreate(parseArgs(["create", "a", "--framework", "vite", "--theme", "u4e", "--accent", "theme"]), { ...io, spawn: fakeSpawn(cwd, [], scaffold).impl, fetch: fakeFetch().impl, ask });
    expect(ask).not.toHaveBeenCalled();
    expect(readFileSync(join(cwd, "a/src/App.tsx"), "utf8")).toContain('accent="theme"');

    await runCreate(parseArgs(["create", "b", "--framework", "vite", "--theme", "u4e"]), { ...io, spawn: fakeSpawn(cwd, [], scaffold).impl, fetch: fakeFetch().impl });
    expect(readFileSync(join(cwd, "b/src/App.tsx"), "utf8")).toContain('accent="theme"');

    const code = await runCreate(parseArgs(["create", "c", "--framework", "vite", "--theme", "u4e", "--accent", "blue"]), { ...io, spawn: fakeSpawn(cwd, [], scaffold).impl, fetch: fakeFetch().impl });
    expect(code).toBe(1);
    expect(errors.at(-1)).toMatch(/--accent/);
  });

  it("rejects --accent without --theme before doing anything else", async () => {
    const spawn = fakeSpawn(cwd);

    const code = await runCreate(parseArgs(["create", "x", "--accent", "system"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl });

    expect(code).toBe(1);
    expect(errors.at(-1)).toMatch(/--accent .* --theme/);
    expect(spawn.calls).toEqual([]);
  });

  it("refuses a non-empty directory unless --force, and a bad framework, name, or rejected key", async () => {
    mkdirSync(join(cwd, "taken"));
    writeFileSync(join(cwd, "taken/README.md"), "x");
    expect(await runCreate(parseArgs(["create", "taken"]), { ...io, spawn: fakeSpawn(cwd).impl, fetch: fakeFetch().impl })).toBe(1);
    expect(errors.at(-1)).toMatch(/not empty/);

    writeFileSync(join(cwd, "a-file"), "not a directory");
    expect(await runCreate(parseArgs(["create", "a-file"]), { ...io, spawn: fakeSpawn(cwd).impl, fetch: fakeFetch().impl })).toBe(1);
    expect(errors.at(-1)).toMatch(/is a file/);

    expect(await runCreate(parseArgs(["create"]), io)).toBe(1);
    expect(errors.at(-1)).toMatch(/name/);

    expect(await runCreate(parseArgs(["create", "x", "--framework", "svelte"]), io)).toBe(1);
    expect(errors.at(-1)).toMatch(/unknown framework/);

    const spawn = fakeSpawn(cwd);
    expect(await runCreate(parseArgs(["create", "y", "--key", "bad"]), { ...io, spawn: spawn.impl, fetch: fakeFetch(401).impl })).toBe(1);
    expect(errors.at(-1)).toMatch(/rejected/);
    expect(spawn.calls).toEqual([]);
  });

  it("--force into a directory with an existing env file appends the key if missing, and leaves it alone if already set", async () => {
    const scaffold = (dir: string) => {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "components.json"), "{}");
    };

    mkdirSync(join(cwd, "existing"));
    writeFileSync(join(cwd, "existing/.env.local"), "SOME_OTHER_VAR=keep-me\n");
    const code = await runCreate(
      parseArgs(["create", "existing", "--framework", "vite", "--key", "um_live_new", "--force"]),
      { ...io, spawn: fakeSpawn(cwd, [], scaffold).impl, fetch: fakeFetch().impl },
    );
    expect(code).toBe(0);
    expect(readFileSync(join(cwd, "existing/.env.local"), "utf8")).toBe(
      "SOME_OTHER_VAR=keep-me\nVITE_UNMAP_KEY=um_live_new\n",
    );
    expect(output.join("")).toContain("appended VITE_UNMAP_KEY to .env.local");

    output = [];
    mkdirSync(join(cwd, "already-set"));
    writeFileSync(join(cwd, "already-set/.env.local"), "VITE_UNMAP_KEY=um_live_original\n");
    const code2 = await runCreate(
      parseArgs(["create", "already-set", "--framework", "vite", "--key", "um_live_new", "--force"]),
      { ...io, spawn: fakeSpawn(cwd, [], scaffold).impl, fetch: fakeFetch().impl },
    );
    expect(code2).toBe(0);
    expect(readFileSync(join(cwd, "already-set/.env.local"), "utf8")).toBe("VITE_UNMAP_KEY=um_live_original\n");
    expect(output.join("")).toContain("left .env.local alone: VITE_UNMAP_KEY is already set");
  });

  it("stops at the first failing step and returns its exit code", async () => {
    const spawn = fakeSpawn(cwd, [0, 3], (dir) => writeFileSync(join(dir, "components.json"), "{}"));

    const code = await runCreate(parseArgs(["create", "z", "--framework", "next"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl });

    expect(code).toBe(3);
    expect(spawn.calls).toHaveLength(2);
    expect(existsSync(join(cwd, "z/.env.local"))).toBe(false);
  });

  it("writes src/vite-env.d.ts on a Vue scaffold that lacks one", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "components.json"), "{}");
    });

    const code = await runCreate(parseArgs(["create", "app", "--framework", "vue"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl });

    expect(code).toBe(0);
    expect(readFileSync(join(cwd, "app/src/vite-env.d.ts"), "utf8")).toBe('/// <reference types="vite/client" />\n');
  });

  it("leaves an existing src/vite-env.d.ts from the template untouched, byte-for-byte", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src/vite-env.d.ts"), '/// <reference types="vite/client" />\n// custom note\n');
      writeFileSync(join(dir, "components.json"), "{}");
    });

    const code = await runCreate(parseArgs(["create", "app", "--framework", "vite"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl });

    expect(code).toBe(0);
    expect(readFileSync(join(cwd, "app/src/vite-env.d.ts"), "utf8")).toBe(
      '/// <reference types="vite/client" />\n// custom note\n',
    );
  });

  it("writes no vite-env.d.ts for a Next.js scaffold", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => {
      mkdirSync(join(dir, "app"));
      writeFileSync(join(dir, "app/page.tsx"), "export default function Page() { return null }\n");
      writeFileSync(join(dir, "components.json"), JSON.stringify({ aliases: {} }));
    });

    const code = await runCreate(parseArgs(["create", "app", "--framework", "next"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl });

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "app/src/vite-env.d.ts"))).toBe(false);
    expect(existsSync(join(cwd, "app/vite-env.d.ts"))).toBe(false);
  });

  it("asks for the framework when interactive and none is given", async () => {
    const spawn = fakeSpawn(cwd, [], (dir) => writeFileSync(join(dir, "components.json"), "{}"));
    const ask = vi.fn(async () => "nuxt");

    await runCreate(parseArgs(["create", "q"]), { ...io, spawn: spawn.impl, fetch: fakeFetch().impl, ask });

    expect(ask).toHaveBeenCalledWith("Framework? [next/vite/nuxt/vue] (next) ");
    expect(spawn.calls[0]?.args[0]).toBe("shadcn-vue@latest");
  });
});
