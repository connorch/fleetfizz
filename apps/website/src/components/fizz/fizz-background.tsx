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

// Reads the colors from the backdrop's computed style, so Tailwind's theme
// classes decide them and a theme toggle re-reads them.
function usePalette(ref: React.RefObject<HTMLDivElement | null>): Palette | undefined {
  const [palette, setPalette] = useState<Palette>();
  useEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const read = () => {
      if (!ref.current || !ctx) return;
      const style = getComputedStyle(ref.current);
      setPalette({
        background: toRgb(ctx, style.backgroundColor),
        bubble: toRgb(ctx, style.color),
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

export function FizzBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const palette = usePalette(ref);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="bg-fizz text-white dark:bg-background dark:text-fizz fixed inset-0 -z-10"
    >
      <div
        className="absolute inset-0 transition-opacity duration-1000 ease-out"
        style={{ opacity: ready ? 1 : 0 }}
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
