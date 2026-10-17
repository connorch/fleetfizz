import { createFileRoute } from "@tanstack/react-router";
import { markdownResponse, pagesInOrder, renderMarkdown } from "../lib/source";

// Every docs page as Markdown, in sidebar order, in one file.
export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async () =>
        markdownResponse((await Promise.all(pagesInOrder().map(renderMarkdown))).join("\n\n")),
    },
  },
});
