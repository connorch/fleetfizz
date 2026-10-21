import { createFileRoute } from "@tanstack/react-router";
import { NAME, SITE_URL, TAGLINE } from "@fleetfizz/brand-assets";
import { markdownPath, markdownResponse, pagesInOrder } from "../lib/source";

// The llms.txt index (llmstxt.org): what fleetfizz is and how to install it,
// then every docs page linked to its Markdown copy.
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        markdownResponse(
          [
            `# ${NAME}`,
            `> ${TAGLINE.lead} ${TAGLINE.rest}`,
            `${NAME} is a CLI that keeps every macOS and Linux machine on a Tailscale tailnet in line with one config: the global packages of vp, npm, bun, and pnpm, Homebrew formulae and casks, agent skills, shared dotfiles, and a clone of each tracked git repo. \`fizz ship\` runs on one machine and drives the others over Tailscale SSH. There is no daemon, agent, or server to run.`,
            "Install it with npm, pnpm, bun, or vp (Node 24 or newer), then set up a config in a terminal and ship:",
            "```sh\nnpm install -g fleetfizz\nfizz init\nfizz ship\n```",
            "## Docs",
            pagesInOrder()
              .map((page) => {
                const link = `[${page.data.title}](${SITE_URL}${markdownPath(page)})`;
                return page.data.description ? `- ${link}: ${page.data.description}` : `- ${link}`;
              })
              .join("\n"),
            "## Optional",
            [
              `- [All docs in one file](${SITE_URL}/llms-full.txt): every page above, in order.`,
              "- [Config JSON Schema](https://unpkg.com/fleetfizz/schema.json): validates `~/.config/fleetfizz/config.jsonc`.",
              "- [npm package](https://www.npmjs.com/package/fleetfizz)",
            ].join("\n"),
          ].join("\n\n"),
        ),
    },
  },
});
