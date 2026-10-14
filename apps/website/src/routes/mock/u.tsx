import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Hero } from "../../components/landing/hero";
import { OneConfig, Phases } from "../../components/landing/sections";
import { ShipRail } from "../../components/landing/ship-rail";

export const Route = createFileRoute("/mock/u")({ component: Mock, staticData: { bare: true } });

// U: the Fleet on a rail across the page, no box, below the fold.
function Mock() {
  return (
    <main>
      <FizzBackground />
      <Hero />
      <ShipRail />
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
