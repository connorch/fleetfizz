import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Ledger } from "../../components/landing/ledger";
import { Hero, OneConfig, Phases } from "../../components/landing/sections";

export const Route = createFileRoute("/mock/f")({ component: MockF });

// F: the band fades into the page instead of ending, and the Ledger sits
// across the seam.
function MockF() {
  return (
    <main>
      <div className="relative isolate -mt-14 overflow-hidden pt-14">
        <FizzBackground className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_45%,transparent)]" />
        <Hero className="px-6 pb-56" />
      </div>
      <div className="mx-auto -mt-32 w-full max-w-6xl px-6">
        <section className="pb-20">
          <Ledger />
        </section>
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
