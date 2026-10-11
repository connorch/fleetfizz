import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { ConfigExample } from "../../components/landing/config-example";
import { DocsButton, Install, NEEDS, PHASES } from "../../components/landing/content";
import { Ledger } from "../../components/landing/ledger";

export const Route = createFileRoute("/mock/d")({ component: MockD });

// D: B's centered hero over a full-width Ledger, then config and phases.
function MockD() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6">
      <FizzBackground />
      <section className="flex flex-col items-center pt-28 pb-16 text-center">
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

      <section className="pb-20">
        <Ledger />
      </section>

      <section className="grid gap-10 pb-20 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">One config</h2>
          <p className="mt-3 text-foreground/75">
            One file names the Fleet, the Tracked Repos, and the vp section. It lives at{" "}
            <code className="font-mono text-sm">~/.config/fleetfizz/fleet.config.jsonc</code>, and
            every Ship copies it to every Machine, so any Machine can ship next.
          </p>
        </div>
        <ConfigExample />
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
