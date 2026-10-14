import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Install } from "../components/landing/content";
import { Ledger } from "../components/landing/ledger";
import { OneConfig, Phases } from "../components/landing/sections";
import { PosterNav } from "../components/poster/poster-nav";

export const Route = createFileRoute("/")({ component: Home, staticData: { bare: true } });

// The landing page: a poster with the terminal as the object. Brand top-left,
// links top-right, the tagline under the brand, the install on the left and
// the Ledger on the right at its own width, then the config and the three phases of a Ship.
function Home() {
  return (
    <main>
      <FizzBackground />
      <div className="flex min-h-svh flex-col p-6 sm:p-10">
        <PosterNav />
        <p className="mt-8 max-w-xl text-base text-foreground/80">
          Every machine. One config. One command on any Machine brings the rest in line, over
          Tailscale SSH, from origin.
        </p>
        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_auto]">
          {/* Stacked, the install centers and the Ledger goes full width. */}
          <Install className="justify-self-center lg:justify-self-start" />
          <Ledger className="w-full lg:w-fit lg:justify-self-end" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
