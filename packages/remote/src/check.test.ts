import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { encodeConfigRecord, shaOf } from "@fleetfizz/config";
import { assembleState } from "@fleetfizz/core";

import { checkScript } from "./check.ts";
import { parseLine } from "./protocol.ts";

// Runs the Check with `home` as HOME and returns the Machine's state.
const checkIn = (home: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const script = checkScript({
      scope: {
        machine: { name: "studio", platform: "darwin" },
        config: { version: "0.2.0", machines: ["studio"] },
      },
      providers: [],
    });
    const handle = yield* spawner.spawn(
      ChildProcess.make("/bin/sh", ["-c", script], {
        stdout: "pipe",
        stderr: "pipe",
        env: { HOME: home, XDG_CONFIG_HOME: `${home}/.config` },
        extendEnv: true,
      }),
    );
    const stdout = (yield* Stream.runCollect(Stream.decodeText(handle.stdout))).join("");
    return assembleState(
      stdout.split("\n").flatMap((line) => {
        const parsed = parseLine(line);
        return parsed.kind === "state" ? [parsed.fact] : [];
      }),
    );
  });

describe("checkScript", () => {
  it.effect("reports the config with the sha a Ship records for it, and its record", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const home = yield* fs.makeTempDirectoryScoped();
      const text = '{ "machines": ["studio"] } // ünïcode\n';
      const record = { ship: "2026-10-19T11-00-00Z-bluefin", sha: "x", reached: {} };
      yield* fs.makeDirectory(`${home}/.config/fleetfizz`, { recursive: true });
      yield* fs.writeFileString(`${home}/.config/fleetfizz/config.jsonc`, text);
      yield* fs.makeDirectory(`${home}/.local/state/fleetfizz/records`, { recursive: true });
      yield* fs.writeFileString(
        `${home}/.local/state/fleetfizz/records/config.json`,
        `${encodeConfigRecord(record)}\n`,
      );
      const state = yield* checkIn(home);
      expect(state.config).toEqual({ text, sha: yield* shaOf(text) });
      expect(state.configRecord).toEqual(record);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reports a symlinked config, working or dangling, and not its contents", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      for (const target of ["real.jsonc", "missing.jsonc"]) {
        const home = yield* fs.makeTempDirectoryScoped();
        const dir = `${home}/.config/fleetfizz`;
        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(`${home}/real.jsonc`, `{ "machines": ["studio"] }`);
        yield* fs.symlink(`${home}/${target}`, `${dir}/config.jsonc`);
        const state = yield* checkIn(home);
        expect(state.configLink).toBe(`${dir}/config.jsonc`);
        expect(state.config).toBeUndefined();
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
