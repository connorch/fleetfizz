import { cn } from "@fleetfizz/ui/lib/utils";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Palette } from "./bubbles";

// The scene is client-only: the prerendered page is the plain fizz backdrop,
// and the bubbles fade in over it once the canvas has rendered a frame.
const Bubbles = lazy(() => import("./bubbles"));

// Computed styles come back as oklch(), which three cannot parse, so each
// color is resolved to rgb() by painting it on a 1x1 canvas.
const toRgb = (ctx: CanvasRenderingContext2D, color: string): string => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
};

// Reads the palette from the backdrop's computed style, so the Tailwind
// classes on it decide the look per theme, and a theme toggle re-reads it.
function usePalette(ref: React.RefObject<HTMLDivElement | null>): Palette | undefined {
  const [palette, setPalette] = useState<Palette>();
  useEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const read = () => {
      if (!ref.current || !ctx) return;
      const style = getComputedStyle(ref.current);
      const prop = (name: string) => style.getPropertyValue(name).trim();
      setPalette({
        background: toRgb(ctx, style.backgroundColor),
        bubble: toRgb(ctx, style.color),
        glow: toRgb(ctx, prop("--glow")),
        emissive: Number(prop("--bubble-emissive")),
        rim: Number(prop("--bubble-rim")),
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [ref]);
  return palette;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// `className` positions the scene: fixed behind the whole page by default, or
// absolute inside a band that scrolls away.
export function FizzBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const palette = usePalette(ref);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);

  return (
    // Light: fizz backdrop, clear bubbles. Dark: the abyss, a lime glow deep
    // within, and luminescent bubbles. `color` is the bubble color.
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "bg-fizz text-white [--bubble-emissive:0.4] [--bubble-rim:1.1] [--glow:var(--color-fizz)] [--scene-opacity:0.8] dark:bg-[oklch(0.12_0.015_130)] dark:text-fizz dark:[--bubble-emissive:0.7] dark:[--bubble-rim:1.6] dark:[--glow:oklch(0.48_0.17_125)] dark:[--scene-opacity:0.28]",
        className ?? "fixed inset-0 -z-10",
      )}
    >
      {/* Slightly out of focus. Oversized so the blur has no soft edge. The
          scene stays dimmed in dark mode so the text reads over it. The
          fade-in is a one-shot animation, not a transition, so a theme
          switch changes the opacity at once. */}
      <div
        className={cn("absolute -inset-6 blur-[5px]", ready && "animate-reveal")}
        style={{ opacity: ready ? "var(--scene-opacity)" : 0 }}
      >
        {palette && (
          <Suspense fallback={null}>
            <Bubbles palette={palette} animate={!reduced} onReady={() => setReady(true)} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
