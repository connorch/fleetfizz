import { createFileRoute } from "@tanstack/react-router";
import { NAME, SITE_URL, TAGLINE } from "../brand";
import { markdownPath, markdownResponse, pagesInOrder } from "../lib/source";

// The llms.txt index: every docs page, linked to its Markdown copy.
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        markdownResponse(
          [
            `# ${NAME}`,
            `> ${TAGLINE.lead} ${TAGLINE.rest}`,
            "## Docs",
            pagesInOrder()
              .map((page) => {
                const link = `[${page.data.title}](${SITE_URL}${markdownPath(page)})`;
                return page.data.description ? `- ${link}: ${page.data.description}` : `- ${link}`;
              })
              .join("\n"),
          ].join("\n\n"),
        ),
    },
  },
});
