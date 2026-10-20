import { createElement as h } from "react";
import { FIZZ, FONT, INK, NAME, SITE_URL, TAGLINE } from "../index.ts";
import { type Bubble, backdrop, glyph } from "./scene.ts";

// The share image: the hero as a 1200x630 card. The tagline top-left, the
// brand bottom-left, the URL bottom-right, and the scene's bubbles behind, on
// the right, so none sit under the text.
//
// Satori lays the card out, and it only supports flexbox and absolute
// positioning, so every box with children is an explicit flex box.
//
// The template is createElement calls rather than JSX so Node runs it as is:
// it strips types, but does not compile JSX.

export const WIDTH = 1200;
export const HEIGHT = 630;

// The scene: six bubbles over the glow, on the right, so none sit under the
// text.
const BUBBLES: ReadonlyArray<Bubble> = [
  { x: 640, y: -260, size: 760, depth: "near" },
  { x: 900, y: 250, size: 430, depth: "mid" },
  { x: 700, y: 330, size: 260, depth: "mid" },
  { x: 1010, y: 60, size: 200, depth: "mid" },
  { x: 760, y: 120, size: 120, depth: "far" },
  { x: 1100, y: 470, size: 160, depth: "far" },
];

export function Cover() {
  // The brand at 220px: two lines at 0.82 line height, the glyph beside "fizz".
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
    h("img", {
      src: backdrop(WIDTH, HEIGHT, BUBBLES),
      width: WIDTH,
      height: HEIGHT,
      style: { position: "absolute" },
    }),
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
        glyph(brand),
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
