import { cn } from "@fleetfizz/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { DocsLink, GithubLink } from "../nav-buttons";
import { ThemeToggle } from "../theme-toggle";
import { Glyph } from "../wordmark";

// The brand on two lines, as big as the page allows, the glyph beside
// "fizz" at its full height. The glyph sits 0.05em below the baseline so it
// stays inside the line box and does not add to the brand's height.
export function PosterBrand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        // A layout may set --brand on an ancestor to reason about the brand's height.
        "block text-[length:var(--brand,clamp(4rem,13vw,11rem))] leading-[0.82] font-bold tracking-[-0.06em]",
        className,
      )}
    >
      fleet
      <br />
      {/* The glyph stays beside "fizz": the brand is sized from 100vw, which
          counts a classic scrollbar its column does not have. */}
      <span className="whitespace-nowrap text-fizz-foreground dark:text-fizz">
        fizz
        <Glyph className="ml-[0.14em] inline-block size-[0.82em] translate-y-[0.03em] align-[-0.05em]" />
      </span>
    </Link>
  );
}

// The docs, GitHub, and theme links.
export function PosterLinks({ className }: { className?: string }) {
  return (
    <nav className={cn("flex items-center gap-1", className)}>
      <DocsLink />
      <GithubLink />
      <ThemeToggle />
    </nav>
  );
}
