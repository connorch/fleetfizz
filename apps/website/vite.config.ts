import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// The whole site is prerendered at build time. Nitro's vercel-static preset
// writes only the static files (Build Output API, no function) to .vercel/output.
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        failOnError: true,
        // Design mocks live under /mock and never ship.
        filter: (page) => !page.path.startsWith("/mock"),
      },
    }),
    nitro({ preset: "vercel-static" }),
    viteReact(),
  ],
});
