import { Config } from "@remotion/cli/config";

// Studio and `remotion render` read this. Every graphic sits on the site's own
// background, so a render is transparent by default: PNG frames into VP9 with
// alpha. `pnpm render` (src/render.ts) also writes the Safari file.
Config.setEntryPoint("./src/index.ts");
Config.setVideoImageFormat("png");
Config.setPixelFormat("yuva420p");
Config.setCodec("vp9");

// The font arrives from node_modules, outside this package. Studio names
// emitted assets by their path relative to the package, so its name would
// start with ../ and land outside the served bundle; a flat hashed name keeps
// it reachable. Renders already hash asset names.
Config.overrideWebpackConfig((config) => ({
  ...config,
  output: { ...config.output, assetModuleFilename: "assets/[hash][ext]" },
}));
