// Commands run on this Machine for what it has (`vp list`, `brew info`,
// `git ls-remote`), and whether a person is at the terminal to answer prompts.
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export interface Ran {
  readonly code: number;
  readonly stdout: string;
}

// Runs `command` with `args` and collects its output. A command that is not
// installed is code 127, as a shell reports it, so callers check one thing.
export const runLocal = Effect.fn("runLocal")(function* (
  command: string,
  args: ReadonlyArray<string>,
  env?: Readonly<Record<string, string>>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, [...args], {
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
        }),
      );
      const [stdout, , code] = yield* Effect.all(
        [
          Stream.runCollect(Stream.decodeText(handle.stdout)),
          Stream.runDrain(handle.stderr),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      return { code: code as number, stdout: stdout.join("") } satisfies Ran;
    }),
  ).pipe(Effect.orElseSucceed((): Ran => ({ code: 127, stdout: "" })));
});

// A person can answer prompts: both stdin and stdout are a terminal.
export const interactive = (): boolean =>
  Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

// `~/x` for a path under $HOME, so it names the same place on every Machine.
export const homeRelative = (path: string): string => {
  const home = process.env.HOME;
  if (home === undefined || home === "") return path;
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};

// The path on this Machine for one that may start with `~`.
export const expandHome = (path: string): string =>
  path === "~" || path.startsWith("~/") ? `${process.env.HOME ?? "~"}${path.slice(1)}` : path;
