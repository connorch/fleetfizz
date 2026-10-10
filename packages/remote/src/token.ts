// The Lent Token: the Starting Machine's gh token, lent to each Machine for
// one Ship so it can fetch private repos (ADR 0003). Read here, sent on stdin,
// never written anywhere.
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export interface LentToken {
  readonly token: string | undefined;
  // Why there is no token, for a one-line warning.
  readonly reason?: string;
}

export const readLentToken = Effect.fn("readLentToken")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const result: LentToken = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("gh", ["auth", "token"], { stdout: "pipe", stderr: "pipe" }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.runCollect(Stream.decodeText(handle.stdout)),
          Stream.runCollect(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      const token = stdout.join("").trim();
      if (exitCode !== 0 || token === "") {
        return {
          token: undefined,
          reason: stderr.join("").trim() || "gh auth token printed nothing",
        };
      }
      return { token };
    }),
  ).pipe(
    Effect.orElseSucceed((): LentToken => ({ token: undefined, reason: "gh is not installed" })),
  );
  return result;
});
