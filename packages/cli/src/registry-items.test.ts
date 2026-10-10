import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXAMPLE_GUIDES, HTML_STARTERS, REACT_BLOCKS, REGISTRY_BLOCKS, REGISTRY_ITEMS } from "./index";

// `unmap add` refuses any name not in REGISTRY_ITEMS, so an item the registry ships but the list
// forgets is uninstallable through the CLI (route-line, map-layers and treaty-context all were).
const registryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/registry");
// The gallery's own data. The CLI cannot import apps/web at runtime, so it keeps small tables of
// its own and these tests hold them to the site's.
const templatesSource = readFileSync(join(registryRoot, "../templates.ts"), "utf8");
const itemNames = (file: string): string[] =>
  (JSON.parse(readFileSync(join(registryRoot, file), "utf8")) as { items: { name: string }[] }).items.map(
    (item) => item.name,
  );

describe("REGISTRY_ITEMS", () => {
  it.each(["registry.json", "registry.vue.json"])("names every item %s ships, and nothing else", (file) => {
    const supported = file === "registry.vue.json"
      ? REGISTRY_ITEMS.filter((name) => !(REACT_BLOCKS as readonly string[]).includes(name))
      : REGISTRY_ITEMS;
    expect([...supported].sort()).toEqual(itemNames(file).sort());
  });

  it.each(["registry.json", "registry.vue.json"])("names every page block %s ships in REGISTRY_BLOCKS, in order", (file) => {
    const blocks = (
      JSON.parse(readFileSync(join(registryRoot, file), "utf8")) as { items: { name: string; type: string; files: { type: string }[] }[] }
    ).items
      .filter((item) => item.type === "registry:block" && item.files.some((file) => file.type === "registry:page"))
      .map((item) => item.name);
    expect([...REGISTRY_BLOCKS]).toEqual(blocks);
    for (const block of blocks) expect(REGISTRY_ITEMS).toContain(block);
  });
});

describe("HTML_STARTERS", () => {
  it("is the site's place templates, as registry items", () => {
    const list = /export const PLACE_TEMPLATE_SLUGS = \[([^\]]*)\]/.exec(templatesSource)?.[1];
    expect(list, "PLACE_TEMPLATE_SLUGS in apps/web/lib/templates.ts").toBeDefined();
    const slugs = [...list!.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
    expect(slugs.length).toBeGreaterThan(0);
    expect([...HTML_STARTERS]).toEqual(slugs.map((slug) => `${slug}-01`));
  });
});

describe("EXAMPLE_GUIDES", () => {
  it("is each example's guide from the site's GALLERY, and every example is a React block", () => {
    const examples = Object.fromEntries(
      [...templatesSource.matchAll(/\{[^{}]*kind: "example", item: "([a-z0-9-]+)"[^{}]*guide: "([^"]+)"[^{}]*\}/g)].map((match) => [match[1], match[2]]),
    );
    expect(Object.keys(examples).length, "examples with a guide in GALLERY").toBeGreaterThan(0);
    expect(EXAMPLE_GUIDES).toEqual(examples);
    for (const item of Object.keys(EXAMPLE_GUIDES)) expect(REACT_BLOCKS).toContain(item);
  });
});
