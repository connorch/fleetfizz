import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Ledger } from "../components/landing/ledger";
import { Hero, OneConfig, Phases } from "../components/landing/sections";

export const Route = createFileRoute("/")({ component: Home });

// The landing page: centered hero, the full-width Ledger, the config, and
// the four phases of a Ship, all over the fixed bubble scene.
function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6">
      <FizzBackground />
      <Hero />
      <section className="pb-20">
        <Ledger />
      </section>
      <OneConfig />
      <Phases />
    </main>
  );
}
