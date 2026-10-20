// The darwin Fleet: one Mac as two Machines. The user running the suite is
// the Starting Machine, `start`, and a second user, m2, is `mac-b`, reached
// over ssh to localhost (fleet/darwin-setup.sh). Verdaccio runs as a Node
// process, since a GitHub macOS runner has no Docker. Only for a throwaway
// Mac: it refuses to run unless E2E_THROWAWAY is set. The mixed Fleet
// (mixed.ts) makes a Tart VM the same two Machines.
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { E2EError, exec, execOk, succeeded, type Ran } from "./exec.ts";
import { Fleet, type FleetMachine, sshKeys } from "./fleet.ts";

const REMOTE_USER = "m2";

// Runs a command on the Mac that holds the darwin Machines, as the user who
// is the Starting Machine there: this Mac, or a Tart VM.
export type OnMac = (
  argv: readonly [string, ...ReadonlyArray<string>],
  stdin?: string,
) => Effect.Effect<Ran, E2EError>;

export interface MacSetup {
  readonly publicKey: string;
  // The Starting Machine's private key, on that Mac.
  readonly privateKeyPath: string;
  // The Fleet's Verdaccio, as that Mac reaches it.
  readonly registry: string;
  // A Node 24 install on that Mac.
  readonly nodeDir: string;
}

// Makes a Mac two Machines with fleet/darwin-setup.sh, and returns them and
// how to reach them.
export const macMachines = Effect.fn("macMachines")(function* (onMac: OnMac, setup: MacSetup) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const script = yield* fs.readFileString(
    yield* path.fromFileUrl(new URL("../fleet/darwin-setup.sh", import.meta.url)),
  );
  yield* onMac([
    "sudo",
    "env",
    `E2E_PUBLIC_KEY=${setup.publicKey}`,
    `E2E_REGISTRY=${setup.registry}`,
    `E2E_NODE_DIR=${setup.nodeDir}`,
    // In argv rather than on stdin, which a command in it could read.
    "sh",
    "-c",
    script,
    "darwin-setup.sh",
  ]).pipe(Effect.flatMap(succeeded("darwin-setup.sh")));

  const authorizedKeys = `/Users/${REMOTE_USER}/.ssh/authorized_keys`;
  const move = (from: string, to: string) =>
    onMac(["sudo", "mv", from, to]).pipe(Effect.flatMap(succeeded(`mv ${from}`)), Effect.asVoid);
  const machines: readonly [FleetMachine, FleetMachine] = [
    { name: "start", platform: "darwin" },
    {
      name: "mac-b",
      platform: "darwin",
      ssh: `-i ${setup.privateKeyPath} ${REMOTE_USER}@localhost`,
    },
  ];
  return {
    machines,
    run: (machine: string, script: string, stdin?: string) =>
      machine === "start"
        ? // As a Mac user's own Terminal would: zsh, a login shell.
          onMac(["env", "SHELL=/bin/zsh", "/bin/zsh", "-lc", script], stdin)
        : onMac(["sudo", "-u", REMOTE_USER, "-H", "/bin/zsh", "-lc", script], stdin),
    // Without its key, ssh to m2 fails with 255, as to a Machine that is off.
    stop: move(authorizedKeys, `${authorizedKeys}.off`),
    resume: move(`${authorizedKeys}.off`, authorizedKeys),
  };
});

const REGISTRY = "http://127.0.0.1:4873/";

export const darwinFleet = Layer.effect(
  Fleet,
  Effect.gen(function* () {
    if (!(yield* Config.Boolean("E2E_THROWAWAY").pipe(Config.withDefault(false))))
      return yield* new E2EError({
        message:
          "the darwin Fleet adds a user and turns on Remote Login: set E2E_THROWAWAY=1, and only on a throwaway Mac",
      });
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const spawning = Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner);
    const fleetDir = yield* path.fromFileUrl(new URL("../fleet", import.meta.url));

    // Verdaccio, with the Linux Fleet's config and its storage in a temporary
    // directory, up until the suite ends.
    const storage = yield* fs.makeTempDirectoryScoped();
    const config = (yield* fs.readFileString(`${fleetDir}/verdaccio.yaml`)).replaceAll(
      "/verdaccio/storage",
      storage,
    );
    yield* fs.writeFileString(`${storage}/config.yaml`, config);
    yield* spawner.spawn(
      ChildProcess.make(
        "npx",
        ["--yes", "verdaccio@6", "--config", `${storage}/config.yaml`, "--listen", REGISTRY],
        { cwd: storage, stdout: "ignore", stderr: "ignore" },
      ),
    );
    yield* execOk("curl", ["--silent", "--fail", `${REGISTRY}-/ping`]).pipe(
      Effect.retry({ times: 120, schedule: Schedule.spaced("1 second") }),
    );

    const keys = yield* sshKeys;
    const mac = yield* macMachines(
      ([command, ...args], stdin) =>
        spawning(exec(command, args, stdin === undefined ? {} : { stdin })),
      {
        publicKey: keys.publicKey,
        privateKeyPath: keys.privateKeyPath,
        registry: REGISTRY,
        nodeDir: path.dirname(path.dirname(process.execPath)),
      },
    );
    return Fleet.of({
      machines: mac.machines,
      registry: REGISTRY,
      run: mac.run,
      stop: () => mac.stop,
      resume: () => mac.resume,
    });
  }),
);
