import { cn } from "@fleetfizz/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { CodeBlock, PAPER, SYNTAX } from "./code-block";
import { ConfigExample } from "./config-example";
import { COMMANDS, PHASES } from "./content";

// The landing page sections below the fold. Spacing between them is the
// page's job.

export function OneConfig({ className }: { className?: string }) {
  return (
    <section className={cn("grid gap-10 lg:grid-cols-[1fr_1.5fr]", className)}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">One config</h2>
        <p className="mt-4 leading-relaxed text-foreground/75">
          One file names the Fleet, the Tracked Repos, and the vp section. It lives at{" "}
          <code className="font-mono text-sm">~/.config/fleetfizz/config.jsonc</code>, and every
          Ship copies it to every Machine, so any Machine can ship next.
        </p>
      </div>
      <ConfigExample />
    </section>
  );
}

// How a Ship runs, mirrored from OneConfig so the two alternate: the commands
// on the left, the text on the right. Stacked, the text comes first.
export function OneCommand({ className }: { className?: string }) {
  return (
    <section className={cn("grid gap-10 lg:grid-cols-[1.5fr_1fr]", className)}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">One command syncs everything</h2>
        <p className="mt-4 leading-relaxed text-foreground/75">
          Run <code className="font-mono text-sm">fizz ship</code> on any Machine. It checks the
          others over Tailscale SSH, asks its Questions before it changes anything, then applies
          every plan in parallel. Nothing stays behind: no agent, no daemon, no server.
        </p>
        <Link
          to="/docs/$"
          params={{ _splat: "" }}
          className="mt-5 inline-block text-logo hover:underline"
        >
          Read the docs →
        </Link>
      </div>
      <CodeBlock className={cn(PAPER, "lg:order-first")}>
        <code>
          {COMMANDS.map(([command, does], i) => (
            <span key={command} className={cn("block", i > 0 && "mt-[1lh]")}>
              <span className={cn("block", SYNTAX.comment)}># {does}</span>
              <span className={SYNTAX.string}>$</span> <span className={SYNTAX.key}>{command}</span>
            </span>
          ))}
        </code>
      </CodeBlock>
    </section>
  );
}

// Check and Apply in big type, as a stair: each word starts the sentence beside
// it, Apply steps right, and a green elbow runs from under Check's first letter
// to Apply. --word is the word size and --step Apply's indent, in the list's
// own width (cqw) so the indent and the elbow agree. Below md the sentences
// drop under their words, the step shrinks, and the elbow goes.
export function Phases({ className }: { className?: string }) {
  return (
    <ol
      className={cn(
        "@container grid gap-14 [--step:min(38cqw,420px)] [--word:clamp(3.5rem,11vw,9rem)]",
        className,
      )}
    >
      {PHASES.map(([word, rest], i) => (
        <li
          key={word}
          className={cn(
            "relative flex flex-col gap-3 md:flex-row md:items-baseline md:gap-7",
            i > 0 &&
              "ml-[15%] md:ml-(--step) md:before:absolute md:before:-top-16 md:before:left-[calc(var(--word)*0.3-var(--step))] md:before:h-[calc(4rem+var(--word)*0.42)] md:before:w-[calc(var(--step)-var(--word)*0.3-1.25rem)] md:before:border-b-2 md:before:border-l-2 md:before:border-logo md:before:opacity-70 md:before:content-['']",
          )}
        >
          <span className="text-(length:--word) leading-[0.9] font-bold tracking-[-0.04em]">
            {word}
          </span>
          <p className="max-w-[28ch] text-lg/relaxed text-foreground/75">{rest}</p>
        </li>
      ))}
    </ol>
  );
}
