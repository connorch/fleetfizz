import { createElement as h } from "react";
import { FIZZ, GLYPH, INK } from "../index.ts";

// The pieces the share image and the README banner both draw: the bubble
// backdrop and the glyph.
//
// Satori has no blur or blend modes, so the backdrop is a hand-written SVG
// that resvg rasterizes with the rest.

export type Bubble = { x: number; y: number; size: number; depth: keyof typeof DEPTH };

// Each bubble is a translucent olive sphere with a brighter rim, blurred more
// the nearer it is, since the near ones are out of focus.
const DEPTH = {
  near: { blur: 16, opacity: 0.85 },
  mid: { blur: 5, opacity: 1 },
  far: { blur: 3, opacity: 0.7 },
};

const svg = (markup: string) =>
  `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;

/**
 * The backdrop as an SVG data URI: ink, a glow low on the right, then the
 * bubbles, screened so overlaps add up. The glow is an ellipse 60% wide and
 * `glowHeight` tall, centered just under the bottom-right, fading out by 70%
 * of its radius.
 */
export function backdrop(
  width: number,
  height: number,
  bubbles: ReadonlyArray<Bubble>,
  glowHeight = 0.5,
) {
  const [gx, gy, grx, gry] = [width * 0.78, height * 1.08, width * 0.6, height * glowHeight];
  const glow = `<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${gx}" cy="${gy}" r="${grx}" gradientTransform="translate(0 ${gy}) scale(1 ${gry / grx}) translate(0 ${-gy})"><stop offset="0" stop-color="rgb(80,120,20)" stop-opacity="0.5"/><stop offset="0.7" stop-color="rgb(80,120,20)" stop-opacity="0"/></radialGradient>`;
  // The sphere: the gradient reaches the box's corner (CSS's farthest-corner),
  // so the bubble's edge is at 71% of it, inside the bright rim; the blur
  // then softens the cut edge.
  const sphere = `<radialGradient id="sphere" r="${Math.SQRT1_2}"><stop offset="0" stop-color="rgb(105,145,35)" stop-opacity="0.3"/><stop offset="0.6" stop-color="rgb(105,145,35)" stop-opacity="0.3"/><stop offset="0.86" stop-color="rgb(150,200,55)" stop-opacity="0.52"/><stop offset="0.95" stop-color="rgb(150,200,55)" stop-opacity="0.22"/><stop offset="1" stop-color="rgb(150,200,55)" stop-opacity="0"/></radialGradient>`;
  const blurs = Object.entries(DEPTH)
    .map(
      ([depth, { blur }]) =>
        `<filter id="${depth}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="${blur}"/></filter>`,
    )
    .join("");
  const circles = bubbles
    .map(
      ({ x, y, size, depth }) =>
        `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="url(#sphere)" filter="url(#${depth})" opacity="${DEPTH[depth].opacity}" style="mix-blend-mode:screen"/>`,
    )
    .join("");
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${glow}${sphere}${blurs}</defs><rect width="${width}" height="${height}" fill="${INK}"/><rect width="${width}" height="${height}" fill="url(#glow)"/>${circles}</svg>`,
  );
}

/**
 * The glyph beside "fizz" in a wordmark `brand` px tall: 0.82em, sitting
 * 0.05em below the baseline like the site's.
 */
export const glyph = (brand: number) =>
  h(
    "svg",
    {
      viewBox: `0 0 ${GLYPH.box} ${GLYPH.box}`,
      width: 0.82 * brand,
      height: 0.82 * brand,
      style: { marginLeft: 0.14 * brand, marginBottom: -0.05 * brand },
    },
    ...GLYPH.circles.map((c) => h("circle", { key: c.cx, ...c, fill: FIZZ })),
  );
