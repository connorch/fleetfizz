import { INSTALL } from "@fleetfizz/brand-assets";
import { Button } from "@fleetfizz/ui/components/button";
import { CheckIcon } from "@fleetfizz/ui/components/check-icon";
import { CopyIcon } from "@fleetfizz/ui/components/copy-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@fleetfizz/ui/components/dropdown-menu";
import type { IconHandle } from "@fleetfizz/ui/hooks/use-icon-hover";
import { cn } from "@fleetfizz/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// The landing page copy. Layout is the page's job.

// Why fleetfizz exists, the first thing under the hero.
export const WHY = (
  <>
    Agents don't stop when you close your laptop, so your dev setup now lives on more than one
    machine. Keeping their tools and repos the same by hand doesn't scale. fleetfizz does it for
    you: one config, one <code className="font-mono text-[0.9em]">fizz ship</code>, every machine in
    line.
  </>
);

// Two of a Ship's phases, as CONTEXT.md names them, each word starting its
// sentence. Plan, between them, is left off the page.
export const PHASES = [
  ["Check", "each machine's current configuration over Tailscale."],
  [
    "Apply",
    "updates to your globals, brew formulae and casks, shared files, and your projects, on the machines that need them.",
  ],
] as const;

// The commands a visitor runs, each with what it does.
export const COMMANDS = [
  ["fizz ship --dry-run", "check every Machine and print its plan; change nothing"],
  ["fizz ship", "apply the plan everywhere, in parallel"],
  ["fizz report", "print the full Ledger of the last Ship"],
] as const;

// The install command with a copy button, and a menu beside it to switch
// package managers. Picking one in the menu also copies its command. The copy
// icon plays on the click, not on hover, and a check takes its place for a
// moment once the text is on the clipboard.
export function Install({ className }: { className?: string }) {
  const [command, setCommand] = useState<string>(INSTALL.vp);
  const [copied, setCopied] = useState(false);
  const copy = useRef<IconHandle>(null);
  const check = useRef<IconHandle>(null);
  useEffect(() => {
    if (!copied) return;
    check.current?.startAnimation();
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  const copyCommand = (text: string) => {
    copy.current?.startAnimation();
    // No check when the clipboard refuses (no permission, or no focus).
    navigator.clipboard.writeText(text).then(
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
      {/* As wide as the longest command, so switching never resizes the badge. */}
      <span className="min-w-[26ch]">
        <span className="text-fizz-foreground dark:text-fizz">$</span> {command}
      </span>
      <div className="flex items-center border-l pl-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={copied ? "Copied" : "Copy"}
          className={cn(copied && "text-fizz-foreground dark:text-fizz")}
          onClick={() => copyCommand(command)}
        >
          {copied ? <CheckIcon ref={check} size={12} /> : <CopyIcon ref={copy} size={12} />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label="Choose package manager" />}
          >
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto font-mono">
            <DropdownMenuRadioGroup value={command} onValueChange={setCommand}>
              {Object.entries(INSTALL).map(([manager, managerCommand]) => (
                <DropdownMenuRadioItem
                  key={manager}
                  value={managerCommand}
                  closeOnClick
                  onClick={() => copyCommand(managerCommand)}
                >
                  {manager}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
