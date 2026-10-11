import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { ConfigExample } from "../../components/landing/config-example";
import { DocsButton, Install, Needs, PHASES } from "../../components/landing/content";
import { Ledger } from "../../components/landing/ledger";

export const Route = createFileRoute("/mock/c")({ component: MockC });

// C: dense. The config sits in the hero next to the promise; everything
// above the fold.
function MockC() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6">
      <FizzBackground />
      <section className="grid items-start gap-12 pt-16 pb-14 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Keep every machine on your tailnet{" "}
            <span className="underline decoration-fizz decoration-4 underline-offset-4 dark:decoration-fizz/70">
              in line with one config.
            </span>
          </h1>
          <p className="mt-5 text-foreground/75">
            The vp toolchain, its Globals at semver Ranges, and a clone of each Tracked Repo
            installed from origin. <code className="font-mono text-sm">fizz ship</code> runs on one
            Machine and drives the rest over Tailscale SSH.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Install />
            <DocsButton />
          </div>
          <Needs className="mt-10" />
        </div>
        <ConfigExample />
      </section>

      <section className="pb-14">
        <Ledger />
      </section>

      <section className="grid gap-10 pb-24 lg:grid-cols-[auto_1fr]">
        <h2 className="text-2xl font-semibold tracking-tight lg:w-56">How a Ship works</h2>
        <ol className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {PHASES.map(([name, body], i) => (
            <li key={name} className="flex gap-4">
              <span className="font-mono text-sm text-fizz-foreground dark:text-fizz">{i + 1}</span>
              <div>
                <div className="font-semibold">{name}</div>
                <p className="mt-1 text-sm text-foreground/70">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
