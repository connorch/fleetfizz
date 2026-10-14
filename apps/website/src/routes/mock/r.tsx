import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Hero } from "../../components/landing/hero";
import { Ledger } from "../../components/landing/ledger";
import { OneConfig, Phases } from "../../components/landing/sections";
import { ShipInLine } from "../../components/landing/ship-in-line";

export const Route = createFileRoute("/mock/r")({ component: Mock, staticData: { bare: true } });

// R: the Fleet in line above the fold, in the Ledger's place. The Ledger
// opens the page below it.
function Mock() {
  return (
    <main>
      <FizzBackground />
      <Hero aside={<ShipInLine className="w-full shrink-0 wide:my-auto wide:w-[600px]" />} />
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <section className="pb-20">
          <Ledger className="w-full" />
        </section>
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
