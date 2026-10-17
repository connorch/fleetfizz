import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { glob } from "node:fs/promises";
import { defineConfig } from "vite";

// The whole site is prerendered at build time. Nitro's vercel-static preset
// writes only the static files (Build Output API, no function) to .vercel/output.
// Nitro's crawl finds every docs page from the sidebar. Nothing links to the
// search index or the Markdown copies for agents, so they are listed.
const markdown = await Array.fromAsync(
  glob("**/*.mdx", { cwd: `${import.meta.dirname}/content/docs` }),
  (file) => `/docs/${file.replace(/\.mdx$/, ".md")}`,
);

export default defineConfig({
  plugins: [
    fumadocsMdx(),
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true, failOnError: true },
    }),
    nitro({
      preset: "vercel-static",
      prerender: { routes: ["/", "/api/search", "/llms.txt", "/llms-full.txt", ...markdown] },
    }),
    viteReact(),
  ],
});
