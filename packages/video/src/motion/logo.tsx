import { FIZZ, GLYPH } from "@fleetfizz/brand-assets";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

// A placeholder: the glyph's bubbles rise into place one after another, the
// biggest first, then hold. It plays once on the page, so the last frame is
// the resting logo.

const STAGGER = 6;

function Logo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <svg viewBox={`0 0 ${GLYPH.box} ${GLYPH.box}`} fill={FIZZ}>
      {GLYPH.circles.map((c, i) => {
        const t = spring({ frame: frame - i * STAGGER, fps, config: { damping: 12 } });
        // Each bubble grows from a point while it rises the last two units.
        return <circle key={c.cx} cx={c.cx} cy={c.cy + 2 * (1 - t)} r={c.r * t} />;
      })}
    </svg>
  );
}

export const logo = {
  id: "logo",
  component: Logo,
  durationInFrames: 60,
  fps: 60,
  width: 512,
  height: 512,
};
