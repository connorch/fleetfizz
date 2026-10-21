// This Machine's own state directory, where a Ship writes its Ship Log, the
// saved Ledger, and the config's Install Record. Only its owner can read it:
// a Ship Log holds every line an Install Command printed.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { STATE_DIR } from "@fleetfizz/remote";

const stateDirectory = () => STATE_DIR.replace(/^~/, process.env.HOME ?? "~");

// Makes `dir`, the state directory or one inside it, then makes the state
// directory owner-only, every time, so an install from before it was is fixed
// by its next Ship.
export const makeStateDirectory = Effect.fn("makeStateDirectory")(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* fs.chmod(stateDirectory(), 0o700);
});
