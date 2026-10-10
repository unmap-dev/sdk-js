import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // Every export here is a hook or a client component. The directive makes the whole module a
  // client boundary under React Server Components, so a Next.js page can import from this
  // package without wrapping it in a client file of its own.
  banner: { js: '"use client";' },
});
