import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { saveConfig } from "@fleetfizz/config";

import { fileEntry, fileName, parseSpec, rangeEntry, targetingOf } from "./configAdd.tsx";
import { pathOf } from "./configEdit.tsx";

describe("the entry an add writes", () => {
  it("is the shorthand without Targeting, and the object with it", () => {
    expect(rangeEntry("*", targetingOf({ platforms: [], machines: [] }))).toBe("*");
    expect(rangeEntry("*", targetingOf({ platforms: ["linux", "linux"], machines: [] }))).toEqual({
      range: "*",
      platforms: ["linux"],
    });
    expect(fileEntry("~/.zshrc", [], {})).toBe("~/.zshrc");
    expect(fileEntry("~/.config/k", ["backups"], {})).toEqual({
      path: "~/.config/k",
      exclude: ["backups"],
    });
  });
});

describe("parseSpec", () => {
  it("splits a Range off a package, scoped or not", () => {
    expect(parseSpec("vercel")).toEqual({ name: "vercel" });
    expect(parseSpec("vercel@^59")).toEqual({ name: "vercel", range: "^59" });
    expect(parseSpec("@posthog/cli")).toEqual({ name: "@posthog/cli" });
    expect(parseSpec("@posthog/cli@^0.18.9")).toEqual({ name: "@posthog/cli", range: "^0.18.9" });
  });
});

describe("fileName", () => {
  it("is the last segment without a leading dot, in a name's letters", () => {
    expect(fileName("~/.gitconfig")).toBe("gitconfig");
    expect(fileName("~/.config/karabiner/")).toBe("karabiner");
    expect(fileName("~/Library/Application Support")).toBe("Application-Support");
  });
});

describe("pathOf", () => {
  it("finds an Item, and vp's settings by their Item names", () => {
    expect(pathOf("brew", "tmux")).toEqual(["brew", "items", "tmux"]);
    expect(pathOf("vp", "vp")).toEqual(["vp", "version"]);
    expect(pathOf("vp", "pnpm")).toEqual(["vp", "pnpm"]);
    expect(pathOf("vp", "vercel")).toEqual(["vp", "items", "vercel"]);
    expect(pathOf("nope", "x")).toBeUndefined();
  });
});

describe("saveConfig", () => {
  it.effect("writes through a symlink, so the link stays a link", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(`${dir}/real.jsonc`, `{ "machines": ["a"] }`);
      yield* fs.symlink(`${dir}/real.jsonc`, `${dir}/config.jsonc`);
      yield* saveConfig(`${dir}/config.jsonc`, `{ "machines": ["b"] }`);
      expect(yield* fs.readLink(`${dir}/config.jsonc`)).toBe(`${dir}/real.jsonc`);
      expect(yield* fs.readFileString(`${dir}/real.jsonc`)).toBe(`{ "machines": ["b"] }`);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
