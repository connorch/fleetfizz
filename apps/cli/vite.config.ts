import { fileURLToPath } from "node:url";

import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

export default mergeConfig(
  baseConfig,
  defineConfig({
    pack: {
      entry: { fleetfizz: "src/bin.ts" },
      outDir: "dist",
      platform: "node",
      format: "esm",
      clean: true,
      // One self-contained file: the private workspace packages and every
      // runtime dependency (effect, semver, ink, react) are inlined.
      deps: { alwaysBundle: () => true },
      banner: { js: "#!/usr/bin/env node" },
      // jsonc-parser has no exports map; its `main` is a UMD build with
      // internal requires that cannot be inlined. Bundle its ESM build.
      // Ink's optional React DevTools hook: a stub, so the bundle stays one file.
      alias: {
        "jsonc-parser": "jsonc-parser/lib/esm/main.js",
        "react-devtools-core": fileURLToPath(new URL("scripts/no-devtools.ts", import.meta.url)),
      },
      outputOptions: { inlineDynamicImports: true },
    },
  }),
);
