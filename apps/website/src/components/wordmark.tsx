import { cn } from "@fleetfizz/ui/lib/utils";
import type { ComponentProps } from "react";

// Three rising bubbles: the fleetfizz glyph. Fills with currentColor.
export function Glyph({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-[1.1em]", className)}
      {...props}
    >
      <circle cx="6" cy="14" r="4" />
      <circle cx="13" cy="8" r="3" />
      <circle cx="16" cy="2.6" r="1.8" />
    </svg>
  );
}

export function Wordmark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}
      {...props}
    >
      <Glyph className="text-fizz-foreground dark:text-fizz" />
      fleetfizz
    </span>
  );
}
