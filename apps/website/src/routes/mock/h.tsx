import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Ledger } from "../../components/landing/ledger";
import { Hero, OneConfig, Phases } from "../../components/landing/sections";

export const Route = createFileRoute("/mock/h")({ component: MockH });

// H: the band is sized to its content and holds the hero and the Ledger.
// Everything explanatory lives below on the plain page.
function MockH() {
  return (
    <main>
      <div className="relative isolate -mt-14 overflow-hidden pt-14">
        <FizzBackground className="absolute inset-0 -z-10" />
        <div className="mx-auto w-full max-w-6xl px-6">
          <Hero />
          <section className="pb-20">
            <Ledger />
          </section>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-24">
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
