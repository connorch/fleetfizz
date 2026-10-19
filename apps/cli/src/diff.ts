// Shows a Question's diff: `git diff --no-index` between the two sides a
// Provider wrote, on the terminal itself, so the user's own pager and colors
// apply. Its output never passes through fleetfizz, so it never reaches the
// Ledger or the Ship Log.
import * as Effect from "effect/Effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

// git's exit code: 0 when the sides are the same, 1 when they differ.
export const showDiff = Effect.fn("showDiff")(function* (
  dir: string,
  sides: { readonly old: string; readonly new: string },
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("git", ["diff", "--no-index", "--", sides.old, sides.new], {
          cwd: dir,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }),
      );
      return yield* handle.exitCode;
    }),
  );
});
