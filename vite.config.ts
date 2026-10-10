import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/.{git,cache,output,temp}/**"],
  },
  fmt: {
    ignorePatterns: ["dist", "node_modules", "pnpm-lock.yaml", "CHANGELOG.md"],
    sortPackageJson: {},
  },
  lint: {
    ignorePatterns: ["dist", "node_modules", "pnpm-lock.yaml"],
  },
});
