import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { ConfigExample } from "../../components/landing/config-example";
import { DocsButton, Install, Needs, PHASES } from "../../components/landing/content";
import { Ledger } from "../../components/landing/ledger";

export const Route = createFileRoute("/mock/a")({ component: MockA });

// A: the Ledger is the hero. Left-aligned, terminal first, prose second.
function MockA() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6">
      <FizzBackground />
      <section className="pt-20 pb-10">
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight">
          One config. Every machine.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-foreground/75">
          fleetfizz keeps every Machine on your tailnet on the same toolchain and the same repos,
          installed from origin. No agent. Nothing runs in the background.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Install />
          <DocsButton />
        </div>
      </section>

      <section className="pb-16">
        <Ledger />
      </section>

      <section className="grid gap-10 pb-16 md:grid-cols-[1fr_1.25fr]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">One config</h2>
          <p className="mt-3 text-foreground/75">
            One file names the Fleet, the Tracked Repos, and the vp section. Every Ship copies it to
            every Machine, so any Machine can ship next.
          </p>
          <h2 className="mt-10 text-2xl font-semibold tracking-tight">What you need</h2>
          <Needs className="mt-4" />
        </div>
        <ConfigExample />
      </section>

      <section className="pb-24">
        <h2 className="text-2xl font-semibold tracking-tight">A Ship, in four phases</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map(([name, body], i) => (
            <li key={name} className="border-t border-foreground/30 pt-3">
              <div className="font-mono text-xs text-foreground/50">0{i + 1}</div>
              <div className="mt-1 font-semibold">{name}</div>
              <p className="mt-1 text-sm text-foreground/70">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
