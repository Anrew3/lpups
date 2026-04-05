import { defineConfig } from "tsup";

export default defineConfig({
  entry:     ["src/plugin.ts"],
  format:    ["cjs"],
  outDir:    "bin",
  splitting: false,
  minify:    true,
  // @napi-rs/canvas ships a pre-built .node binary — it cannot be bundled,
  // so it stays as a runtime require() from node_modules.
  external:  ["@napi-rs/canvas"],
});
