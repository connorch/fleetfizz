import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Hero } from "../components/landing/hero";
import { OneConfig, Phases } from "../components/landing/sections";

export const Route = createFileRoute("/")({ component: Home, staticData: { bare: true } });

// The hero, then the config and the three phases of a Ship. The bubbles run
// only while the hero is on screen.
function Home() {
  const hero = useRef<HTMLDivElement>(null);
  return (
    <main>
      <FizzBackground behind={hero} />
      <Hero ref={hero} />
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
