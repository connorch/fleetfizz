import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { preludeFor, quote, quotePath } from "./shell.ts";

describe("quote", () => {
  it("single-quotes and escapes embedded quotes", () => {
    expect(quote("/Volumes/StudioStack SSD/fleet")).toBe("'/Volumes/StudioStack SSD/fleet'");
    expect(quote("it's")).toBe("'it'\\''s'");
  });
});

describe("quotePath", () => {
  it("expands a leading ~ on the remote and quotes the rest", () => {
    expect(quotePath("~")).toBe('"$HOME"');
    expect(quotePath("~/.local/share/fleet")).toBe("\"$HOME\"'/.local/share/fleet'");
    expect(quotePath("/abs/path")).toBe("'/abs/path'");
  });
});

describe("preludeFor", () => {
  it.effect("puts pnpm's Globals on PATH, before and from pnpm 11", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const home = yield* fs.makeTempDirectoryScoped();
      const path = yield* spawner.string(
        ChildProcess.make("/bin/sh", ["-c", `${preludeFor(undefined)}\nprintf '%s' "$PATH"`], {
          env: { HOME: home, PATH: "/usr/bin:/bin", PNPM_HOME: "" },
        }),
      );
      const pnpmHome =
        process.platform === "darwin" ? `${home}/Library/pnpm` : `${home}/.local/share/pnpm`;
      expect(path.split(":")).toEqual(expect.arrayContaining([pnpmHome, `${pnpmHome}/bin`]));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
