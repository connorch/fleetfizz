import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Hero } from "../../components/landing/hero";
import { OneConfig, Phases } from "../../components/landing/sections";
import { ShipGrid } from "../../components/landing/ship-grid";
import { ShipSection } from "../../components/landing/ship-section";

export const Route = createFileRoute("/mock/q")({ component: Mock, staticData: { bare: true } });

// Q: the versions grid, below the fold.
function Mock() {
  return (
    <main>
      <FizzBackground />
      <Hero />
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <ShipSection graphic={<ShipGrid className="self-start" />} />
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
