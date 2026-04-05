import { defineConfig } from "tsup";

export default defineConfig({
  entry:     ["src/plugin.ts"],
  format:    ["cjs"],
  outDir:    "bin",
  splitting: false,
  minify:    true,
  external:  ["@napi-rs/canvas"],
});
