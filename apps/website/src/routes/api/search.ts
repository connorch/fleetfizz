import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";
import { source } from "../../lib/source";

const server = createFromSource(source, { language: "english" });

// The docs search index, prerendered to a static file (see vite.config.ts);
// the search dialog downloads it and searches in the browser.
export const Route = createFileRoute("/api/search")({
  server: { handlers: { GET: () => server.staticGET() } },
});
