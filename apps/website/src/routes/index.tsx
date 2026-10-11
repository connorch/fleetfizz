import { Button } from "@fleetfizz/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

// The landing page shell. Sections are placeholders to mock inside.
function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6">
      <section className="py-24">
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight">
          One config. Every machine.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg">
          fleetfizz keeps every Machine on your tailnet on the same toolchain and the same repos,
          installed from origin. No agent. Nothing runs in the background.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <code className="bg-muted rounded-md px-3 py-2 font-mono text-sm">
            <span className="text-fizz-foreground dark:text-fizz">$</span> vp install -g fleetfizz
          </code>
          <Button render={<Link to="/" />} nativeButton={false}>
            Read the docs
          </Button>
        </div>
      </section>
    </main>
  );
}
