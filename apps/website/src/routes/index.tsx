import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Install } from "../components/landing/content";
import { Ledger } from "../components/landing/ledger";
import { OneConfig, Phases } from "../components/landing/sections";
import { PosterBrand, PosterLinks } from "../components/poster/poster-nav";

export const Route = createFileRoute("/")({ component: Home, staticData: { bare: true } });

// The landing page: a poster with the terminal as the object.
//
// Wide: two rows. The brand is the first; the tagline and the install are
// centered in the space under it. The right column spans both rows: the links
// at the top, then the Ledger, centered on the tagline: a spacer under the
// links grows to the brand's height before the Ledger's margins split what
// is left. On a short screen the spacer is what gives, so the Ledger slides
// down to the bottom edge, then up to the top under the links once it
// cannot fit at all.
//
// Narrower: one centered column with the Ledger at full width. Then the
// config and the three phases of a Ship.
function Home() {
  // Two lines of the brand at its line height, less the links' row.
  const spacer = "max-h-[calc(1.64*var(--brand)-1.75rem)]";
  return (
    <main>
      <FizzBackground />
      <div className="grid min-h-svh gap-x-10 gap-y-8 p-6 [--brand:clamp(4rem,13vw,11rem)] sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_1fr] lg:gap-y-0">
        <PosterLinks className="justify-self-center lg:hidden" />
        <PosterBrand className="justify-self-center text-center lg:justify-self-start lg:text-left" />
        <div className="flex min-w-0 flex-col items-center gap-6 text-center lg:items-start lg:self-center lg:py-10 lg:text-left">
          <p className="max-w-xl text-base text-foreground/70">
            <span className="text-foreground">Every machine. One config.</span> One command on any
            Machine brings the rest in line, over Tailscale SSH, from origin.
          </p>
          <Install />
        </div>
        <div className="flex min-w-0 flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-end">
          <PosterLinks className="hidden shrink-0 lg:flex" />
          <div className={`hidden h-0 grow lg:block ${spacer}`} />
          <Ledger className="w-full shrink-0 lg:my-auto lg:w-fit" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
