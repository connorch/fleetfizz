import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

// E2E files end in .e2e.ts, so `pnpm test` never runs them. A Ship over a
// real Fleet takes minutes, and bringing the Fleet up takes longer.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["src/**/*.e2e.ts"],
      testTimeout: 10 * 60_000,
      hookTimeout: 15 * 60_000,
    },
  }),
);
