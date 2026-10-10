// Runs a generated script on one Machine: `tailscale ssh <name> <script>` for
// a remote Machine, `$SHELL -c <script>` on the Starting Machine. The script
// travels in argv and carries no secrets; secrets go on stdin, one per line,
// in a fixed order. Output is streamed line by line so the caller can parse
// markers as they arrive (ADR 0001).
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

// `tailscale ssh` exits 255 when it cannot connect or the policy denies the
// login. Past that, exit codes mean nothing on macOS: the remote command's
// failure is reported as 0, so only markers count.
export const SSH_UNREACHABLE = 255;

export interface Target {
  readonly name: string;
  // The Starting Machine runs scripts locally, without ssh.
  readonly local: boolean;
}

export class SpawnError extends Schema.TaggedError<SpawnError>()("SpawnError", {
  machine: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.machine}: could not start ${this.reason}`;
  }
}

const command = (target: Target, script: string, secrets: ReadonlyArray<string>) => {
  const stdin = Stream.encodeText(Stream.make(secrets.map((s) => `${s}\n`).join("")));
  const options = { stdin, stdout: "pipe", stderr: "pipe" } as const;
  return target.local
    ? ChildProcess.make(process.env.SHELL ?? "/bin/sh", ["-c", script], options)
    : ChildProcess.make("tailscale", ["ssh", target.name, script], options);
};

// Runs `script` on `target`, calling `onLine` for every output line (stdout
// and stderr interleaved), and returns the exit code.
export const runScript = Effect.fn("runScript")(function* <E, R>(
  target: Target,
  script: string,
  secrets: ReadonlyArray<string>,
  onLine: (line: string) => Effect.Effect<void, E, R>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(command(target, script, secrets)).pipe(
        Effect.mapError(
          (e) =>
            new SpawnError({
              machine: target.name,
              reason: `${target.local ? "a local shell" : "tailscale ssh"}: ${e.message}`,
            }),
        ),
      );
      const [, exitCode] = yield* Effect.all(
        [
          handle.all.pipe(Stream.decodeText, Stream.splitLines, Stream.runForEach(onLine)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      );
      return exitCode as number;
    }),
  );
});
