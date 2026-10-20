import { cn } from "@fleetfizz/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { type Ref, type RefObject, useEffect, useState } from "react";
import { DocsLink, GithubLink } from "../nav-buttons";
import { ThemeToggle } from "../theme-toggle";
import { Glyph, Wordmark } from "../wordmark";

// The home page's <h1>: the brand on two lines, as big as the page allows,
// the glyph beside "fizz" at its full height. The glyph sits 0.05em below the
// baseline so it stays inside the line box and does not add to the brand's
// height.
export function PosterBrand({
  className,
  ref,
}: {
  className?: string;
  ref?: Ref<HTMLAnchorElement> | undefined;
}) {
  return (
    <h1
      className={cn(
        // A layout may set --brand on an ancestor to reason about the brand's height.
        "text-[length:var(--brand,clamp(4rem,13vw,11rem))] leading-[0.82] font-bold tracking-[-0.06em]",
        className,
      )}
    >
      <Link ref={ref} to="/" className="block">
        fleet
        <br />
        {/* The glyph stays beside "fizz": the brand is sized from 100vw, which
            counts a classic scrollbar its column does not have. */}
        <span className="whitespace-nowrap text-fizz-foreground dark:text-fizz">
          fizz
          <Glyph className="ml-[0.14em] inline-block size-[0.82em] translate-y-[0.03em] align-[-0.05em]" />
        </span>
      </Link>
    </h1>
  );
}

// The docs, GitHub, and theme links.
function PosterLinks() {
  return (
    <nav className="flex items-center gap-1">
      <DocsLink />
      <GithubLink />
      <ThemeToggle />
    </nav>
  );
}

// Whether `target` has scrolled up out of the viewport. False while it is on
// screen or below it, and until it is observed.
function useScrolledPast(target: RefObject<Element | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);
  return past;
}

// The links, pinned to the top of the page. Over the poster they sit where it
// would put them, inside its padding, and the poster leaves a blank row of the
// same height for them. Once `brand` (the poster's own) scrolls out of view,
// the bar tightens, takes the page background, and the wordmark joins it.
export function PosterHeader({ brand }: { brand: RefObject<Element | null> }) {
  const scrolled = useScrolledPast(brand);
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b px-6 transition-[padding,background-color,border-color] sm:px-10",
        // Scrolled, it takes the poster's backdrop: lime in the light, the
        // page in the dark.
        scrolled
          ? "border-fizz-foreground/10 bg-fizz/85 py-3 backdrop-blur-md dark:border-border dark:bg-background/85"
          : "border-transparent pt-6 sm:pt-10",
      )}
    >
      <Link
        to="/"
        inert={!scrolled}
        className={cn("transition-opacity", scrolled ? "opacity-100" : "opacity-0")}
      >
        <Wordmark onFizz />
      </Link>
      <PosterLinks />
    </header>
  );
}
