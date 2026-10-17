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

// The logo's green: lime in the dark, and in the light a mid green that
// reads as the brand on a light background (lime would wash out).
const LOGO_GREEN = "text-[oklch(0.6_0.19_128)] dark:text-fizz";

// The homepage brand on one line: "fleet", "fizz" in the brand color, then
// the glyph.
export function Wordmark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono font-semibold tracking-tight",
        className,
      )}
      {...props}
    >
      <span>
        fleet<span className={LOGO_GREEN}>fizz</span>
      </span>
      <Glyph className={LOGO_GREEN} />
    </span>
  );
}
