import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Ledger } from "../../components/landing/ledger";
import { Hero, OneConfig, Phases } from "../../components/landing/sections";

export const Route = createFileRoute("/mock/g")({ component: MockG });

// G: the scene stays fixed behind the hero, and the rest of the page is a
// solid surface that slides up over it as you scroll.
function MockG() {
  return (
    <main>
      <FizzBackground />
      <div className="-mt-14 flex min-h-svh flex-col pt-14">
        <Hero className="my-auto px-6 py-16" />
      </div>
      <div className="bg-background relative">
        <div className="mx-auto w-full max-w-6xl px-6 pt-20">
          <section className="pb-20">
            <Ledger />
          </section>
          <OneConfig />
          <Phases />
        </div>
      </div>
    </main>
  );
}
