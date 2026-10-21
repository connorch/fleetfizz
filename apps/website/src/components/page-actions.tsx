import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { MarkdownCopyButton, ViewOptionsPopover } from "fumadocs-ui/layouts/spacious/page";
import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Check, Copy } from "lucide-react";
import { SITE_URL } from "@fleetfizz/brand-assets";
import { GITHUB_URL } from "./nav-buttons";
import { markdownPath } from "../lib/source";

// The page this prompt sets up from, and the prompt a reader pastes into an
// agent to have it walk them through that page.
const SETUP_PAGE = "getting-started.mdx";
const SETUP_PROMPT = `Help me set up fleetfizz, a CLI that keeps my dev machines in sync over Tailscale SSH. Follow the guide at ${SITE_URL}${markdownPath({ path: SETUP_PAGE })} step by step.

- Do each step you can on this machine yourself. For anything only I can do, like running sudo, logging in, or changing the Tailscale admin console, tell me exactly what to do and wait until I say it is done.
- Once Tailscale SSH works, check that every machine I want in the fleet has git, plus Node 24 or newer and the package manager fleetfizz is installed with here, and tell me what is missing.
- \`fizz init\` asks its questions in a terminal, so I run it myself. Before I do, look at what this machine has (npm, pnpm, bun, or vp globals, Homebrew packages, agent skills, dotfiles, and the git repos I work in) and suggest what to pick and what to add after.
- Add what \`fizz init\` does not ask about, like Tracked Repos, with \`fizz config add\`. You have no terminal, so pass every value it would prompt for (\`fizz config add <provider> --help\` lists them). Run \`fizz config\` to show me the result.
- Run \`fizz status\` and \`fizz ship --dry-run\`, and show me where each machine stands and every question the dry run asks. Then run \`fizz ship\` with an \`--answer\` for each question as I decide. If an item is skipped with "ship again", ship again.
- Finally, install the fleetfizz skill from the last step, so my agents can change the config and ship from now on.`;

// Fumadocs' page actions under a docs page's description: copy the page's
// Markdown, or open it in GitHub or an AI. Getting started adds the setup
// prompt first, styled like Fumadocs' own copy button.
export function PageActions({ path }: { path: string }) {
  const markdownUrl = markdownPath({ path });
  return (
    <div className="flex flex-row flex-wrap items-center gap-2 border-b pt-2 pb-6">
      {path === SETUP_PAGE && <SetupPromptButton />}
      <MarkdownCopyButton markdownUrl={markdownUrl} />
      <ViewOptionsPopover
        markdownUrl={markdownUrl}
        githubUrl={`${GITHUB_URL}/blob/main/apps/website/content/docs/${path}`}
      />
    </div>
  );
}

function SetupPromptButton() {
  const [checked, onClick] = useCopyButton(() => navigator.clipboard.writeText(SETUP_PROMPT));
  return (
    <button
      type="button"
      aria-live="polite"
      onClick={onClick}
      className={buttonVariants({
        variant: "secondary",
        size: "sm",
        className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
      })}
    >
      {checked ? <Check /> : <Copy />}
      {checked ? "Copied prompt" : "Copy setup prompt"}
    </button>
  );
}
