import { describe, expect, it } from "@effect/vitest";

import { expandHome, plan, type PlanInput } from "./plan.ts";
import { emptyState, type MachineState } from "./state.ts";

const config: PlanInput["config"] = {
  machines: {
    "connors-mac-studio": { clones: "/Volumes/StudioStack SSD/fleetfizz/clones" },
    "connors-macbook-pro": {},
    bluefin: {},
  },
  repos: [
    { origin: "connorch/skills", ref: "main", install: "pnpm install" },
    {
      origin: "kitlangton/psychopomp",
      ref: "b517dd423fd19282898c33e43acb8eb67546ebab",
      install: "cargo build --release",
      platforms: ["darwin"],
      outputs: ["~/.local/share/psychopomp"],
    },
  ],
  vp: {
    version: "1.1.0",
    node: "24.18.1",
    globals: { vercel: "^59.25.4", "inngest-cli": "^1.45.1", skills: "^1.7.0" },
  },
};

const versions = {
  "vite-plus": ["1.0.0", "1.1.0"],
  node: ["24.18.1", "24.19.0"],
  vercel: ["58.0.0", "59.25.4", "59.30.0", "60.1.0"],
  "inngest-cli": ["1.45.1"],
  skills: ["1.5.7", "1.7.0"],
};

// A MacBook Pro before its first Ship: old vp, old Globals, nothing cloned.
const macbook: MachineState = {
  ...emptyState,
  complete: true,
  home: "/Users/connor",
  vp: { version: "1.0.0-rc.0", path: "/Users/connor/.vite-plus/bin/vp" },
  node: "24.18.1",
  globals: [
    { name: "vercel", version: "58.0.0", platform: { node: "24.18.1" } },
    { name: "skills", version: "1.7.0", platform: { node: "22.0.0" } },
  ],
  cloneRoot: { path: "/Users/connor/.local/share/fleetfizz/clones", present: true },
};

const input = (over: Partial<PlanInput>): PlanInput => ({
  config,
  machine: { name: "connors-macbook-pro", platform: "darwin" },
  state: macbook,
  self: "0.2.0",
  versions,
  rebuild: "none",
  answers: {},
  ...over,
});

describe("plan", () => {
  it("brings the vp section into line", () => {
    const result = plan(input({}));
    expect(result.vp).toEqual([
      { kind: "vp", from: "1.0.0-rc.0", version: "1.1.0" },
      { kind: "reinstall", name: "skills", version: "1.7.0" },
      {
        kind: "globals",
        packages: [
          { name: "vercel", from: "58.0.0", version: "59.30.0" },
          { name: "inngest-cli", version: "1.45.1" },
          { name: "fleetfizz", version: "0.2.0" },
        ],
      },
    ]);
    expect(result.questions).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("pins fleetfizz to the running version, and refuses to downgrade a newer one", () => {
    const withSelf = (version: string): MachineState => ({
      ...macbook,
      globals: [...macbook.globals, { name: "fleetfizz", version, platform: { node: "24.18.1" } }],
    });
    const globalsOf = (state: MachineState) =>
      plan(input({ state })).vp.flatMap((s) => (s.kind === "globals" ? s.packages : []));
    expect(globalsOf(withSelf("0.1.0"))).toContainEqual({
      name: "fleetfizz",
      from: "0.1.0",
      version: "0.2.0",
    });
    expect(globalsOf(withSelf("0.2.0")).some((g) => g.name === "fleetfizz")).toBe(false);
    const newer = plan(input({ state: withSelf("0.3.0") }));
    expect(newer.vp.flatMap((s) => (s.kind === "globals" ? s.packages : []))).not.toContainEqual(
      expect.objectContaining({ name: "fleetfizz" }),
    );
    expect(newer.failures[0]?.reason).toContain("upgrade here first");
  });

  it("bootstraps vp on a bare Machine, then plans the whole vp section", () => {
    const bare: MachineState = { ...emptyState, complete: true, home: "/Users/connor" };
    const result = plan(input({ state: bare }));
    expect(result.vp[0]).toEqual({ kind: "bootstrap" });
    expect(result.vp[1]).toEqual({ kind: "vp", from: null, version: "1.1.0" });
    expect(result.vp[2]).toEqual({ kind: "node", from: null, version: "24.18.1" });
    expect(result.vp[3]).toEqual({
      kind: "globals",
      packages: [
        { name: "vercel", version: "59.30.0" },
        { name: "inngest-cli", version: "1.45.1" },
        { name: "skills", version: "1.7.0" },
        { name: "fleetfizz", version: "0.2.0" },
      ],
    });
    expect(result.failures).toEqual([]);
  });

  it("plans a first install for every targeted repo", () => {
    const result = plan(input({}));
    expect(result.repos.map((r) => [r.name, r.pin, r.expanded, r.decision])).toEqual([
      [
        "connorch-skills",
        false,
        "/Users/connor/.local/share/fleetfizz/clones/connorch-skills",
        { run: true, reason: "never installed" },
      ],
      [
        "kitlangton-psychopomp",
        true,
        "/Users/connor/.local/share/fleetfizz/clones/kitlangton-psychopomp",
        { run: true, reason: "never installed" },
      ],
    ]);
  });

  it("asks about a Global above its Range, and honors answers", () => {
    const state = {
      ...macbook,
      globals: [{ name: "vercel", version: "60.1.0", platform: { node: "24.18.1" } }],
    };
    expect(plan(input({ state })).questions).toEqual([
      { machine: "connors-macbook-pro", package: "vercel", installed: "60.1.0", range: "^59.25.4" },
    ]);
    const skipped = plan(input({ state, answers: { vercel: "skip" } }));
    expect(skipped.questions).toEqual([]);
    expect(skipped.skipped).toEqual([{ what: "vercel", reason: "60.1.0 is above ^59.25.4" }]);
    const downgraded = plan(input({ state, answers: { vercel: "downgrade" } }));
    expect(downgraded.vp.find((s) => s.kind === "globals")).toEqual({
      kind: "globals",
      packages: [
        { name: "vercel", from: "60.1.0", version: "59.30.0" },
        { name: "inngest-cli", version: "1.45.1" },
        { name: "skills", version: "1.7.0" },
        { name: "fleetfizz", version: "0.2.0" },
      ],
    });
  });

  it("fails repos when the Clone Root is not mounted, without touching vp", () => {
    const studio = plan(
      input({
        machine: { name: "connors-mac-studio", platform: "darwin" },
        state: {
          ...macbook,
          cloneRoot: { path: "/Volumes/StudioStack SSD/fleetfizz/clones", present: false },
        },
      }),
    );
    expect(studio.repos).toEqual([]);
    expect(studio.failures.map((f) => f.what)).toEqual([
      "connorch-skills",
      "kitlangton-psychopomp",
    ]);
    expect(studio.vp.length).toBeGreaterThan(0);
  });

  it("creates a missing Clone Root under ~ instead of failing", () => {
    const result = plan(
      input({
        state: {
          ...macbook,
          cloneRoot: { path: "/Users/connor/.local/share/fleetfizz/clones", present: false },
        },
      }),
    );
    expect(result.failures).toEqual([]);
    expect(result.repos).toHaveLength(2);
  });

  it("fails a Homebrew vp instead of running vp upgrade", () => {
    const result = plan(
      input({ state: { ...macbook, vp: { version: "1.0.0", path: "/opt/homebrew/bin/vp" } } }),
    );
    expect(result.vp.find((s) => s.kind === "vp")).toBeUndefined();
    expect(result.failures[0]?.reason).toContain("brew upgrade vite-plus");
  });

  it("applies Targeting per Platform", () => {
    const linux = plan(input({ machine: { name: "bluefin", platform: "linux" } }));
    expect(linux.repos.map((r) => r.name)).toEqual(["connorch-skills"]);
  });

  it("skips repos whose record matches and reinstalls on --rebuild", () => {
    const state: MachineState = {
      ...macbook,
      repos: {
        "connorch-skills": {
          present: true,
          head: "abc1234000000000000000000000000000000000",
          origin: "https://github.com/connorch/skills.git",
        },
      },
      records: {
        "connorch-skills": {
          commit: "abc1234000000000000000000000000000000000",
          path: "/Users/connor/.local/share/fleetfizz/clones/connorch-skills",
          install: "pnpm install",
          files: {},
          outputs: {},
        },
      },
    };
    expect(plan(input({ state })).repos[0]?.decision).toEqual({ run: false });
    expect(plan(input({ state, rebuild: ["connorch-skills"] })).repos[0]?.decision).toEqual({
      run: true,
      reason: "--rebuild",
    });
  });
});

describe("expandHome", () => {
  it("expands only a leading ~", () => {
    expect(expandHome("~/x", "/Users/c")).toBe("/Users/c/x");
    expect(expandHome("~", "/Users/c")).toBe("/Users/c");
    expect(expandHome("/a/~/b", "/Users/c")).toBe("/a/~/b");
  });
});
