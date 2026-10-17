import "./fonts";
import { Composition } from "remotion";
import { logo } from "./motion/logo";

// Every motion graphic, one Composition each. A graphic module exports its
// component and its frame, so adding one is one import and one entry here.
const MOTION = [logo];

export const Root = () => (
  <>
    {MOTION.map(({ id, ...composition }) => (
      <Composition key={id} id={id} {...composition} />
    ))}
  </>
);
