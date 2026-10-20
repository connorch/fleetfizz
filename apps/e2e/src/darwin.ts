// The darwin Fleet: one Mac as two Machines. The user running the suite is
// the Starting Machine, `start`, and a second user, m2, is `mac-b`, reached
// over ssh to localhost (fleet/darwin-setup.sh). Verdaccio runs as a Node
// process, since a GitHub macOS runner has no Docker. Only for a throwaway
// Mac: it refuses to run unless E2E_THROWAWAY is set.
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { E2EError, exec, execOk } from "./exec.ts";
import { Fleet, sshKeys } from "./fleet.ts";

const REGISTRY = "http://127.0.0.1:4873/";
const REMOTE_USER = "m2";

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
        {
          cwd: storage,
          stdout: "ignore",
          stderr: "ignore",
        },
      ),
    );
    yield* execOk("curl", ["--silent", "--fail", `${REGISTRY}-/ping`]).pipe(
      Effect.retry({ times: 120, schedule: Schedule.spaced("1 second") }),
    );

    const keys = yield* sshKeys;
    yield* execOk(
      "sudo",
      [
        "--preserve-env=E2E_PUBLIC_KEY,E2E_REGISTRY,E2E_NODE_DIR",
        "sh",
        `${fleetDir}/darwin-setup.sh`,
      ],
      {
        env: {
          E2E_PUBLIC_KEY: keys.publicKey,
          E2E_REGISTRY: REGISTRY,
          E2E_NODE_DIR: path.dirname(path.dirname(process.execPath)),
        },
      },
    );

    const authorizedKeys = `/Users/${REMOTE_USER}/.ssh/authorized_keys`;
    return Fleet.of({
      machines: [
        { name: "start", platform: "darwin" },
        {
          name: "mac-b",
          platform: "darwin",
          ssh: `-i ${keys.privateKeyPath} ${REMOTE_USER}@localhost`,
        },
      ],
      registry: REGISTRY,
      run: (machine, script, stdin) =>
        spawning(
          machine === "start"
            ? // As a Mac user's own Terminal would: zsh, a login shell.
              exec("/bin/zsh", ["-lc", script], {
                env: { SHELL: "/bin/zsh" },
                ...(stdin === undefined ? {} : { stdin }),
              })
            : exec(
                "sudo",
                ["-u", REMOTE_USER, "-H", "/bin/zsh", "-lc", script],
                stdin === undefined ? {} : { stdin },
              ),
        ),
      // Without its key, ssh to m2 fails with 255, as to a Machine that is off.
      stop: () =>
        spawning(Effect.asVoid(execOk("sudo", ["mv", authorizedKeys, `${authorizedKeys}.off`]))),
      resume: () =>
        spawning(Effect.asVoid(execOk("sudo", ["mv", `${authorizedKeys}.off`, authorizedKeys]))),
    });
  }),
);
