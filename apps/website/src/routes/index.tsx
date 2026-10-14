import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Install } from "../components/landing/content";
import { Ledger } from "../components/landing/ledger";
import { OneConfig, Phases } from "../components/landing/sections";
import { PosterBrand, PosterLinks } from "../components/poster/poster-nav";

export const Route = createFileRoute("/")({ component: Home, staticData: { bare: true } });

// The landing page: a poster with the terminal as the object. Two columns on
// a wide screen: the brand, the tagline, and the install on the left; the
// links and the Ledger on the right, the Ledger centered in the height left
// under the links so it sits beside the tagline, or the brand on a short
// screen. Narrower, one centered column with the Ledger at full width. Then
// the config and the three phases of a Ship.
function Home() {
  return (
    <main>
      <FizzBackground />
      <div className="grid min-h-svh gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col items-center gap-8 text-center lg:items-start lg:text-left">
          <PosterLinks className="lg:hidden" />
          <PosterBrand />
          <p className="max-w-xl text-base text-foreground/70">
            <span className="text-foreground">Every machine. One config.</span> One command on any
            Machine brings the rest in line, over Tailscale SSH, from origin.
          </p>
          <Install className="mt-auto" />
        </div>
        <div className="flex min-w-0 flex-col gap-10 lg:items-end">
          <PosterLinks className="hidden lg:flex" />
          <div className="flex w-full min-w-0 flex-1 items-center lg:w-auto">
            <Ledger className="w-full lg:w-fit" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
