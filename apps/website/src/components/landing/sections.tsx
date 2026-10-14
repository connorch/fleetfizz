import { cn } from "@fleetfizz/ui/lib/utils";
import { ConfigExample } from "./config-example";
import { DocsButton, Install, NEEDS, PHASES } from "./content";

// The landing page sections, shared by the homepage and its mocks so a copy
// change lands everywhere at once.

export function Hero({ className }: { className?: string }) {
  return (
    <section className={cn("flex flex-col items-center pt-28 pb-16 text-center", className)}>
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
  );
}

export function OneConfig({ className }: { className?: string }) {
  return (
    <section className={cn("grid gap-10 pb-20 lg:grid-cols-[1fr_1.4fr]", className)}>
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
  );
}

export function Phases({ className }: { className?: string }) {
  return (
    <section className={cn("pb-28", className)}>
      <ol className="grid gap-px overflow-hidden rounded-lg border bg-foreground/15 sm:grid-cols-3">
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
  );
}
