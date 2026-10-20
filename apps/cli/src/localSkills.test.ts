import { describe, expect, it } from "@effect/vitest";

import { agentIds, lockSkills } from "./localSkills.ts";

describe("lockSkills", () => {
  it("is the lock's GitHub skills, with their refs", () => {
    const lock = JSON.stringify({
      version: 3,
      skills: {
        "wait-what": { source: "mattpocock/skills", sourceType: "github", skillFolderHash: "a" },
        taste: { source: "Leonxlnx/taste-skill", sourceType: "github", ref: "v2" },
        mine: { source: "/Users/c/skills/mine", sourceType: "local" },
      },
    });
    expect(lockSkills(lock)).toEqual([
      { name: "taste", source: "Leonxlnx/taste-skill", ref: "v2" },
      { name: "wait-what", source: "mattpocock/skills" },
    ]);
  });

  it("is nothing for a lock the CLI no longer reads, or none", () => {
    expect(lockSkills(JSON.stringify({ version: 2, skills: {} }))).toEqual([]);
    expect(lockSkills("")).toEqual([]);
  });
});

describe("agentIds", () => {
  it("writes the display names skills ls gives as ids, once each", () => {
    const list = JSON.stringify([
      { name: "a", agents: ["Claude Code", "Codex"] },
      { name: "b", agents: ["Codex", "Roo Code"] },
    ]);
    expect(agentIds(list)).toEqual(["claude-code", "codex", "roo-code"]);
  });
});
