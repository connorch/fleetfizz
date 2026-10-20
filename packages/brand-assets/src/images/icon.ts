import { FIZZ, GLYPH, INK } from "../index.ts";

// The icons: the glyph, hand-written as SVG since it is three circles. The
// generator rasterizes it for the sizes that need a bitmap.

const circles = GLYPH.circles.map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}"/>`).join("");

/** The favicon: the glyph on a transparent square, for browser tabs. */
export const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLYPH.box} ${GLYPH.box}" fill="${FIZZ}">${circles}</svg>`;

/**
 * The touch icon: the glyph at 62% on ink, since home screens mask icons
 * themselves and turn transparency black.
 */
export const TOUCH = 180;
const inset = 0.19;
export const touchIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TOUCH} ${TOUCH}"><rect width="${TOUCH}" height="${TOUCH}" fill="${INK}"/><g transform="translate(${inset * TOUCH} ${inset * TOUCH}) scale(${((1 - 2 * inset) * TOUCH) / GLYPH.box})" fill="${FIZZ}">${circles}</g></svg>`;
