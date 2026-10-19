import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { FallInLine } from "../components/landing/fall-in-line";
import { FizzBackground } from "../components/fizz/fizz-background";
import { Hero } from "../components/landing/hero";
import { PosterHeader } from "../components/poster/poster-nav";
import { OneCommand, OneConfig, Phases, Why } from "../components/landing/sections";

export const Route = createFileRoute("/")({ component: Home, staticData: { chrome: "poster" } });

// The hero, then why fleetfizz exists, the Fleet falling in line, Check and
// Apply, the config, and the command. The bubbles run only while the hero is
// on screen.
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
            air on top and ~16px under its labels). Why and the loop read as one
            opening, about 120px apart. The sections under it are bigger
            blocks and get about 176px. A phone
            scrolls a narrow column, so below md both shrink by about a third,
            and the loop, a two by two grid there, runs to the screen's edges. */}
        <div className="mx-auto w-full max-w-6xl px-6 pt-16 pb-28 md:pt-28 md:pb-44">
          <Why />
          <FallInLine className="mt-14 mb-24 max-md:-mx-6 md:mt-24 md:mb-40" />
          <Phases />
          <OneConfig className="mt-28 md:mt-44" />
          <OneCommand className="mt-28 md:mt-44" />
        </div>
      </div>
    </main>
  );
}
