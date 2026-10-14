import { cn } from "@fleetfizz/ui/lib/utils";
import type { ComponentProps } from "react";
import { GLYPH } from "../brand";

// Three rising bubbles: the fleetfizz glyph. Fills with currentColor.
export function Glyph({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox={`0 0 ${GLYPH.box} ${GLYPH.box}`}
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-[1.1em]", className)}
      {...props}
    >
      {GLYPH.circles.map((c) => (
        <circle key={c.cx} {...c} />
      ))}
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
