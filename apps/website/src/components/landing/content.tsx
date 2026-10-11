import { Button } from "@fleetfizz/ui/components/button";
import { CopyIcon } from "@fleetfizz/ui/components/copy-icon";
import { cn } from "@fleetfizz/ui/lib/utils";
import { useIconHover } from "@fleetfizz/ui/hooks/use-icon-hover";
import { Link } from "@tanstack/react-router";

// Copy shared by every landing mock. Layout is the variant's job.

export const PHASES = [
  ["Gather", "Read every Machine over Tailscale SSH. Change nothing."],
  ["Plan", "Turn the config and each Machine's state into Steps."],
  ["Ask", "Every Question is asked on the Starting Machine before anything changes."],
  ["Apply", "Run the Steps on every Machine in parallel. Offline Machines are skipped."],
] as const;

export const NEEDS = [
  ["Starting Machine", "tailscale with Tailscale SSH, gh logged in, vp"],
  ["Every other Machine", "Tailscale SSH, git, curl, a shell"],
  ["In the background", "Nothing. No agent, no daemon, no server."],
] as const;

export function Install({ className }: { className?: string }) {
  const { ref, triggerProps } = useIconHover();
  return (
    <div
      className={cn(
        "bg-background/55 inline-flex items-center gap-3 rounded-md border py-2 pr-2 pl-3 font-mono text-sm backdrop-blur-sm",
        className,
      )}
    >
      <span>
        <span className="text-fizz-foreground dark:text-fizz">$</span> vp install -g fleetfizz
      </span>
      <Button variant="ghost" size="icon-xs" aria-label="Copy" {...triggerProps}>
        <CopyIcon ref={ref} size={12} />
      </Button>
    </div>
  );
}

export function DocsButton({ className }: { className?: string }) {
  return (
    <Button render={<Link to="/" />} nativeButton={false} className={className}>
      Read the docs
    </Button>
  );
}

export function Needs({ className }: { className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm", className)}>
      {NEEDS.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium">{k}</dt>
          <dd className="text-foreground/70">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
