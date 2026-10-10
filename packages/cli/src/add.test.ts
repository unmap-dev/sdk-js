import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAdd, type AddIO } from "./add";
import { parseArgs } from "./index";

const REACT_NS_URL = "https://registry.unmap.dev/r/{name}.json";
const VUE_NS_URL = "https://registry.unmap.dev/r/vue/{name}.json";

/** The `@unmap` entry `components.json` in `dir` currently names, read back off disk. */
const registryEntry = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "components.json"), "utf8")).registries?.["@unmap"];

function fakeSpawn(exitCodes: number[] = []) {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const impl = vi.fn((command: string, args: string[], options: { cwd: string }) => {
    calls.push({ command, args, cwd: options.cwd });
    const child = new EventEmitter();
    const code = exitCodes.shift() ?? 0;
    queueMicrotask(() => child.emit("close", code));
    return child;
  });
  return { impl: impl as unknown as AddIO["spawn"], calls };
}

let cwd: string;
let output: string[];
let errors: string[];
let io: AddIO;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "unmap-add-"));
  output = [];
  errors = [];
  io = { cwd, stdout: (text) => output.push(text), stderr: (text) => errors.push(text) };
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function components(registries?: Record<string, unknown>) {
  writeFileSync(join(cwd, "components.json"), JSON.stringify({ aliases: { ui: "@/components/ui" }, ...(registries ? { registries } : {}) }));
}

describe("unmap add", () => {
  it("installs a React template through the configured namespace", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components();
    const spawn = fakeSpawn();
    expect(await runAdd(parseArgs(["add", "business-locator-01", "--yes"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(spawn.calls[0]?.args).toEqual(["shadcn@latest", "add", "--yes", "@unmap/business-locator-01"]);
  });

  it("rejects React blocks on the Vue lane before changing registry configuration", async () => {
    components();
    const before = readFileSync(join(cwd, "components.json"), "utf8");
    const spawn = fakeSpawn();
    expect(await runAdd(parseArgs(["add", "local-guide-01", "--framework", "vue"]), { ...io, spawn: spawn.impl })).toBe(1);
    expect(errors.join("")).toContain("'local-guide-01' is React-only");
    // Only the three place templates have an HTML starter to offer instead.
    expect(errors.join("")).toContain("download its HTML starter");
    expect(errors.join("")).toContain("https://unmap.dev/templates/local-guide\n");
    expect(spawn.calls).toHaveLength(0);
    expect(readFileSync(join(cwd, "components.json"), "utf8")).toBe(before);
  });

  it("refuses every React example in a Vue project before changing anything", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3" } }));
    components();
    for (const item of [
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
    ]) {
      errors.length = 0;
      const spawn = fakeSpawn();
      expect(await runAdd(parseArgs(["add", item]), { ...io, spawn: spawn.impl }), item).toBe(1);
      expect(errors.join(""), item).toContain(`'${item}' is React-only`);
      expect(spawn.calls, item).toHaveLength(0);
    }
  });

  it("refuses a React example in a Vue project and points at its section of the docs for the items it is built on", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3" } }));
    components();
    const before = readFileSync(join(cwd, "components.json"), "utf8");
    const spawn = fakeSpawn();
    expect(await runAdd(parseArgs(["add", "map-measure-01"]), { ...io, spawn: spawn.impl })).toBe(1);
    const message = errors.join("");
    expect(message).toContain("'map-measure-01' is React-only");
    expect(message).toContain("In Vue, add the items it is built on: https://unmap.dev/docs/frontend/tools#measure-distances.");
    expect(message).not.toContain("https://unmap.dev/docs/frontend/components");
    expect(message).toContain("https://unmap.dev/templates/map-measure\n");
    expect(message).not.toContain("HTML");
    expect(spawn.calls).toHaveLength(0);
    expect(readFileSync(join(cwd, "components.json"), "utf8")).toBe(before);
  });
  it("sends a Vue reader of the React-only map-story-01 template, which has no docs section, to the components docs", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3" } }));
    components();
    const spawn = fakeSpawn();
    expect(await runAdd(parseArgs(["add", "map-story-01"]), { ...io, spawn: spawn.impl })).toBe(1);
    expect(errors.join("")).toBe(
      "error: 'map-story-01' is React-only. Use a React project with shadcn (Base UI). In Vue, add the items it is built on: https://unmap.dev/docs/frontend/components. Preview and setup: https://unmap.dev/templates/map-story\n",
    );
    expect(spawn.calls).toHaveLength(0);
  });

  it("writes the React namespace into components.json itself, then adds by name", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components();
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "geocoder", "--overwrite"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    // No `registry add` spawn on either lane: shadcn's own `registry add` skips a name that is
    // already configured and has no overwrite flag, so the entry is always written here instead.
    expect(spawn.calls).toEqual([
      { command: "npx", args: ["shadcn@latest", "add", "--overwrite", "@unmap/map", "@unmap/geocoder"], cwd },
    ]);
    expect(registryEntry(cwd)).toBe(REACT_NS_URL);
    expect(output.join("")).toContain("Registered the @unmap registry in components.json");
  });

  it("leaves components.json alone when @unmap already names the same URL, and passes --dry-run and --yes through", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "^16" } }));
    components({ "@unmap": REACT_NS_URL });
    const before = readFileSync(join(cwd, "components.json"), "utf8");
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "--dry-run", "--yes"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    expect(spawn.calls).toEqual([
      { command: "npx", args: ["shadcn@latest", "add", "--dry-run", "--yes", "@unmap/map"], cwd },
    ]);
    expect(readFileSync(join(cwd, "components.json"), "utf8")).toBe(before);
    expect(output.join("")).not.toContain("Registered the @unmap registry");
    // The entry already exists, so shadcn's own --dry-run can resolve @unmap fine: no hint needed.
    expect(output.join("")).not.toContain("note: shadcn's --dry-run cannot resolve @unmap");
  });

  it("on a React --dry-run with no @unmap entry yet, hints at the URL form shadcn's --dry-run can actually resolve", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components();
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "geocoder", "--dry-run"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    // Nothing was written to components.json (dry-run), so shadcn's own --dry-run would 404 on
    // @unmap. The note tells the caller how to preview anyway: run once for real, or hit the
    // registry item URLs directly, which shadcn --dry-run can resolve with no @unmap entry at all.
    expect(output.join("")).toContain(
      "note: shadcn's --dry-run cannot resolve @unmap until the entry exists; this run will fail. Run once " +
        "without --dry-run, or preview the URL form: npx shadcn@latest add --dry-run " +
        "https://registry.unmap.dev/r/map.json https://registry.unmap.dev/r/geocoder.json\n",
    );
    expect(spawn.calls).toEqual([
      { command: "npx", args: ["shadcn@latest", "add", "--dry-run", "@unmap/map", "@unmap/geocoder"], cwd },
    ]);
  });

  it("writes the Vue namespace into components.json with the lane's vue/ path", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ devDependencies: { nuxt: "^4" } }));
    components();
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "routing-panel"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    expect(spawn.calls).toEqual([
      { command: "npx", args: ["shadcn-vue@latest", "add", "@unmap/map", "@unmap/routing-panel"], cwd },
    ]);
    const written = readFileSync(join(cwd, "components.json"), "utf8");
    const parsed = JSON.parse(written);
    expect(parsed.registries["@unmap"]).toBe(VUE_NS_URL);
    expect(parsed.aliases).toEqual({ ui: "@/components/ui" });
    expect(written).toContain('\n  "registries"');
    expect(written.endsWith("\n")).toBe(true);
    expect(output.join("")).toContain("Registered the @unmap registry in components.json");
  });

  it("keeps other registries when adding @unmap to the Vue lane", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components({ "@acme": "https://acme.test/r/{name}.json" });
    const spawn = fakeSpawn();

    expect(await runAdd(parseArgs(["add", "map"]), { ...io, spawn: spawn.impl })).toBe(0);
    const parsed = JSON.parse(readFileSync(join(cwd, "components.json"), "utf8"));
    expect(parsed.registries).toEqual({ "@acme": "https://acme.test/r/{name}.json", "@unmap": VUE_NS_URL });
  });

  it("stops with a hand-edit pointer when components.json cannot be parsed (either lane)", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    writeFileSync(join(cwd, "components.json"), "{ not json");
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(1);
    expect(spawn.calls).toEqual([]);
    expect(errors.at(-1)).toBe(
      `error: components.json could not be parsed; add "registries": {"@unmap": "${VUE_NS_URL}"} by hand.\n`,
    );
  });

  it("rebases the namespace onto --registry", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components();
    const spawn = fakeSpawn();

    await runAdd(parseArgs(["add", "map", "--registry", "http://localhost:8788/"]), { ...io, spawn: spawn.impl });

    const parsed = JSON.parse(readFileSync(join(cwd, "components.json"), "utf8"));
    expect(parsed.registries["@unmap"]).toBe("http://localhost:8788/r/vue/{name}.json");
    expect(spawn.calls[0]?.args).toEqual(["shadcn-vue@latest", "add", "@unmap/map"]);
  });

  it("writes nothing and spawns nothing for a Vue --dry-run: shadcn-vue rejects the flag", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components();
    const before = readFileSync(join(cwd, "components.json"), "utf8");
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "geocoder", "--dry-run"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    expect(readFileSync(join(cwd, "components.json"), "utf8")).toBe(before);
    expect(output.join("")).toMatch(/Would register @unmap in components\.json as/);
    // shadcn-vue 2.8.2 exits 1 on --dry-run ("The --dry-run, --diff and --view options are not
    // yet supported in shadcn-vue."), so the add is printed instead of run — and the printed
    // command carries no --dry-run, because that is the command that would actually work.
    expect(spawn.calls).toEqual([]);
    expect(output.join("")).toContain(
      "shadcn-vue 2.8 has no --dry-run; would run: npx shadcn-vue@latest add @unmap/map @unmap/geocoder\n",
    );
  });

  it("rewrites an existing but different @unmap URL when --registry is passed explicitly (Vue)", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components({ "@unmap": "https://registry.unmap.dev/r/vue/{name}.json" });
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "--registry", "http://localhost:8788"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    const parsed = JSON.parse(readFileSync(join(cwd, "components.json"), "utf8"));
    expect(parsed.registries["@unmap"]).toBe("http://localhost:8788/r/vue/{name}.json");
  });

  it("leaves an existing but different @unmap URL alone without an explicit --registry (Vue)", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components({ "@unmap": "http://localhost:9999/r/vue/{name}.json" });
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    const parsed = JSON.parse(readFileSync(join(cwd, "components.json"), "utf8"));
    expect(parsed.registries["@unmap"]).toBe("http://localhost:9999/r/vue/{name}.json");
  });

  it("treats an object-form @unmap entry with headers as configured, and leaves it byte-for-byte alone (Vue)", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components({ "@unmap": { url: VUE_NS_URL, headers: { "x-token": "1" } } });
    const before = readFileSync(join(cwd, "components.json"), "utf8");
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    expect(spawn.calls).toEqual([{ command: "npx", args: ["shadcn-vue@latest", "add", "@unmap/map"], cwd }]);
    // configured (the object entry's url) equals wanted, so ensureNamespace's no-op path
    // returns before touching the file at all — the object entry and its headers survive.
    expect(readFileSync(join(cwd, "components.json"), "utf8")).toBe(before);
  });

  it("replaces an object-form @unmap entry outright (headers included) when --registry is passed explicitly (Vue)", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components({ "@unmap": { url: VUE_NS_URL, headers: { "x-token": "1" } } });
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "--registry", "http://localhost:8788"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    const parsed = JSON.parse(readFileSync(join(cwd, "components.json"), "utf8"));
    // An explicit --registry rebases the namespace and writes a plain string entry: it replaces
    // the whole configured value, headers included, rather than patching just the url field.
    expect(parsed.registries["@unmap"]).toBe("http://localhost:8788/r/vue/{name}.json");
  });

  it("rewrites an existing but different @unmap URL when --registry is passed explicitly (React)", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components({ "@unmap": REACT_NS_URL });
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "--registry", "http://localhost:8788"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    // `shadcn registry add` would have printed "Skipped 1 registry: (already configured)" and
    // exited 0 without touching the file here, which is why the entry is written, not delegated.
    expect(registryEntry(cwd)).toBe("http://localhost:8788/r/{name}.json");
    expect(spawn.calls).toEqual([{ command: "npx", args: ["shadcn@latest", "add", "@unmap/map"], cwd }]);
  });

  it("on a React --dry-run with --registry replacing an existing @unmap entry, phrases the note as 'updated' not 'exists'", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components({ "@unmap": REACT_NS_URL });
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "--registry", "http://localhost:8788", "--dry-run"]), {
      ...io,
      spawn: spawn.impl,
    });

    expect(code).toBe(0);
    // components.json is untouched (dry-run), but an entry was already there and --registry means
    // it is about to be replaced, not created from nothing, so the note should say "updated".
    expect(output.join("")).toContain(
      "note: shadcn's --dry-run cannot resolve @unmap until the entry is updated; this run will fail. Run once " +
        "without --dry-run, or preview the URL form: npx shadcn@latest add --dry-run " +
        "http://localhost:8788/r/map.json\n",
    );
    expect(output.join("")).not.toContain("until the entry exists");
  });

  it("treats an empty --registry as not given: no force, and the default registry", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components({ "@unmap": "http://localhost:9999/r/{name}.json" });
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map", "--registry="]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    expect(registryEntry(cwd)).toBe("http://localhost:9999/r/{name}.json");
  });

  it("stops with a pointer when there is no components.json", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "map"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(1);
    expect(spawn.calls).toEqual([]);
    expect(errors.join("")).toMatch(/components\.json/);
    expect(errors.join("")).toMatch(/unmap create|shadcn-vue init/);
    expect(errors.join("")).toMatch(/@unmap\/vue/);
  });

  it("fails clearly without items, without a detectable framework, and on an unknown item", async () => {
    expect(await runAdd(parseArgs(["add"]), io)).toBe(1);
    expect(errors.at(-1)).toMatch(/at least one item/);

    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { hono: "^4" } }));
    components();
    expect(await runAdd(parseArgs(["add", "map"]), io)).toBe(1);
    expect(errors.at(-1)).toMatch(/--framework/);

    expect(await runAdd(parseArgs(["add", "map", "--framework", "svelte"]), io)).toBe(1);
    expect(errors.at(-1)).toMatch(/unknown framework/);

    expect(await runAdd(parseArgs(["add", "globe", "--framework", "react"]), io)).toBe(1);
    expect(errors.at(-1)).toMatch(/unknown item 'globe'/);
  });

  it("names the llms.txt catalog when no item or an unknown one is given, on the registry in use", async () => {
    expect(await runAdd(parseArgs(["add"]), io)).toBe(1);
    expect(errors.at(-1)).toContain("What each one is: https://registry.unmap.dev/llms.txt\n");

    expect(await runAdd(parseArgs(["add", "globe", "--registry", "http://localhost:8787/"]), io)).toBe(1);
    expect(errors.at(-1)).toContain("What each one is: http://localhost:8787/llms.txt\n");
  });

  it("points at each added item's Markdown page for the detected lane", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components({ "@unmap": VUE_NS_URL });
    const spawn = fakeSpawn();

    expect(await runAdd(parseArgs(["add", "map", "geocoder"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(output.join("")).toContain(
      "Docs for each item, for you or a coding agent:\n" +
        "  map: https://registry.unmap.dev/llm/vue/map.md\n" +
        "  geocoder: https://registry.unmap.dev/llm/vue/geocoder.md\n",
    );
  });

  it("points a React template or example at its page on the registry in use and at its gallery page", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components({ "@unmap": REACT_NS_URL });
    const spawn = fakeSpawn();

    const args = parseArgs(["add", "map", "map-measure-01", "--registry", "http://localhost:8787/"]);
    expect(await runAdd(args, { ...io, spawn: spawn.impl })).toBe(0);
    expect(output.join("")).toContain(
      "Docs for each item, for you or a coding agent:\n" +
        "  map: http://localhost:8787/llm/map.md\n" +
        "  map-measure-01: http://localhost:8787/llm/map-measure-01.md\n" +
        "    Preview and setup: https://unmap.dev/templates/map-measure\n",
    );
  });

  it("points at a page block's page and its gallery page after its notes", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components({ "@unmap": REACT_NS_URL });
    const spawn = fakeSpawn();

    expect(await runAdd(parseArgs(["add", "store-locator"]), { ...io, spawn: spawn.impl })).toBe(0);
    const text = output.join("");
    expect(text).toMatch(
      /note: [\s\S]*Docs for each item, for you or a coding agent:\n {2}store-locator: https:\/\/registry\.unmap\.dev\/llm\/store-locator\.md\n {4}Preview and setup: https:\/\/unmap\.dev\/templates\/store-locator\n$/,
    );
  });

  it("points a page block at its gallery page on the Vue lane too", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { vue: "^3.5" } }));
    components({ "@unmap": VUE_NS_URL });
    const spawn = fakeSpawn();

    expect(await runAdd(parseArgs(["add", "map", "directions"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(output.join("")).toContain(
      "  map: https://registry.unmap.dev/llm/vue/map.md\n" +
        "  directions: https://registry.unmap.dev/llm/vue/directions.md\n" +
        "    Preview and setup: https://unmap.dev/templates/directions\n",
    );
  });

  it("prints no pages when the shadcn CLI fails or on a dry run", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components({ "@unmap": REACT_NS_URL });

    expect(await runAdd(parseArgs(["add", "map"]), { ...io, spawn: fakeSpawn([1]).impl })).toBe(1);
    expect(await runAdd(parseArgs(["add", "map", "--dry-run"]), { ...io, spawn: fakeSpawn().impl })).toBe(0);
    expect(output.join("")).not.toContain("/llm/");
  });

  it("returns the shadcn CLI's exit code when the add fails", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19" } }));
    components();
    const spawn = fakeSpawn([2]);

    const code = await runAdd(parseArgs(["add", "map"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(2);
    expect(spawn.calls).toEqual([{ command: "npx", args: ["shadcn@latest", "add", "@unmap/map"], cwd }]);
  });

  /** A spawn that writes the files the shadcn CLI would, then exits 0. */
  function spawnWriting(files: Record<string, string>, exitCode = 0) {
    const calls: Array<{ command: string; args: string[] }> = [];
    const impl = vi.fn((command: string, args: string[], options: { cwd: string }) => {
      calls.push({ command, args });
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(options.cwd, path)), { recursive: true });
        writeFileSync(join(options.cwd, path), content);
      }
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", exitCode));
      return child;
    });
    return { impl: impl as unknown as AddIO["spawn"], calls };
  }

  it("tells a Vite React project where the block's component went, since shadcn skips the page there", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { react: "^19", vite: "^7" } }));
    writeFileSync(join(cwd, "vite.config.ts"), "export default {};\n");
    components();
    const spawn = fakeSpawn();

    const code = await runAdd(parseArgs(["add", "store-locator"]), { ...io, spawn: spawn.impl });

    expect(code).toBe(0);
    expect(spawn.calls[0]!.args).toEqual(["shadcn@latest", "add", "@unmap/store-locator"]);
    expect(output.join("")).toContain(
      "note: if your framework has no page folder shadcn recognises, store-locator's page was not installed. Render <StoreLocator apiKey={yourKey} /> from @/components/ui/store-locator yourself.",
    );
  });

  it("points a Next project at the block's route and key", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "^16", react: "^19" } }));
    writeFileSync(join(cwd, "next.config.ts"), "export default {};\n");
    components();
    const spawn = spawnWriting({
      "src/app/directions/page.tsx": "export default function Page() {}\n",
      ".env": "NEXT_PUBLIC_UNMAP_KEY=\n",
    });

    expect(await runAdd(parseArgs(["add", "map", "directions"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(output.join("")).toContain(
      "directions: open http://localhost:3000/directions once the dev server runs (page: src/app/directions/page.tsx).",
    );
    expect(output.join("")).toContain("Paste your key into .env as NEXT_PUBLIC_UNMAP_KEY");
    expect(existsSync(join(cwd, ".env.local"))).toBe(false);
  });

  it("prepares Nuxt runtime config and .env before handing a block to shadcn-vue, and leaves a set key alone", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^4.1.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({\n  devtools: { enabled: true },\n});\n");
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/app.vue"), "<template>\n  <NuxtPage />\n</template>\n");
    writeFileSync(join(cwd, ".env"), "OTHER=1");
    components();
    const spawn = spawnWriting({ "app/pages/flow-map.vue": "<template><div /></template>\n" });

    expect(await runAdd(parseArgs(["add", "flow-map"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(spawn.calls[0]!.args).toEqual(["shadcn-vue@latest", "add", "@unmap/flow-map"]);
    expect(readFileSync(join(cwd, "nuxt.config.ts"), "utf8")).toContain("runtimeConfig: { public: { unmapKey: '' } },");
    expect(readFileSync(join(cwd, ".env"), "utf8")).toMatch(/^OTHER=1\n# Paste your unmap key[^\n]*\nNUXT_PUBLIC_UNMAP_KEY=\n$/);
    expect(existsSync(join(cwd, ".env.local"))).toBe(false);
    expect(existsSync(join(cwd, "app/pages/flow-map.vue"))).toBe(true);
    expect(output.join("")).toContain(
      "flow-map: open http://localhost:3000/flow-map once the dev server runs (page: app/pages/flow-map.vue).",
    );
    expect(output.join("")).not.toContain("<NuxtPage />, so");

    // Again, with the key filled in and runtime config declared: nothing is rewritten.
    writeFileSync(join(cwd, ".env"), "NUXT_PUBLIC_UNMAP_KEY=um_test_existing\n");
    const config = readFileSync(join(cwd, "nuxt.config.ts"), "utf8");
    expect(await runAdd(parseArgs(["add", "flow-map"]), { ...io, spawn: spawnWriting({}).impl })).toBe(0);
    expect(readFileSync(join(cwd, ".env"), "utf8")).toBe("NUXT_PUBLIC_UNMAP_KEY=um_test_existing\n");
    expect(readFileSync(join(cwd, "nuxt.config.ts"), "utf8")).toBe(config);
  });

  it("moves the page into a Nuxt 3 pages directory and removes the app/pages it emptied", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^3.17.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({})\n");
    components();
    const spawn = spawnWriting({ "app/pages/delivery-tracker.vue": "<template><div /></template>\n" });

    expect(await runAdd(parseArgs(["add", "delivery-tracker"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(readFileSync(join(cwd, "pages/delivery-tracker.vue"), "utf8")).toBe("<template><div /></template>\n");
    expect(existsSync(join(cwd, "app"))).toBe(false);
    expect(output.join("")).toContain("moved app/pages/delivery-tracker.vue to pages/delivery-tracker.vue (Nuxt 3 layout)");
  });

  it("names a missing NuxtPage, and on a collision keeps the Nuxt 3 page and removes the fresh copy", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^3.17.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({})\n");
    writeFileSync(join(cwd, "app.vue"), "<template>\n  <NuxtWelcome />\n</template>\n");
    mkdirSync(join(cwd, "pages"));
    writeFileSync(join(cwd, "pages/store-locator.vue"), "mine\n");
    components();
    const spawn = spawnWriting({ "app/pages/store-locator.vue": "theirs\n" });

    expect(await runAdd(parseArgs(["add", "store-locator"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(readFileSync(join(cwd, "pages/store-locator.vue"), "utf8")).toBe("mine\n");
    // A leftover app/ would read as the Nuxt 4 layout next time, so the fresh copy goes.
    expect(existsSync(join(cwd, "app"))).toBe(false);
    expect(errors.join("")).toContain(
      "kept pages/store-locator.vue and removed the new app/pages/store-locator.vue; pass --overwrite to replace it",
    );
    expect(output.join("")).toContain("note: app.vue has no <NuxtPage />");
  });

  it("replaces the Nuxt 3 page on --overwrite", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^3.17.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({})\n");
    writeFileSync(join(cwd, "app.vue"), "<template>\n  <nuxt-page />\n</template>\n");
    mkdirSync(join(cwd, "pages"));
    writeFileSync(join(cwd, "pages/store-locator.vue"), "old\n");
    components();
    const spawn = spawnWriting({ "app/pages/store-locator.vue": "new\n" });

    expect(await runAdd(parseArgs(["add", "store-locator", "--overwrite"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(spawn.calls[0]!.args).toEqual(["shadcn-vue@latest", "add", "--overwrite", "@unmap/store-locator"]);
    expect(readFileSync(join(cwd, "pages/store-locator.vue"), "utf8")).toBe("new\n");
    expect(existsSync(join(cwd, "app"))).toBe(false);
    expect(output.join("")).toContain("replaced pages/store-locator.vue with app/pages/store-locator.vue (Nuxt 3 layout)");
    expect(output.join("")).not.toContain("<NuxtPage />, so");
  });

  it("still moves the page and prunes app/ when shadcn-vue fails after writing it", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^3.17.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({})\n");
    components();
    const spawn = spawnWriting({ "app/pages/directions.vue": "page\n" }, 1);

    expect(await runAdd(parseArgs(["add", "directions"]), { ...io, spawn: spawn.impl })).toBe(1);
    expect(readFileSync(join(cwd, "pages/directions.vue"), "utf8")).toBe("page\n");
    expect(existsSync(join(cwd, "app"))).toBe(false);
  });

  it("leaves an app/pages file it did not write", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^3.17.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({})\n");
    mkdirSync(join(cwd, "app/pages"), { recursive: true });
    writeFileSync(join(cwd, "app/pages/directions.vue"), "someone else's\n");
    components();
    const spawn = spawnWriting({});

    expect(await runAdd(parseArgs(["add", "directions"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(readFileSync(join(cwd, "app/pages/directions.vue"), "utf8")).toBe("someone else's\n");
    expect(existsSync(join(cwd, "pages/directions.vue"))).toBe(false);
  });

  it("reads Nuxt 3 from the installed package and leaves app/router.options.ts where it is", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ devDependencies: { nuxt: "latest" } }));
    mkdirSync(join(cwd, "node_modules/nuxt"), { recursive: true });
    writeFileSync(join(cwd, "node_modules/nuxt/package.json"), JSON.stringify({ name: "nuxt", version: "3.19.1" }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({})\n");
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/router.options.ts"), "export default {}\n");
    components();
    const spawn = spawnWriting({ "app/pages/flow-map.vue": "page\n" });

    expect(await runAdd(parseArgs(["add", "flow-map"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(readFileSync(join(cwd, "pages/flow-map.vue"), "utf8")).toBe("page\n");
    expect(readFileSync(join(cwd, "app/router.options.ts"), "utf8")).toBe("export default {}\n");
    expect(existsSync(join(cwd, "app/pages"))).toBe(false);
  });

  it("does not place a page when nuxt.config sets srcDir, but still wires the key", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^4.1.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({\n  srcDir: 'src/',\n})\n");
    components();
    const spawn = spawnWriting({ "app/pages/flow-map.vue": "page\n" });

    expect(await runAdd(parseArgs(["add", "flow-map"]), { ...io, spawn: spawn.impl })).toBe(0);
    expect(readFileSync(join(cwd, "app/pages/flow-map.vue"), "utf8")).toBe("page\n");
    expect(readFileSync(join(cwd, ".env"), "utf8")).toContain("NUXT_PUBLIC_UNMAP_KEY=\n");
    expect(readFileSync(join(cwd, "nuxt.config.ts"), "utf8")).toContain("unmapKey: ''");
    expect(output.join("")).toContain("note: nuxt.config sets srcDir, so unmap cannot tell where flow-map's page belongs.");
  });

  it("recognises a key dotenv would read, in .env or .env.local, and names that file", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^4.1.0" } }));
    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({\n  runtimeConfig: { public: { unmapKey: '' } },\n})\n");
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/app.vue"), "<template><NuxtPage /></template>\n");
    components();

    for (const line of ["export NUXT_PUBLIC_UNMAP_KEY=um_test_x\n", "  NUXT_PUBLIC_UNMAP_KEY = um_test_x\n"]) {
      writeFileSync(join(cwd, ".env"), line);
      expect(await runAdd(parseArgs(["add", "directions"]), { ...io, spawn: spawnWriting({}).impl })).toBe(0);
      expect(readFileSync(join(cwd, ".env"), "utf8")).toBe(line);
    }

    rmSync(join(cwd, ".env"));
    writeFileSync(join(cwd, ".env.local"), "NUXT_PUBLIC_UNMAP_KEY=um_test_x\n");
    output.length = 0;
    expect(await runAdd(parseArgs(["add", "directions"]), { ...io, spawn: spawnWriting({}).impl })).toBe(0);
    expect(existsSync(join(cwd, ".env"))).toBe(false);
    expect(output.join("")).toContain("Paste your key into .env.local as NUXT_PUBLIC_UNMAP_KEY");
  });

  it("adds unmapKey to an existing runtimeConfig, and names the manual step twice when it cannot", async () => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "^4.1.0" } }));
    writeFileSync(
      join(cwd, "nuxt.config.ts"),
      "export default defineNuxtConfig({\n  runtimeConfig: {\n    public: {\n      apiBase: '/api',\n    },\n  },\n})\n",
    );
    mkdirSync(join(cwd, "app"));
    writeFileSync(join(cwd, "app/app.vue"), "<template><NuxtPage /></template>\n");
    components();

    expect(await runAdd(parseArgs(["add", "directions"]), { ...io, spawn: spawnWriting({}).impl })).toBe(0);
    expect(readFileSync(join(cwd, "nuxt.config.ts"), "utf8")).toBe(
      "export default defineNuxtConfig({\n  runtimeConfig: {\n    public: {\n      unmapKey: '',\n      apiBase: '/api',\n    },\n  },\n})\n",
    );
    expect(output.join("")).toContain("declared runtimeConfig.public.unmapKey in nuxt.config.ts");

    writeFileSync(join(cwd, "nuxt.config.ts"), "export default defineNuxtConfig({ runtimeConfig: { public: shared } })\n");
    output.length = 0;
    expect(await runAdd(parseArgs(["add", "directions"]), { ...io, spawn: spawnWriting({}).impl })).toBe(0);
    const manual = "add `unmapKey: ''` under `runtimeConfig.public` in nuxt.config";
    expect(output.join("").split(manual)).toHaveLength(3);
  });
});
