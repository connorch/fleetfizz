import "@fontsource/space-mono";
import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Install, PHASES } from "../../components/landing/content";
import { Ledger } from "../../components/landing/ledger";
import { OneConfig, Phases } from "../../components/landing/sections";
import { PosterNav, SectionList } from "../../components/poster/poster-nav";
import { Glyph } from "../../components/wordmark";

export const Route = createFileRoute("/mock/k")({ component: MockK, staticData: { bare: true } });

// K: a statement. Brand top-left, links top-right, the tagline set huge in
// the middle, the four phases as a rail down the right edge, install
// bottom-left, the glyph cropped into the bottom-right corner. Space Mono.
function MockK() {
  return (
    <main className="font-mono [--font-mono:'Space_Mono',monospace] [--font-sans:var(--font-mono)]">
      <FizzBackground />
      <div className="relative flex min-h-svh flex-col overflow-hidden p-6 sm:p-10">
        <PosterNav />
        <div className="flex flex-1 items-center py-10">
          <h1 className="max-w-4xl text-[clamp(2.25rem,6.5vw,5.5rem)] leading-[1.02] tracking-[-0.04em]">
            every machine.
            <br />
            one config.
          </h1>
        </div>
        <ol className="absolute top-1/2 right-6 flex -translate-y-1/2 flex-col items-end gap-5 text-[11px] tracking-[0.14em] uppercase sm:right-10">
          {PHASES.map(([name], i) => (
            <li key={name} className="flex items-center gap-3">
              <span className="text-foreground/50">0{i + 1}</span>
              <span>{name}</span>
              <span className="size-2 rounded-full bg-current" />
            </li>
          ))}
        </ol>
        <div className="flex items-end justify-between gap-8">
          <div>
            <p className="max-w-md text-sm text-foreground/70">
              The same toolchain and the same repos on every Machine on your tailnet.
            </p>
            <Install className="mt-4" />
          </div>
          <SectionList className="mr-[22vw]" />
        </div>
        <Glyph className="pointer-events-none absolute -right-[10vw] -bottom-[12vw] size-[30vw] text-fizz-foreground/80 dark:text-fizz/80" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-10">
        <section className="pb-20">
          <Ledger />
        </section>
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
