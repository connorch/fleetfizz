import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../../components/fizz/fizz-background";
import { Hero } from "../../components/landing/hero";
import { OneConfig, Phases } from "../../components/landing/sections";
import { ShipWire } from "../../components/landing/ship-wire";
import { ShipSection } from "../../components/landing/ship-section";

export const Route = createFileRoute("/mock/s")({ component: Mock, staticData: { bare: true } });

// S: the devices on a wire, below the fold.
function Mock() {
  return (
    <main>
      <FizzBackground />
      <Hero />
      <div className="mx-auto w-full max-w-6xl px-6 pt-16">
        <ShipSection graphic={<ShipWire className="self-start" />} />
        <OneConfig />
        <Phases />
      </div>
    </main>
  );
}
