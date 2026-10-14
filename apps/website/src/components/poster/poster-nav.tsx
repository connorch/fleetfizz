import { cn } from "@fleetfizz/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { DocsLink, GithubLink } from "../nav-buttons";
import { ThemeToggle } from "../theme-toggle";
import { Glyph } from "../wordmark";

// The brand on two lines, as big as the page allows. `mark` places the
// glyph: rising off the end of "fizz", beside "fizz" at its full height, or
// stamped above the brand.
export function PosterBrand({
  className,
  mark,
}: {
  className?: string;
  mark?: "trailing" | "beside" | "above" | undefined;
}) {
  return (
    <Link
      to="/"
      className={cn(
        // A layout may set --brand on an ancestor to reason about the brand's height.
        "block text-[length:var(--brand,clamp(4rem,13vw,11rem))] leading-[0.82] font-bold tracking-[-0.06em]",
        className,
      )}
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
        {mark === "beside" && (
          <Glyph className="ml-[0.14em] inline-block size-[0.82em] translate-y-[0.08em] align-baseline" />
        )}
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

// The poster header: the brand with the links in the far corner. On a phone
// the links are a row above the brand.
export function PosterNav({
  className,
  mark,
}: {
  className?: string;
  mark?: "trailing" | "beside" | "above";
}) {
  return (
    <header
      className={cn("flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <PosterBrand mark={mark} />
      <PosterLinks className="order-first self-end sm:order-last sm:self-start sm:pt-1" />
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
