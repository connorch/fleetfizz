import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { type ReactElement, createElement as h } from "react";
import satori, { type Font } from "satori";
import { FONT } from "../index.ts";
import * as banner from "./banner.ts";
import * as cover from "./cover.ts";

// React template -> SVG with satori -> PNG with resvg.

// Satori needs a font file per weight it is asked for.
const font = async (weight: NonNullable<Font["weight"]>): Promise<Font> => ({
  name: FONT,
  weight,
  data: await readFile(
    new URL(
      `../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff`,
      import.meta.url,
    ),
  ),
});

/** Rasterizes an SVG, scaled to `width` pixels wide. */
export const png = (svg: string, width: number) =>
  new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

/** Lays a template out with satori and rasterizes it at `scale`x. */
async function render(element: ReactElement, width: number, height: number, scale = 1) {
  const fonts = await Promise.all([font(400), font(700)]);
  const svg = await satori(element, { width, height, fonts });
  return png(svg, width * scale);
}

/** The share image as a PNG, 1200x630. */
export const shareImage = () => render(h(cover.Cover), cover.WIDTH, cover.HEIGHT);

/** The README banner as a PNG at 2x, for sharp text on high-density screens. */
export const readmeBanner = () => render(h(banner.Banner), banner.WIDTH, banner.HEIGHT, 2);
