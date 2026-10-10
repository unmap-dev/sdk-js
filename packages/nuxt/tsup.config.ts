import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/module.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
