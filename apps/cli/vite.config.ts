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
      // runtime dependency (effect, semver) are inlined.
      deps: { alwaysBundle: () => true },
      banner: { js: "#!/usr/bin/env node" },
    },
  }),
);
