// The mixed Fleet, for `pnpm e2e:darwin` on a Mac with Tart and Docker: a
// throwaway Tart VM is two darwin Machines (`start`, the Starting Machine,
// and `mac-b`, as in darwin.ts), and the Linux containers `linux-b` and
// `linux-c` join them over Tart's bridge (fleet/compose.mixed.yaml). Nothing
// is installed on this Mac itself, and unless E2E_KEEP is set, the VM is
// deleted after the suite. It runs without a GitHub token, which would
// otherwise travel in `tart exec`'s argv.
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { macMachines, type OnMac } from "./darwin.ts";
import { linuxContainers } from "./docker.ts";
import { exec, execOk, succeeded } from "./exec.ts";
import { Fleet, sshKeys } from "./fleet.ts";

const IMAGE = "ghcr.io/cirruslabs/macos-tahoe-base:latest";
// The host's address on Tart's network, while a VM runs.
const BRIDGE = "192.168.64.1";
// The Linux Machines, and the port each one's sshd is published on.
const LINUX = { "linux-b": 2201, "linux-c": 2202 } as const;

export const mixedFleet = Layer.effect(
  Fleet,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const spawning = Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner);
    const keep = yield* Config.Boolean("E2E_KEEP").pipe(Config.withDefault(false));

    // The VM, booted for the rest of the scope.
    const vm = `fleetfizz-e2e-${yield* Clock.currentTimeMillis}`;
    yield* Effect.acquireRelease(execOk("tart", ["clone", IMAGE, vm]), () =>
      keep ? Effect.void : Effect.ignore(execOk("tart", ["delete", vm])),
    );
    yield* spawner.spawn(
      ChildProcess.make("tart", ["run", "--no-graphics", vm], {
        stdout: "ignore",
        stderr: "ignore",
      }),
    );
    const onMac: OnMac = (argv, stdin) =>
      spawning(exec("tart", ["exec", "-i", vm, ...argv], stdin === undefined ? {} : { stdin }));
    yield* onMac(["true"]).pipe(
      Effect.flatMap(succeeded("the VM's guest agent")),
      Effect.retry({ times: 90, schedule: Schedule.spaced("2 seconds") }),
    );

    // The containers, once the VM is up: their ports bind to its bridge.
    const keys = yield* sshKeys;
    const containers = yield* linuxContainers(keys, {
      overrides: ["compose.mixed.yaml"],
      env: {
        E2E_BRIDGE: BRIDGE,
        E2E_LINUX_B_PORT: String(LINUX["linux-b"]),
        E2E_LINUX_C_PORT: String(LINUX["linux-c"]),
      },
      services: ["verdaccio", ...Object.keys(LINUX)],
    });
    const registry = `http://${yield* containers.published("verdaccio", 4873)}/`;

    const privateKeyPath = "/Users/admin/.ssh/fleetfizz-e2e";
    yield* onMac(
      ["sh", "-c", `mkdir -p ~/.ssh && umask 077 && cat > ${privateKeyPath}`],
      keys.privateKey,
    ).pipe(Effect.flatMap(succeeded("writing the Starting Machine's key")));
    const mac = yield* macMachines(onMac, {
      publicKey: keys.publicKey,
      privateKeyPath,
      registry,
      // The image's Homebrew Node.
      nodeDir: "/opt/homebrew/opt/node@24",
    });

    const isLinux = (machine: string) => Object.hasOwn(LINUX, machine);
    return Fleet.of({
      machines: [
        mac.machines[0],
        mac.machines[1],
        ...Object.entries(LINUX).map(([name, port]) => ({
          name,
          platform: "linux" as const,
          ssh: `-i ${privateKeyPath} -p ${port} fizz@${BRIDGE}`,
        })),
      ],
      sshToStart: mac.sshToStart,
      registry,
      run: (machine, script, stdin) =>
        isLinux(machine) ? containers.run(machine, script, stdin) : mac.run(machine, script, stdin),
      stop: (machine) => (isLinux(machine) ? containers.stop(machine) : mac.stop),
      resume: (machine) => (isLinux(machine) ? containers.resume(machine) : mac.resume),
    });
  }),
);
