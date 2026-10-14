import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Hero } from "../../components/landing/hero";
import { OneConfig, Phases } from "../../components/landing/sections";
import { ShipMap } from "../../components/landing/ship-map";
import { ShipSection } from "../../components/landing/ship-section";

export const Route = createFileRoute("/mock/t")({ component: Mock, staticData: { bare: true } });

// T: the tailnet map that glides into a line, below the fold.
function Mock() {
  return (
    <main>
      <FizzBackground />
      <Hero />
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <ShipSection graphic={<ShipMap className="self-start" />} />
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
