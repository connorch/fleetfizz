// Runs a command on the host the suite runs on (docker, ssh-keygen, git,
// pnpm), with its stdout and stderr interleaved as one output.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export class E2EError extends Schema.TaggedError<E2EError>()("E2EError", {
  message: Schema.String,
}) {}

export interface Ran {
  readonly exitCode: number;
  readonly output: string;
}

export interface ExecOptions {
  readonly stdin?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

export const exec = Effect.fn("exec")(
  function* (command: string, args: ReadonlyArray<string>, options: ExecOptions = {}) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, args, {
        stdin: Stream.encodeText(Stream.make(options.stdin ?? "")),
        stdout: "pipe",
        stderr: "pipe",
        extendEnv: true,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      }),
    );
    const [output, exitCode] = yield* Effect.all(
      [Stream.runCollect(Stream.decodeText(handle.all)), handle.exitCode],
      { concurrency: "unbounded" },
    );
    const ran: Ran = { exitCode, output: output.join("") };
    return ran;
  },
  Effect.scoped,
  (effect, command) =>
    Effect.mapError(effect, (e) => new E2EError({ message: `${command}: ${e.message}` })),
);

// The output of a command that must succeed.
export const execOk = Effect.fn("execOk")(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: ExecOptions = {},
) {
  const ran = yield* exec(command, args, options);
  if (ran.exitCode !== 0)
    return yield* new E2EError({
      message: `${[command, ...args].join(" ")} exited with ${ran.exitCode}:\n${ran.output}`,
    });
  return ran.output;
});

// The output of a command run elsewhere (on a Machine, in a VM) that must
// succeed.
export const succeeded =
  (what: string) =>
  (ran: Ran): Effect.Effect<string, E2EError> =>
    ran.exitCode === 0
      ? Effect.succeed(ran.output)
      : Effect.fail(
          new E2EError({ message: `${what} exited with ${ran.exitCode}:\n${ran.output}` }),
        );
