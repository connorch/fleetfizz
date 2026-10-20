// fizz runs the version its config names (ADR 0019). Before any command reads
// the config, a fizz of another version, older or newer, installs that one
// with the package manager that installed it and runs the command again with
// it, so one Ship's logic is always one version's. `fizz self-update` moves
// the config to another version the same way.
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  configPath,
  PACKAGE_MANAGERS,
  readVersion,
  saveConfig,
  SELF_PACKAGE,
  setVersion,
} from "@fleetfizz/config";
import { installerOf, installWith, MANAGERS } from "@fleetfizz/providers";

import { homeRelative, runLocal } from "./local.ts";

export class VersionError extends Schema.TaggedError<VersionError>()("VersionError", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

// Set on the fizz a switch runs, so it never switches again.
const SWITCHED = "FLEETFIZZ_SWITCHED";

// The package manager that installed the running fizz, from the path it was
// started at and the file behind it.
const ownInstaller = Effect.fn("ownInstaller")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const main = process.argv[1] ?? "";
  const real = yield* fs.realPath(main).pipe(Effect.orElseSucceed(() => main));
  return { at: main, installer: installerOf([main, real]) };
});

// Runs `command` with this terminal, for its exit code.
const runHere = Effect.fn("runHere")(function* (
  command: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>> = {},
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, [...args], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          env: { ...process.env, ...env },
        }),
      );
      return (yield* handle.exitCode) as number;
    }),
  ).pipe(Effect.orElseSucceed(() => 127));
});

// Installs fleetfizz@`version` with the package manager that installed this fizz.
const install = Effect.fn("install")(function* (version: string, why: string) {
  const { at, installer } = yield* ownInstaller();
  const spec = `${SELF_PACKAGE}@${version}`;
  if (installer === undefined)
    return yield* new VersionError({
      reason: `${why}, and this fizz (${at}) was not installed by ${PACKAGE_MANAGERS.join(", ")}: install ${spec} yourself`,
    });
  yield* Console.error(`${why}: installing ${spec} with ${installer}`);
  const code = yield* runHere("sh", ["-c", installWith(installer, [spec])]);
  if (code !== 0)
    return yield* new VersionError({
      reason: `could not install ${spec} with ${installer}; run ${MANAGERS[installer].install} ${spec}`,
    });
});

// Runs `effect` only when this fizz is the version the config at `flag` (or
// the default path) names. Otherwise installs that version and runs this
// command again with it, exiting with its code. A config that is missing is
// left for the command to report.
export const atConfigVersion = <A, E, R>(
  flag: string | undefined,
  running: string,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = flag ?? configPath(process.env);
    if (!(yield* fs.exists(path))) return yield* effect;
    const wanted = readVersion(yield* fs.readFileString(path));
    if (wanted === undefined)
      return yield* new VersionError({
        reason: `${homeRelative(path)} has no "version": add "version": "${running}"`,
      });
    if (wanted === running) return yield* effect;
    if (process.env[SWITCHED] !== undefined)
      return yield* new VersionError({
        reason: `${homeRelative(path)} needs fleetfizz ${wanted}, but the fizz on PATH is still ${running} after installing it; see which fizz comes first (command -v fizz)`,
      });
    yield* install(wanted, `${homeRelative(path)} needs fleetfizz ${wanted}, not ${running}`);
    process.exitCode = yield* runHere("fizz", process.argv.slice(2), { [SWITCHED]: wanted });
  });

// The newest published fleetfizz.
const latest = Effect.fn("latest")(function* () {
  const ran = yield* runLocal("npm", ["view", SELF_PACKAGE, "version"]);
  const version = ran.stdout.trim();
  if (ran.code !== 0 || version === "")
    return yield* new VersionError({
      reason: `could not read the newest ${SELF_PACKAGE} from npm; give a version: fizz self-update 1.2.3`,
    });
  return version;
});

// `fizz self-update [version]`: the config's `version`, then this Machine.
export const selfUpdate = Effect.fn("selfUpdate")(function* (input: {
  readonly config: string | undefined;
  readonly version: string | undefined;
  readonly running: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = input.config ?? configPath(process.env);
  if (!(yield* fs.exists(path)))
    return yield* new VersionError({
      reason: `no config at ${homeRelative(path)}; run fizz init to write one, or pass --config`,
    });
  const version = input.version ?? (yield* latest());
  if (version === input.running) {
    yield* Console.log(`fleetfizz ${version} already`);
    return;
  }
  const edited = setVersion(yield* fs.readFileString(path), version);
  if ("reason" in edited) return yield* new VersionError({ reason: edited.reason });
  yield* saveConfig(path, edited.text);
  yield* install(version, `${homeRelative(path)} now names fleetfizz ${version}`);
  yield* Console.log(`fleetfizz ${version} here. Run fizz ship to update every Machine.`);
});
