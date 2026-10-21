// The Linux Fleet: three containers from fleet/compose.yaml (`start`, the
// Starting Machine, and `linux-b`, `linux-c`) plus Verdaccio. The mixed Fleet
// (mixed.ts) uses the same containers, with a Tart VM as its Starting
// Machine. Unless E2E_KEEP is set, they are torn down after the suite.
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { ChildProcessSpawner } from "effect/process";

import { exec, execOk } from "./exec.ts";
import { Fleet, sshKeys, type SshKeys } from "./fleet.ts";

const PROJECT = "fleetfizz-e2e";

export interface ContainerOptions {
  // Compose files over fleet/compose.yaml, and the variables they read.
  readonly overrides?: ReadonlyArray<string>;
  readonly env?: Readonly<Record<string, string>>;
  // The services to bring up; every one by default.
  readonly services?: ReadonlyArray<string>;
}

// Brings the containers up for the rest of the scope, and returns how to
// reach them from the host.
export const linuxContainers = Effect.fn("linuxContainers")(function* (
  keys: SshKeys,
  options: ContainerOptions = {},
) {
  const path = yield* Path.Path;
  // The returned methods run in the tests, outside this scope.
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const spawning = Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner);
  const dir = yield* path.fromFileUrl(new URL("../fleet", import.meta.url));
  const ghToken = yield* Config.String("GH_TOKEN").pipe(Config.withDefault(""));
  const keep = yield* Config.Boolean("E2E_KEEP").pipe(Config.withDefault(false));
  // Every command gets the same environment, so `up` never sees a changed
  // service and recreates a container.
  const env = {
    ...options.env,
    E2E_PUBLIC_KEY: keys.publicKey,
    E2E_PRIVATE_KEY: keys.privateKey,
    GH_TOKEN: ghToken,
  };
  const files = ["compose.yaml", ...(options.overrides ?? [])].flatMap((f) => [
    "-f",
    `${dir}/${f}`,
  ]);
  const args = (rest: ReadonlyArray<string>) => ["compose", ...files, "-p", PROJECT, ...rest];
  const compose = (rest: ReadonlyArray<string>) => spawning(execOk("docker", args(rest), { env }));
  const down = compose(["down", "--volumes", "--remove-orphans"]);

  // A run kept with E2E_KEEP leaves its Fleet up; start from nothing.
  yield* down;
  yield* Effect.acquireRelease(
    compose(["up", "--build", "--wait", ...(options.services ?? [])]),
    () => (keep ? Effect.void : Effect.ignore(down)),
  );

  return {
    // The host address and port a service's port is published on.
    published: (service: string, port: number) =>
      compose(["port", service, String(port)]).pipe(Effect.map((out) => out.trim())),
    run: (machine: string, script: string, stdin?: string) =>
      spawning(
        exec("docker", args(["exec", "-T", "-u", "fizz", machine, "bash", "-lc", script]), {
          env,
          ...(stdin === undefined ? {} : { stdin }),
        }),
      ),
    stop: (machine: string) => Effect.asVoid(compose(["stop", machine])),
    // `up --wait` rather than `start`, so sshd is up before the next Ship.
    resume: (machine: string) => Effect.asVoid(compose(["up", "--detach", "--wait", machine])),
  };
});

export const dockerFleet = Layer.effect(
  Fleet,
  Effect.gen(function* () {
    const containers = yield* linuxContainers(yield* sshKeys);
    const registry = yield* containers.published("verdaccio", 4873);
    return Fleet.of({
      machines: [
        { name: "start", platform: "linux" },
        { name: "linux-b", platform: "linux", ssh: "fizz@linux-b" },
        { name: "linux-c", platform: "linux", ssh: "fizz@linux-c" },
      ],
      registry: `http://${registry}/`,
      run: containers.run,
      stop: containers.stop,
      resume: containers.resume,
    });
  }),
);
