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

- Do each step you can on this machine yourself. For anything only I can do, like running sudo on another machine or changing the Tailscale admin console, tell me exactly what to do and wait until I say it is done.
- Before you write the config, ask me which machines to include. Look at what this machine already has (vp globals, Homebrew packages, and the git repos I work in) and suggest what to keep in sync.
- Run \`fizz ship --dry-run\` and show me the plan before you run \`fizz ship\`.`;

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
