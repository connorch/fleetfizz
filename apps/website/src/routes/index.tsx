import { createFileRoute } from "@tanstack/react-router";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Hero } from "../components/landing/hero";
import { OneConfig, Phases } from "../components/landing/sections";

export const Route = createFileRoute("/")({ component: Home, staticData: { bare: true } });

// The hero, then the config and the three phases of a Ship.
function Home() {
  return (
    <main>
      <FizzBackground />
      <Hero />
      {/* Opaque from here down: the bubbles are the hero's alone. */}
      <div className="bg-background">
        <div className="mx-auto w-full max-w-6xl px-6 pt-16">
          <OneConfig />
          <Phases />
        </div>
      </div>
    </main>
  );
}
