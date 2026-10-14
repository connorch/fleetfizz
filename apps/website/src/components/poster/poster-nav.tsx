import { cn } from "@fleetfizz/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { DocsLink, GithubLink } from "../nav-buttons";
import { ThemeToggle } from "../theme-toggle";
import { Glyph } from "../wordmark";

// The poster header: the brand on two lines, as big as the page allows, and
// the links in the far corner. `mark` places the glyph: rising off the end of
// "fizz", or stamped above the brand.
export function PosterNav({
  className,
  mark,
}: {
  className?: string;
  mark?: "trailing" | "above";
}) {
  return (
    <header className={cn("flex items-start justify-between", className)}>
      <Link
        to="/"
        className="text-[clamp(4.5rem,13vw,11rem)] leading-[0.82] font-bold tracking-[-0.06em]"
      >
        {mark === "above" && (
          <Glyph className="mb-[0.25em] block size-[0.42em] text-fizz-foreground dark:text-fizz" />
        )}
        fleet
        <br />
        <span className="text-fizz-foreground dark:text-fizz">
          fizz
          {mark === "trailing" && (
            <Glyph className="ml-[0.06em] inline-block size-[0.42em] -translate-y-[0.38em] align-baseline" />
          )}
        </span>
      </Link>
      <nav className="flex items-center gap-1 pt-1">
        <DocsLink />
        <GithubLink />
        <ThemeToggle />
      </nav>
    </header>
  );
}

export const SECTIONS = [
  "Getting started",
  "Config",
  "CLI",
  "How it works",
  "Security",
  "Changelog",
] as const;

// The docs index, right-aligned in a corner.
export function SectionList({ className }: { className?: string }) {
  return (
    <ul className={cn("text-right text-sm leading-6", className)}>
      {SECTIONS.map((s) => (
        <li key={s}>
          <Link to="/" className="hover:text-fizz-foreground dark:hover:text-fizz">
            {s}
          </Link>
        </li>
      ))}
    </ul>
  );
}
