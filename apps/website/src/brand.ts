// The brand, in one place: the copy the hero and the page's metadata share,
// and the glyph's geometry. packages/og-image imports this to render the
// share image and the favicons, so the card says what the page says.

export const NAME = "fleetfizz";
export const SITE_URL = "https://fleetfizz.com";

export const TAGLINE = {
  lead: "Your machines, in sync.",
  rest: "One command, and every machine on your tailnet has the same tools, versions, and repos.",
};

// The light theme's ink, which is also the dark theme's background.
export const INK = "#0B0F05";
export const FIZZ = "#C5F82A";

// Three rising bubbles on a 20 unit square, filled with the brand color.
export const GLYPH = {
  box: 20,
  circles: [
    { cx: 6, cy: 14, r: 4 },
    { cx: 13, cy: 8, r: 3 },
    { cx: 16, cy: 2.6, r: 1.8 },
  ],
};
