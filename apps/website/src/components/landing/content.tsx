import { Button } from "@fleetfizz/ui/components/button";
import { CheckIcon } from "@fleetfizz/ui/components/check-icon";
import { CopyIcon } from "@fleetfizz/ui/components/copy-icon";
import type { IconHandle } from "@fleetfizz/ui/hooks/use-icon-hover";
import { cn } from "@fleetfizz/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

// The landing page copy. Layout is the page's job.

// Two of a Ship's phases, as CONTEXT.md names them, each word starting its
// sentence. Plan, between them, is left off the page.
export const PHASES = [
  ["Check", "each machine's current configuration over Tailscale."],
  [
    "Apply",
    "updates to vp, node, brew formulae and casks, and your projects, on the machines that need them.",
  ],
] as const;

// The commands a visitor runs, each with what it does.
export const COMMANDS = [
  ["fizz ship --dry-run", "check every Machine and print its plan; change nothing"],
  ["fizz ship", "apply the plan everywhere, in parallel"],
  ["fizz report", "print the full Ledger of the last Ship"],
] as const;

const INSTALL = "vp install -g fleetfizz";

// The install command with a copy button. The copy icon plays on the click,
// not on hover, and a check takes its place for a moment once the text is on
// the clipboard.
export function Install({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useRef<IconHandle>(null);
  const check = useRef<IconHandle>(null);
  useEffect(() => {
    if (!copied) return;
    check.current?.startAnimation();
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  const onClick = () => {
    copy.current?.startAnimation();
    // No check when the clipboard refuses (no permission, or no focus).
    navigator.clipboard.writeText(INSTALL).then(
      () => setCopied(true),
      () => {},
    );
  };
  return (
    <div
      className={cn(
        "bg-background/55 inline-flex items-center gap-3 rounded-md border py-2 pr-2 pl-3 font-mono text-sm backdrop-blur-sm",
        className,
      )}
    >
      <span>
        <span className="text-fizz-foreground dark:text-fizz">$</span> {INSTALL}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={copied ? "Copied" : "Copy"}
        className={cn(copied && "text-fizz-foreground dark:text-fizz")}
        onClick={onClick}
      >
        {copied ? <CheckIcon ref={check} size={12} /> : <CopyIcon ref={copy} size={12} />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
