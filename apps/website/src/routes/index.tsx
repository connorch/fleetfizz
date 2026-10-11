import { Button } from "@fleetfizz/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FizzBackground } from "../components/fizz/fizz-background";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6">
      <FizzBackground />
      <section className="py-24">
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight">
          One config. Every machine.
        </h1>
        <p className="mt-5 max-w-xl text-lg opacity-80">
          fleetfizz keeps every Machine on your tailnet on the same toolchain and the same repos,
          installed from origin. No agent. Nothing runs in the background.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <code className="bg-foreground/10 rounded-md px-3 py-2 font-mono text-sm">
            $ vp install -g fleetfizz
          </code>
          <Button render={<Link to="/" />} nativeButton={false}>
            Read the docs
          </Button>
        </div>
      </section>
    </main>
  );
}
