import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/geocoder.ts", "src/tiles.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
