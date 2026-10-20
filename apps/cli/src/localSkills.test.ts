import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { localSkills } from "./localSkills.ts";

// localSkills with `lock` as the CLI's lock, under a temporary XDG_STATE_HOME.
const withLock = (lock: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const state = yield* fs.makeTempDirectoryScoped();
    yield* fs.makeDirectory(`${state}/skills`);
    yield* fs.writeFileString(`${state}/skills/.skill-lock.json`, lock);
    const before = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = state;
    return yield* localSkills().pipe(
      Effect.ensuring(Effect.sync(() => (process.env.XDG_STATE_HOME = before))),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("localSkills", () => {
  it.effect("is the lock's GitHub skills the config can name, with their refs", () =>
    Effect.gen(function* () {
      const skills = yield* withLock(`{
        "version": 3,
        "skills": {
          "wait-what": { "source": "mattpocock/skills", "sourceType": "github", "skillFolderHash": "a" },
          "taste": { "source": "Leonxlnx/taste-skill", "sourceType": "github", "ref": "v2" },
          "mine": { "source": "/Users/c/skills/mine", "sourceType": "local" },
          "Convex Best Practices": { "source": "get-convex/agent-skills", "sourceType": "github" }
        }
      }`);
      expect(skills).toEqual([
        { name: "taste", source: "Leonxlnx/taste-skill", ref: "v2" },
        { name: "wait-what", source: "mattpocock/skills" },
      ]);
    }),
  );

  it.effect("is nothing for a lock the CLI no longer reads", () =>
    Effect.gen(function* () {
      expect(yield* withLock(`{ "version": 2, "skills": {} }`)).toEqual([]);
    }),
  );
});
