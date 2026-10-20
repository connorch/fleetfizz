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
// search index, the crawler and agent files, or the Markdown copies, so they
// are listed.
const markdown = await Array.fromAsync(
  glob("**/*.mdx", { cwd: `${import.meta.dirname}/content/docs` }),
  (file) => `/docs/${file.replace(/\.mdx$/, ".md")}`,
);

// An agent that asks a docs page for Markdown (Accept: text/markdown) gets its
// Markdown copy: /docs/config serves /docs/config.md. Browsers never ask for
// it. Vercel routes run before the static files; Nitro's route type leaves
// out `has`, so the routes are declared here rather than inline.
const accepts = [{ type: "header", key: "accept", value: ".*text/markdown.*" }];
const markdownForAgents = [
  { src: "^/docs(?:/.*)?$", headers: { Vary: "Accept" }, continue: true },
  { src: "^/docs/?$", has: accepts, dest: "/docs/index.md" },
  { src: "^/docs/((?!.*\\.md$).+?)/?$", has: accepts, dest: "/docs/$1.md" },
];

export default defineConfig({
  plugins: [
    fumadocsMdx(),
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true, failOnError: true },
    }),
    nitro({
      preset: "vercel-static",
      vercel: { config: { version: 3, routes: markdownForAgents } },
      prerender: {
        routes: [
          "/",
          "/api/search",
          "/robots.txt",
          "/sitemap.xml",
          "/llms.txt",
          "/llms-full.txt",
          ...markdown,
        ],
      },
    }),
    viteReact(),
  ],
});
