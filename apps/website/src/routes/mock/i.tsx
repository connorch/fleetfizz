import "@fontsource-variable/geist-mono";
import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Install, NEEDS } from "../../components/landing/content";
import { Ledger } from "../../components/landing/ledger";
import { OneConfig, Phases } from "../../components/landing/sections";
import { PosterNav, SectionList } from "../../components/poster/poster-nav";
import { Glyph } from "../../components/wordmark";

export const Route = createFileRoute("/mock/i")({ component: MockI, staticData: { bare: true } });

// I: a poster. Brand top-left, links top-right, the glyph as the object in
// the middle, the tagline and install bottom-left, the docs index
// bottom-right. Geist Mono.
function MockI() {
  return (
    <main className="font-mono [--font-mono:'Geist_Mono_Variable',monospace] [--font-sans:var(--font-mono)]">
      <FizzBackground />
      <div className="flex min-h-svh flex-col p-6 sm:p-10">
        <PosterNav />
        <div className="relative flex flex-1 items-center justify-center py-6">
          <Glyph className="size-[min(40vh,45vw)] text-fizz-foreground/90 dark:text-fizz" />
          <span className="absolute top-1/2 left-1/2 ml-[min(21vh,23vw)] -translate-y-[min(13vh,15vw)] text-[11px] tracking-[0.12em] whitespace-nowrap uppercase">
            ◀ one command, every machine
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <p className="text-xl leading-tight">
              Every machine.
              <br />
              One config.
            </p>
            <p className="mt-2 max-w-md text-sm text-foreground/70">
              The same toolchain and the same repos on every Machine on your tailnet, installed from
              origin.
            </p>
            <Install className="mt-5" />
          </div>
          <SectionList />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-10">
        <section className="pb-20">
          <Ledger />
        </section>
        <OneConfig />
        <Phases />
        <p className="pb-16 font-mono text-xs text-foreground/60">
          {NEEDS.map(([, v]) => v).join("  ·  ")}
        </p>
      </div>
    </main>
  );
}
