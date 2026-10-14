import { Button } from "@fleetfizz/ui/components/button";
import { CheckIcon } from "@fleetfizz/ui/components/check-icon";
import { CopyIcon } from "@fleetfizz/ui/components/copy-icon";
import type { IconHandle } from "@fleetfizz/ui/hooks/use-icon-hover";
import { cn } from "@fleetfizz/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

// The landing page copy. Layout is the page's job.

// The phases of a Ship, as CONTEXT.md names them. Questions belong to Plan.
export const PHASES = [
  ["Check", "Read every Machine over Tailscale SSH. Change nothing."],
  [
    "Plan",
    "Turn the config and each Machine's state into Steps. Every Question is asked on the Starting Machine before anything changes.",
  ],
  ["Apply", "Run the Steps on every Machine in parallel. Offline Machines are skipped."],
] as const;

// Not on the page yet; where it goes is still open.
export const NEEDS = [
  ["Starting Machine", "tailscale with Tailscale SSH, gh logged in, vp"],
  ["Every other Machine", "Tailscale SSH, git, curl, a shell"],
  ["In the background", "Nothing. No agent, no daemon, no server."],
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
        className={cn("cursor-pointer", copied && "text-fizz-foreground dark:text-fizz")}
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
