import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import type { MachinePlan, ProviderPlan } from "@fleetfizz/core";

import { applyScript, applyStdin } from "./apply.ts";
import { parseLine } from "./protocol.ts";

const provider = (over: Partial<ProviderPlan> & Pick<ProviderPlan, "name">): ProviderPlan => ({
  rule: "range",
  dependsOn: [],
  decisions: [],
  steps: [],
  ...over,
});

const planOf = (providers: ReadonlyArray<ProviderPlan>): MachinePlan => ({
  machine: { name: "studio", platform: "darwin" },
  providers,
});

// Runs the script in sh with a throwaway config dir; returns its markers.
const run = (plan: MachinePlan) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make("/bin/sh", ["-c", applyScript(plan)], {
        stdin: Stream.encodeText(Stream.make(`${applyStdin(undefined, "{}", "{}").join("\n")}\n`)),
        stdout: "pipe",
        stderr: "pipe",
        env: { XDG_CONFIG_HOME: yield* fs.makeTempDirectoryScoped() },
        extendEnv: true,
      }),
    );
    const stdout = yield* Stream.runCollect(Stream.decodeText(handle.stdout));
    return markers(stdout.join(""));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const markers = (stdout: string) =>
  stdout
    .split("\n")
    .map(parseLine)
    .flatMap((line) =>
      line.kind === "step"
        ? [`step ${line.id}`]
        : line.kind === "done"
          ? [`${line.done.ok ? "ok" : "failed"} ${line.done.id}`]
          : line.kind === "skip"
            ? [`skipped ${line.skip.id}: ${line.skip.reason}`]
            : [],
    );

describe("applyScript", () => {
  it.effect("copies the config, runs each Provider's Steps in order, and ends", () =>
    Effect.gen(function* () {
      const markers = yield* run(
        planOf([
          provider({
            name: "vp",
            steps: [{ id: "vp:vp:upgrade", items: ["vp"], doing: "upgrading", run: ["true"] }],
          }),
          provider({
            name: "repos",
            dependsOn: ["vp"],
            steps: [{ id: "repos:x:fetch", items: ["x"], doing: "fetching", run: ["true"] }],
          }),
        ]),
      );
      expect(markers).toEqual([
        "step config",
        "ok config",
        "step vp:vp:upgrade",
        "ok vp:vp:upgrade",
        "step repos:x:fetch",
        "ok repos:x:fetch",
        "ok end",
      ]);
    }),
  );

  it.effect(
    "skips a failed Item's later Steps, and every Step of a Provider that depends on it",
    () =>
      Effect.gen(function* () {
        const markers = yield* run(
          planOf([
            provider({
              name: "vp",
              steps: [
                { id: "vp:vp:bootstrap", items: ["vp"], doing: "installing", run: ["false"] },
                { id: "vp:node:default", items: ["node"], doing: "installing", run: ["true"] },
                { id: "vp:vp:upgrade", items: ["vp"], doing: "upgrading", run: ["true"] },
              ],
            }),
            provider({
              name: "repos",
              dependsOn: ["vp"],
              steps: [{ id: "repos:x:fetch", items: ["x"], doing: "fetching", run: ["true"] }],
            }),
          ]),
        );
        expect(markers).toEqual([
          "step config",
          "ok config",
          "step vp:vp:bootstrap",
          "failed vp:vp:bootstrap",
          "step vp:node:default",
          "ok vp:node:default",
          "skipped vp:vp:upgrade: an earlier step failed",
          "skipped repos:x:fetch: depends on vp",
          "ok end",
        ]);
      }),
  );
});
