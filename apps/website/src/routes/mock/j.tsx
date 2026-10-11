import "@fontsource-variable/jetbrains-mono";
import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Install, Needs } from "../../components/landing/content";
import { Ledger } from "../../components/landing/ledger";
import { OneConfig, Phases } from "../../components/landing/sections";
import { PosterNav, SectionList } from "../../components/poster/poster-nav";

export const Route = createFileRoute("/mock/j")({ component: MockJ, staticData: { bare: true } });

// J: the terminal is the object. Brand top-left, links top-right, the
// tagline and install on the left, the Ledger filling the right, the docs
// index in the bottom corner. JetBrains Mono.
function MockJ() {
  return (
    <main className="font-mono [--font-mono:'JetBrains_Mono_Variable',monospace] [--font-sans:var(--font-mono)]">
      <FizzBackground />
      <div className="flex min-h-svh flex-col p-6 sm:p-10">
        <PosterNav />
        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="text-3xl leading-tight tracking-tight">
              Every machine.
              <br />
              One config.
            </p>
            <p className="mt-4 max-w-sm text-sm text-foreground/70">
              One command on any Machine brings the rest in line, over Tailscale SSH, from origin.
            </p>
            <Install className="mt-6" />
            <Needs className="mt-10" />
          </div>
          <Ledger />
        </div>
        <SectionList className="self-end" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
