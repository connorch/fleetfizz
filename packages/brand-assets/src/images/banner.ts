import { createElement as h } from "react";
import { FIZZ, FONT, INK, INSTALL, NAME, TAGLINE } from "../index.ts";
import { type Bubble, backdrop, glyph } from "./scene.ts";

// The README banner, for GitHub and npm: the brand and the lead on the left,
// the three commands that get a Fleet going on the right, and the bubbles
// behind. Same rules as the share image: flex boxes only, createElement
// instead of JSX.

export const WIDTH = 1280;
export const HEIGHT = 360;

const BUBBLES: ReadonlyArray<Bubble> = [
  { x: 620, y: -380, size: 640, depth: "near" },
  { x: 1080, y: 210, size: 260, depth: "mid" },
  { x: 560, y: 250, size: 150, depth: "far" },
  { x: 1190, y: 20, size: 100, depth: "far" },
];

const COMMANDS = [INSTALL, "fizz init", "fizz ship"];

/** A command after a lime prompt: its program bold, the rest dimmed. */
const command = (line: string) => {
  const [program, ...rest] = line.split(" ");
  return h(
    "div",
    { key: line, style: { display: "flex", whiteSpace: "pre" } },
    h("span", { style: { color: FIZZ } }, "$ "),
    h("span", { style: { fontWeight: 700 } }, program),
    h("span", { style: { color: "rgba(255,255,255,0.7)" } }, ` ${rest.join(" ")}`),
  );
};

export function Banner() {
  // The brand at 104px on one line, the glyph beside "fizz".
  const brand = 104;
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
      src: backdrop(WIDTH, HEIGHT, BUBBLES, 0.7),
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
          top: 100,
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "flex-end",
            fontSize: brand,
            fontWeight: 700,
            lineHeight: 0.82,
            letterSpacing: -0.06 * brand,
          },
        },
        h("span", null, NAME.slice(0, 5)),
        h("span", { style: { color: FIZZ } }, NAME.slice(5)),
        glyph(brand),
      ),
      h("span", { style: { marginTop: 36, fontSize: 26, fontWeight: 700 } }, TAGLINE.lead),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 760,
          top: 104,
          fontSize: 30,
          lineHeight: 1.7,
        },
      },
      ...COMMANDS.map(command),
    ),
  );
}
