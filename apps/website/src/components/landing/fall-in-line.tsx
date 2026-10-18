import gridDarkHevc from "@fleetfizz/video/renders/fall-in-line-grid-dark.mov";
import gridDarkWebm from "@fleetfizz/video/renders/fall-in-line-grid-dark.webm";
import gridLightHevc from "@fleetfizz/video/renders/fall-in-line-grid-light.mov";
import gridLightWebm from "@fleetfizz/video/renders/fall-in-line-grid-light.webm";
import wideDarkHevc from "@fleetfizz/video/renders/fall-in-line-wide-dark.mov";
import wideDarkWebm from "@fleetfizz/video/renders/fall-in-line-wide-dark.webm";
import wideLightHevc from "@fleetfizz/video/renders/fall-in-line-wide-light.mov";
import wideLightWebm from "@fleetfizz/video/renders/fall-in-line-wide-light.webm";
import { cn } from "@fleetfizz/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery, useReducedMotion } from "../../lib/use-media-query";
import { useDark } from "../theme-toggle";

// packages/video draws it twice: a 4:1 strip from md up, and a two by two grid
// on phones, where the strip's labels are too small to read. Its colors are
// baked in, so each is rendered once per theme.
const RENDERS = {
  wide: {
    dark: { hevc: wideDarkHevc, webm: wideDarkWebm },
    light: { hevc: wideLightHevc, webm: wideLightWebm },
  },
  grid: {
    dark: { hevc: gridDarkHevc, webm: gridDarkWebm },
    light: { hevc: gridLightHevc, webm: gridLightWebm },
  },
};

// Seconds in: the end of the first round, every machine caught up, which is
// all a reduced-motion visitor sees.
const STILL = 4;

// The fall-in-line loop from packages/video: each machine in turn ships a
// change and the rest fall in line. It is transparent, so Safari takes the
// HEVC with alpha and Chrome and Firefox skip it for the WebM.
//
// The page never waits on it: the <video> is not in the server HTML, and
// mounts only after the page has loaded, once its box comes within half a
// screen of the viewport. It pauses whenever the box is out of that range.
export function FallInLine({ className }: { className?: string }) {
  const theme = useDark() ? "dark" : "light";
  // Tailwind's md breakpoint, where the box's aspect ratio switches too.
  const shape = useMediaQuery("(min-width: 48rem)") ? "wide" : "grid";
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isNear = entry?.isIntersecting ?? false;
        setNear(isNear);
        if (isNear) setSeen(true);
      },
      { rootMargin: "50% 0px" },
    );
    const observe = () => observer.observe(el);
    if (document.readyState === "complete") observe();
    else addEventListener("load", observe, { once: true });
    return () => {
      removeEventListener("load", observe);
      observer.disconnect();
    };
  }, []);
  // Runs again when a theme switch or crossing md mounts a new <video>, and
  // when the reduced-motion setting changes, which stops it on the still.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (reduced) {
      el.pause();
      el.currentTime = STILL;
    }
    // play() rejects when a pause interrupts it, which is expected here.
    else if (near) el.play().catch(() => {});
    else el.pause();
  }, [near, seen, theme, shape, reduced]);
  const { hevc, webm } = RENDERS[shape][theme];
  return (
    <div ref={box} aria-hidden="true" className={cn("aspect-[440/463] md:aspect-[4/1]", className)}>
      {seen ? (
        // Keyed by render: a <video> reads its sources once, so a new render
        // swaps in a new element.
        <video
          key={`${shape}-${theme}`}
          ref={video}
          loop
          muted
          playsInline
          className="block size-full"
        >
          <source src={hevc} type='video/mp4; codecs="hvc1"' />
          <source src={webm} type="video/webm" />
        </video>
      ) : null}
    </div>
  );
}
