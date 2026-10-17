import { FIZZ, FONT, GLYPH, INK, NAME, SITE_URL, TAGLINE } from "@fleetfizz/brand-assets";
import { createElement as h } from "react";

// The share image: the hero as a 1200x630 card. The tagline top-left, the
// brand bottom-left, the URL bottom-right, and the scene's bubbles behind, on
// the right, so none sit under the text.
//
// Satori lays the card out, and it only supports flexbox and absolute
// positioning, so every box with children is an explicit flex box. It has no
// blur or blend modes either, so the backdrop is a hand-written SVG that
// resvg rasterizes with the rest.
//
// The template is createElement calls rather than JSX so Node runs it as is:
// it strips types, but does not compile JSX.

export const WIDTH = 1200;
export const HEIGHT = 630;

// The scene: a glow low on the right, and six bubbles over it, screened so
// overlaps add up. Each bubble is a translucent olive sphere with a brighter
// rim, blurred more the nearer it is, since the near ones are out of focus.
const DEPTH = {
  near: { blur: 16, opacity: 0.85 },
  mid: { blur: 5, opacity: 1 },
  far: { blur: 3, opacity: 0.7 },
};
const BUBBLES: Array<{ x: number; y: number; size: number; depth: keyof typeof DEPTH }> = [
  { x: 640, y: -260, size: 760, depth: "near" },
  { x: 900, y: 250, size: 430, depth: "mid" },
  { x: 700, y: 330, size: 260, depth: "mid" },
  { x: 1010, y: 60, size: 200, depth: "mid" },
  { x: 760, y: 120, size: 120, depth: "far" },
  { x: 1100, y: 470, size: 160, depth: "far" },
];

const svg = (markup: string) =>
  `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;

/** The backdrop as an SVG data URI: ink, the glow, then the bubbles. */
function backdrop() {
  // The glow: an ellipse 60% wide and 50% tall, centered just under the
  // bottom-right, fading out by 70% of its radius.
  const [gx, gy, grx, gry] = [WIDTH * 0.78, HEIGHT * 1.08, WIDTH * 0.6, HEIGHT * 0.5];
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
  const bubbles = BUBBLES.map(
    ({ x, y, size, depth }) =>
      `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="url(#sphere)" filter="url(#${depth})" opacity="${DEPTH[depth].opacity}" style="mix-blend-mode:screen"/>`,
  ).join("");
  return svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><defs>${glow}${sphere}${blurs}</defs><rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>${bubbles}</svg>`,
  );
}

export function Cover() {
  // The brand at 220px: two lines at 0.82 line height, the glyph beside
  // "fizz" at 0.82em, sitting 0.05em below the baseline like the site's.
  const brand = 220;
  return h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        width: WIDTH,
        height: HEIGHT,
        background: INK,
        fontFamily: FONT,
        color: "#fff",
      },
    },
    h("img", { src: backdrop(), width: WIDTH, height: HEIGHT, style: { position: "absolute" } }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 72,
          top: 64,
          width: 800,
          fontSize: 28,
          lineHeight: 1.35,
        },
      },
      h("span", { style: { fontWeight: 700 } }, TAGLINE.lead),
      h("span", { style: { color: "rgba(255,255,255,0.7)" } }, TAGLINE.rest),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 60,
          bottom: 52,
          fontSize: brand,
          fontWeight: 700,
          lineHeight: 0.82,
          letterSpacing: -0.06 * brand,
        },
      },
      h("span", null, NAME.slice(0, 5)),
      h(
        "div",
        { style: { display: "flex", alignItems: "flex-end", color: FIZZ } },
        h("span", null, NAME.slice(5)),
        h(
          "svg",
          {
            viewBox: `0 0 ${GLYPH.box} ${GLYPH.box}`,
            width: 0.82 * brand,
            height: 0.82 * brand,
            style: { marginLeft: 0.14 * brand, marginBottom: -0.05 * brand },
          },
          ...GLYPH.circles.map((c) => h("circle", { key: c.cx, ...c, fill: FIZZ })),
        ),
      ),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          position: "absolute",
          right: 72,
          bottom: 64,
          fontSize: 22,
          color: "rgba(255,255,255,0.55)",
        },
      },
      SITE_URL.replace("https://", ""),
    ),
  );
}
