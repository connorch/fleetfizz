import { ScrollArea, ScrollBar } from "@fleetfizz/ui/components/scroll-area";
import { cn } from "@fleetfizz/ui/lib/utils";
import type { ReactNode } from "react";

// A code block that scrolls sideways under a thin themed scrollbar instead of
// the browser's. `className` styles the frame (border, background, width);
// the padding sits inside the scroll, so the bar runs along the frame's
// bottom edge. A frame with its own colors can recolor the bar's thumb with
// [&_[data-slot=scroll-area-thumb]]:bg-*.
export function CodeBlock({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <ScrollArea className={cn("min-w-0 rounded-lg border", className)}>
      <pre className="w-max min-w-full p-5 font-mono text-[12.5px] leading-relaxed">{children}</pre>
      <ScrollBar orientation="horizontal" className="px-2 pb-0.5" />
    </ScrollArea>
  );
}

// The page's own code blocks: in the light, a warm off-white a step darker
// than the page, with punctuation in the muted ink; in the dark, the page with
// plain text in the foreground. The Ledger, a terminal, brings its own.
export const PAPER =
  "border-[oklch(0.91_0.005_120)] bg-[oklch(0.975_0.003_120)] text-muted-foreground dark:border-border dark:bg-transparent dark:text-foreground";

// Syntax colors on PAPER: keys and commands in ink, strings in a deep brand
// green, versions and ranges (what a Ship acts on) in amber, comments quiet.
// The dark theme keeps lime for strings and versions alike.
export const SYNTAX = {
  key: "text-[oklch(0.2_0.01_130)] dark:text-foreground",
  string: "text-[oklch(0.47_0.14_132)] dark:text-fizz",
  version: "text-[oklch(0.55_0.15_60)] dark:text-fizz",
  comment: "text-muted-foreground",
} as const;
