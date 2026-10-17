import { cn } from "@fleetfizz/ui/lib/utils";
import type { ComponentProps } from "react";
import { GLYPH } from "@fleetfizz/brand-assets";

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

// The homepage brand on one line: "fleet", "fizz" in the brand color, then
// the glyph. `onFizz` is for the light theme's lime backdrop, where the logo
// green washes out: "fizz" and the glyph go to ink there, as in the poster.
export function Wordmark({
  className,
  onFizz = false,
  ...props
}: ComponentProps<"span"> & { onFizz?: boolean }) {
  const green = onFizz ? "text-fizz-foreground dark:text-fizz" : "text-logo";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono font-semibold tracking-tight",
        className,
      )}
      {...props}
    >
      <span>
        fleet<span className={green}>fizz</span>
      </span>
      <Glyph className={green} />
    </span>
  );
}
