// The Linux Fleet: three containers from fleet/compose.yaml (`start`, the
// Starting Machine, and `linux-b`, `linux-c`) plus Verdaccio. The layer brings
// it up and, unless E2E_KEEP is set, tears it down after the suite.
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { ChildProcessSpawner } from "effect/process";

import { exec, execOk, type ExecOptions } from "./exec.ts";
import { Fleet, sshKeys } from "./fleet.ts";

const PROJECT = "fleetfizz-e2e";

export const dockerFleet = Layer.effect(
  Fleet,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    // The service's methods run in the tests, outside this layer.
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const spawning = Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner);
    const file = yield* path.fromFileUrl(new URL("../fleet/compose.yaml", import.meta.url));
    const keys = yield* sshKeys;
    const ghToken = yield* Config.String("GH_TOKEN").pipe(Config.withDefault(""));
    const keep = yield* Config.Boolean("E2E_KEEP").pipe(Config.withDefault(false));
    // Every command gets the same environment, so `up` never sees a changed
    // service and recreates a container.
    const env = {
      E2E_PUBLIC_KEY: keys.publicKey,
      E2E_PRIVATE_KEY: keys.privateKey,
      GH_TOKEN: ghToken,
    };
    const args = (rest: ReadonlyArray<string>) => ["compose", "-f", file, "-p", PROJECT, ...rest];
    const compose = (rest: ReadonlyArray<string>, options: ExecOptions = {}) =>
      execOk("docker", args(rest), { ...options, env });
    const down = compose(["down", "--volumes", "--remove-orphans"]);

    // A run kept with E2E_KEEP leaves its Fleet up; start from nothing.
    yield* down;
    yield* Effect.acquireRelease(compose(["up", "--build", "--wait"]), () =>
      keep ? Effect.void : Effect.ignore(down),
    );
    const port = (yield* compose(["port", "verdaccio", "4873"])).trim().split(":").at(-1);

    return Fleet.of({
      machines: [
        { name: "start", platform: "linux" },
        { name: "linux-b", platform: "linux", ssh: "fizz@linux-b" },
        { name: "linux-c", platform: "linux", ssh: "fizz@linux-c" },
      ],
      registry: `http://127.0.0.1:${port}/`,
      run: (machine, script, stdin) =>
        spawning(
          exec("docker", args(["exec", "-T", "-u", "fizz", machine, "bash", "-lc", script]), {
            env,
            ...(stdin === undefined ? {} : { stdin }),
          }),
        ),
      stop: (machine) => spawning(Effect.asVoid(compose(["stop", machine]))),
      // `up --wait` rather than `start`, so sshd is up before the next Ship.
      resume: (machine) => spawning(Effect.asVoid(compose(["up", "--detach", "--wait", machine]))),
    });
  }),
);
