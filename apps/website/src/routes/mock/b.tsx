import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { ConfigExample } from "../../components/landing/config-example";
import { DocsButton, Install, NEEDS, PHASES } from "../../components/landing/content";
import { Ledger } from "../../components/landing/ledger";

export const Route = createFileRoute("/mock/b")({ component: MockB });

// B: centered, big type, the bubbles get room. Ledger and config side by side.
function MockB() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6">
      <FizzBackground />
      <section className="flex flex-col items-center pt-28 pb-20 text-center">
        <h1 className="max-w-3xl text-6xl font-semibold tracking-tighter sm:text-7xl">
          Every machine.
          <br />
          One config.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-foreground/75">
          The same toolchain and the same repos on every Machine on your tailnet, installed from
          origin. One command on any Machine brings the rest in line.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Install />
          <DocsButton />
        </div>
        <p className="mt-6 font-mono text-xs text-foreground/60">
          {NEEDS.map(([, v]) => v).join("  ·  ")}
        </p>
      </section>

      <section className="grid gap-6 pb-20 lg:grid-cols-2">
        <div>
          <div className="mb-2 font-mono text-xs text-foreground/60">fizz ship</div>
          <Ledger className="h-full" />
        </div>
        <div>
          <div className="mb-2 font-mono text-xs text-foreground/60">
            ~/.config/fleetfizz/fleet.config.jsonc
          </div>
          <ConfigExample className="h-full" />
        </div>
      </section>

      <section className="pb-28">
        <ol className="grid gap-px overflow-hidden rounded-lg border bg-foreground/15 sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map(([name, body], i) => (
            <li key={name} className="bg-background/55 p-5 backdrop-blur-sm">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-fizz-foreground dark:text-fizz">
                  0{i + 1}
                </span>
                <span className="text-lg font-semibold">{name}</span>
              </div>
              <p className="mt-2 text-sm text-foreground/70">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
