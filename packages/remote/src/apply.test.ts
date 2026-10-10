import { describe, expect, it } from "@effect/vitest";

import type { MachinePlan, RepoStep } from "@fleetfizz/core";

import { applyScript, END_STEP } from "./apply.ts";
import { doneLine } from "./protocol.ts";

const repo = (over: Partial<RepoStep>): RepoStep => ({
  name: "skills",
  origin: "connorch/skills",
  ref: "main",
  pin: false,
  path: "~/clones/skills",
  expanded: "/Users/c/clones/skills",
  install: "pnpm install",
  files: {},
  outputs: [],
  decision: { run: true, reason: "never installed" },
  ...over,
});

const planOf = (over: Partial<MachinePlan>): MachinePlan => ({
  machine: { name: "studio", platform: "darwin" },
  vp: [],
  repos: [],
  questions: [],
  skipped: [],
  failures: [],
  ...over,
});

const script = (plan: MachinePlan) =>
  applyScript({
    plan,
    cloneRoot: "~/clones",
    env: { machine: "studio", platform: "darwin", machines: ["studio", "mbp"] },
  });

describe("applyScript", () => {
  it("runs the vp section before the repos and ends with the end marker", () => {
    const text = script(
      planOf({
        vp: [{ kind: "vp", from: "1.0.0", version: "1.1.0" }],
        repos: [repo({})],
      }),
    );
    expect(text.indexOf("vp upgrade '1.1.0'")).toBeLessThan(text.indexOf("git clone"));
    expect(text.trimEnd().split("\n").at(-1)).toBe(doneLine(END_STEP, true));
  });

  it("pins check out the commit detached; branches reset to origin", () => {
    const sha = "b517dd423fd19282898c33e43acb8eb67546ebab";
    const pinned = script(planOf({ repos: [repo({ ref: sha, pin: true })] }));
    expect(pinned).toContain(`checkout --quiet --detach '${sha}'`);
    expect(pinned).not.toContain("origin/");
    const branch = script(planOf({ repos: [repo({})] }));
    expect(branch).toContain("reset --quiet --hard 'origin/main'");
  });

  it("runs the Install Command in a login shell inside the clone, with the Fleet in its env", () => {
    const text = script(planOf({ repos: [repo({ install: "cargo build --release" })] }));
    expect(text).toContain(
      `(cd "$ff_d" && FLEETFIZZ_MACHINE='studio' FLEETFIZZ_PLATFORM='darwin' FLEETFIZZ_MACHINES='studio,mbp' "\${SHELL:-/bin/sh}" -lc 'cargo build --release')`,
    );
  });
});
