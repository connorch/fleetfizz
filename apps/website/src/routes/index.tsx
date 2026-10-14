import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Install } from "../components/landing/content";
import { Ledger } from "../components/landing/ledger";
import { OneConfig, Phases } from "../components/landing/sections";
import { PosterBrand, PosterLinks } from "../components/poster/poster-nav";

export const Route = createFileRoute("/")({ component: Home, staticData: { bare: true } });

// The landing page: a poster with the terminal as the object.
//
// Wide (xl, where the brand and the Ledger fit side by side): two rows. The brand is the first; the tagline and the install are
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
      <div className="grid min-h-svh gap-x-10 gap-y-8 p-6 [--brand:clamp(4rem,13vw,11rem)] sm:p-10 xl:grid-cols-[minmax(0,1fr)_auto] xl:grid-rows-[auto_1fr] xl:gap-y-0">
        <PosterLinks className="justify-self-center xl:hidden" />
        <PosterBrand
          mark="beside"
          className="justify-self-center text-center xl:justify-self-start xl:text-left"
        />
        <div className="flex min-w-0 flex-col items-center gap-6 text-center xl:items-start xl:self-center xl:py-10 xl:text-left">
          <p className="max-w-xl text-base text-foreground/70">
            <span className="block text-foreground">Every machine. One config.</span>
            One command on any Machine brings the rest in line, over Tailscale SSH, from origin.
          </p>
          <Install />
        </div>
        <div className="flex min-w-0 flex-col xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:items-end">
          <PosterLinks className="hidden shrink-0 xl:flex" />
          <div className={`hidden h-0 grow xl:block ${spacer}`} />
          <Ledger className="w-full shrink-0 xl:my-auto xl:w-fit" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
