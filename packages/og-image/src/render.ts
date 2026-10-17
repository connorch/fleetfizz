import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { createElement as h } from "react";
import satori, { type Font } from "satori";
import { FONT } from "@fleetfizz/brand-assets";
import { Cover, HEIGHT, WIDTH } from "./cover.ts";

// React template -> SVG with satori -> PNG with resvg.

// Satori needs a font file per weight it is asked for.
const font = async (weight: NonNullable<Font["weight"]>): Promise<Font> => ({
  name: FONT,
  weight,
  data: await readFile(
    new URL(
      `../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff`,
      import.meta.url,
    ),
  ),
});

/** Rasterizes an SVG, scaled to `width` pixels wide. */
export const png = (svg: string, width: number) =>
  new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

/** The share image as a PNG, 1200x630. */
export async function cover() {
  const fonts = await Promise.all([font(400), font(700)]);
  const svg = await satori(h(Cover), { width: WIDTH, height: HEIGHT, fonts });
  return png(svg, WIDTH);
}
