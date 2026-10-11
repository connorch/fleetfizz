import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Ledger } from "../../components/landing/ledger";
import { Hero, OneConfig, Phases } from "../../components/landing/sections";

export const Route = createFileRoute("/mock/e")({ component: MockE });

// E: a viewport-tall band holds the bubbles and the hero. Hard edge, then
// the rest of the page on the plain background.
function MockE() {
  return (
    <main>
      <div className="relative isolate -mt-14 flex min-h-svh flex-col overflow-hidden pt-14">
        <FizzBackground className="absolute inset-0 -z-10" />
        <Hero className="my-auto px-6 py-16" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pt-20">
        <section className="pb-20">
          <Ledger />
        </section>
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
