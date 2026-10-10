import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The README ships inside the npm tarball, so nothing substitutes the version at build time: the
// CDN URLs in it are literal text that goes stale the moment @unmap/sdk is released again. This
// catches that at release time rather than after a customer copies a dead URL.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = "packages/sdk/README.md";
const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
const version: string = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const minor = version.split(".").slice(0, 2).join(".");

const fix = `Edit ${README}: every cdn.unmap.dev/sdk/… URL must name ${version}, and the mutable channel must be /sdk/${minor}/. Search the file for "cdn.unmap.dev" and replace the old version in each URL.`;

describe("the CDN URLs in the README", () => {
  it("name the version this package publishes", () => {
    const pinned = [...readme.matchAll(/cdn\.unmap\.dev\/sdk\/(\d+\.\d+\.\d+)\//g)].map((m) => m[1]);
    expect(pinned.length, `no pinned cdn.unmap.dev URL found in ${README}`).toBeGreaterThan(0);
    for (const found of pinned) {
      expect(found, fix).toBe(version);
    }
  });

  it("point the minor channel at this release's minor", () => {
    const channels = [...readme.matchAll(/\/sdk\/(\d+\.\d+)\//g)].map((m) => m[1]);
    expect(channels.length, `no /sdk/<minor>/ reference found in ${README}`).toBeGreaterThan(0);
    for (const found of channels) {
      expect(found, fix).toBe(minor);
    }
  });
});
