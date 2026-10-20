import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@fleetfizz/brand-assets";
import { pagesInOrder } from "../lib/source";

// The sitemap: the home page, then every docs page in sidebar order.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
            ...["/", ...pagesInOrder().map((page) => page.url)].map(
              (path) => `  <url><loc>${SITE_URL}${path}</loc></url>`,
            ),
            `</urlset>`,
            "",
          ].join("\n"),
          { headers: { "Content-Type": "application/xml; charset=utf-8" } },
        ),
    },
  },
});
