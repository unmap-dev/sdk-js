import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // @unmap/optimize-schema is private: inline its types into the published .d.ts.
  dts: { resolve: ["@unmap/optimize-schema"] },
  clean: true,
  sourcemap: true,
});
