import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/.{git,cache,output,temp}/**"],
  },
  fmt: {
    ignorePatterns: [
      "dist",
      "node_modules",
      "pnpm-lock.yaml",
      "CHANGELOG.md",
      "**/routeTree.gen.ts",
      // Written by apps/cli/src/reference.test.ts, which compares them byte for byte.
      "apps/website/content/generated",
    ],
    sortPackageJson: {},
  },
  lint: {
    ignorePatterns: ["dist", "node_modules", "pnpm-lock.yaml", "**/routeTree.gen.ts"],
  },
});
