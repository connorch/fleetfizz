// The brand, in one place: the name and copy, the colors, the typeface, and
// the glyph's geometry. Plain data, so each consumer draws it its own way:
// apps/website with Tailwind, packages/og-image for the share image and the
// favicons, packages/video for motion graphics. The card, the clips, and the
// page all say the same thing.

export const NAME = "fleetfizz";
export const SITE_URL = "https://fleetfizz.com";

export const TAGLINE = {
  lead: "Your machines, in sync.",
  rest: "One command, and every machine on your tailnet has the same tools, versions, and repos.",
};

// The light theme's ink, which is also the dark theme's background.
export const INK = "#0B0F05";
export const FIZZ = "#C5F82A";

// The one typeface, the family each renderer registers its font files under.
export const FONT = "JetBrains Mono";

// Three rising bubbles on a 20 unit square, filled with the brand color.
export const GLYPH = {
  box: 20,
  circles: [
    { cx: 6, cy: 14, r: 4 },
    { cx: 13, cy: 8, r: 3 },
    { cx: 16, cy: 2.6, r: 1.8 },
  ],
};
