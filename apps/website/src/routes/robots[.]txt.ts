import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@fleetfizz/brand-assets";

// Every crawler may read every page; the sitemap lists them.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
    },
  },
});
