import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Hero } from "../../components/landing/hero";
import { OneConfig, Phases } from "../../components/landing/sections";
import { ShipInLine } from "../../components/landing/ship-in-line";
import { ShipSection } from "../../components/landing/ship-section";

export const Route = createFileRoute("/mock/p")({ component: Mock, staticData: { bare: true } });

// P: the Fleet in line, below the fold.
function Mock() {
  return (
    <main>
      <FizzBackground />
      <Hero />
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <ShipSection graphic={<ShipInLine className="self-start" />} />
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
