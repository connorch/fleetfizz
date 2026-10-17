import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { FallInLine } from "../components/landing/fall-in-line";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Hero } from "../components/landing/hero";
import { PosterHeader } from "../components/poster/poster-nav";
import { OneCommand, OneConfig, Phases } from "../components/landing/sections";

export const Route = createFileRoute("/")({ component: Home, staticData: { chrome: "poster" } });

// The hero, then Check and Apply, the Fleet falling in line, the config, and
// the command. The bubbles run only while the hero is on screen.
function Home() {
  const hero = useRef<HTMLDivElement>(null);
  const brand = useRef<HTMLAnchorElement>(null);
  return (
    <main>
      <FizzBackground behind={hero} />
      <PosterHeader brand={brand} />
      <Hero ref={hero} brand={brand} />
      {/* An 8rem fade from the bubbles to the page, centered on the fold: its top
          half sits behind the hero's content, its bottom half below the fold. Opaque
          from there down: the bubbles are the hero's alone. */}
      <div
        aria-hidden="true"
        className="relative -z-5 -mt-16 h-32 bg-linear-to-b from-transparent to-background"
      />
      <div className="bg-background">
        {/* Two rhythms, measured to what shows (the loop's frame has ~30px of
            air on top and ~16px under its labels). Check and Apply and the
            loop read as one opening, about 120px apart. The text-heavy
            sections under it are bigger blocks and get about 176px. */}
        <div className="mx-auto w-full max-w-6xl px-6 pt-28 pb-44">
          <Phases />
          <FallInLine className="mt-24 mb-40" />
          <OneConfig />
          <OneCommand className="mt-44" />
        </div>
      </div>
    </main>
  );
}
