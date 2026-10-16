import { createFileRoute } from "@tanstack/react-router";
import { markdownResponse, renderMarkdown, source } from "../../lib/source";

// Each docs page as Markdown, at its file's path: /docs/config.md.
export const Route = createFileRoute("/docs/{$}.md")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const page = source.getPages().find((p) => p.path === `${params._splat}.mdx`);
        return page
          ? markdownResponse(await renderMarkdown(page))
          : new Response("Not found", { status: 404 });
      },
    },
  },
});
