import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/canada-service-area.ts", "src/along.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
