import { describe, expect, it } from "@effect/vitest";

import type { MachinePlan, RepoStep } from "@fleetfizz/core";

import { applyScript, CONFIG_STEP, END_STEP } from "./apply.ts";
import { doneLine, stepLine } from "./protocol.ts";

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
  it("reads three stdin lines, then config, vp, repos, and the end marker in order", () => {
    const text = script(
      planOf({
        vp: [{ kind: "bootstrap" }, { kind: "vp", from: null, version: "1.1.0" }],
        repos: [repo({})],
      }),
    );
    const at = (needle: string) => {
      const index = text.indexOf(needle);
      expect(index, needle).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at("read -r ff_token")).toBeLessThan(at("read -r ff_config"));
    expect(at("read -r ff_config")).toBeLessThan(at("read -r ff_schema"));
    expect(at("read -r ff_schema")).toBeLessThan(at(stepLine(CONFIG_STEP)));
    expect(at(stepLine(CONFIG_STEP))).toBeLessThan(at("https://vite.plus"));
    expect(at("https://vite.plus")).toBeLessThan(at("vp upgrade '1.1.0'"));
    expect(at("vp upgrade '1.1.0'")).toBeLessThan(at("git clone"));
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
