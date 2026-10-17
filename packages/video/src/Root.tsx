import "./fonts";
import { Composition } from "remotion";
import { fallInLine } from "./motion/fall-in-line";

// Every motion graphic, one Composition per render. A graphic module exports
// its compositions (one per site theme when its colors are baked in), so
// adding one is one import and one spread here.
const MOTION = [...fallInLine];

export const Root = () => (
  <>
    {MOTION.map(({ id, ...composition }) => (
      <Composition key={id} id={id} {...composition} />
    ))}
  </>
);
