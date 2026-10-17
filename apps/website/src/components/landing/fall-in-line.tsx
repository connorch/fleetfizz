import darkHevc from "@fleetfizz/video/renders/fall-in-line-dark.mov";
import darkWebm from "@fleetfizz/video/renders/fall-in-line-dark.webm";
import lightHevc from "@fleetfizz/video/renders/fall-in-line-light.mov";
import lightWebm from "@fleetfizz/video/renders/fall-in-line-light.webm";
import { cn } from "@fleetfizz/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useDark } from "../theme-toggle";

// Its colors are baked in, so packages/video renders it once per theme.
const RENDERS = {
  dark: { hevc: darkHevc, webm: darkWebm },
  light: { hevc: lightHevc, webm: lightWebm },
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
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);
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
  // Runs again on a theme switch, which mounts a new <video>.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) el.currentTime = STILL;
    // play() rejects when a pause interrupts it, which is expected here.
    else if (near) el.play().catch(() => {});
    else el.pause();
  }, [near, seen, theme]);
  const { hevc, webm } = RENDERS[theme];
  return (
    <div ref={box} aria-hidden="true" className={cn("aspect-[4/1]", className)}>
      {seen ? (
        // Keyed by theme: a <video> reads its sources once, so a theme switch
        // swaps in a new element.
        <video key={theme} ref={video} loop muted playsInline className="block size-full">
          <source src={hevc} type='video/mp4; codecs="hvc1"' />
          <source src={webm} type="video/webm" />
        </video>
      ) : null}
    </div>
  );
}
