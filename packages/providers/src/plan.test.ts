import { describe, expect, it } from "@effect/vitest";

import type { FleetConfig } from "@fleetfizz/config";
import { assembleState, planMachine, type MachineIdentity, type PlanInput } from "@fleetfizz/core";

import { PROVIDERS } from "./index.ts";

const config: FleetConfig = {
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

const SKILLS_HEAD = "abc1234000000000000000000000000000000000";
const SKILLS_TIP = "def5678000000000000000000000000000000000";

const resolved: PlanInput["resolved"] = {
  vp: {
    "vite-plus": ["1.0.0", "1.1.0"],
    node: ["24.18.1", "24.19.0"],
    vercel: ["58.0.0", "59.25.4", "59.30.0", "60.1.0"],
    "inngest-cli": ["1.45.1"],
    skills: ["1.5.7", "1.7.0"],
  },
  repos: { "connorch-skills": { commit: SKILLS_TIP } },
};

const MACBOOK: MachineIdentity = { name: "connors-macbook-pro", platform: "darwin" };
const ROOT = "/Users/connor/.local/share/fleetfizz/clones";

type Global = { name: string; version: string; platform?: { node?: string } };

// A MacBook Pro before its first Ship: old vp, old Globals, nothing cloned.
const facts = (over: {
  vp?: { version: string; path: string } | null;
  globals?: ReadonlyArray<Global>;
  rootPresent?: boolean;
  rootPath?: string;
  repos?: ReadonlyArray<unknown>;
  records?: ReadonlyArray<unknown>;
}) => {
  const vp =
    over.vp === undefined
      ? { version: "1.0.0-rc.0", path: "/Users/connor/.vite-plus/bin/vp" }
      : over.vp;
  return assembleState([
    { fact: "home", path: "/Users/connor" },
    ...(vp === null
      ? [{ provider: "vp", fact: "vp", version: null }]
      : [
          { provider: "vp", fact: "vp", ...vp },
          { provider: "vp", fact: "node", version: "24.18.1" },
          {
            provider: "vp",
            fact: "globals",
            list: over.globals ?? [
              { name: "vercel", version: "58.0.0", platform: { node: "24.18.1" } },
              { name: "skills", version: "1.7.0", platform: { node: "22.0.0" } },
            ],
          },
        ]),
    {
      provider: "repos",
      fact: "cloneRoot",
      path: over.rootPath ?? ROOT,
      present: over.rootPresent ?? true,
    },
    ...(over.repos ?? []),
    ...(over.records ?? []),
    { fact: "end" },
  ]);
};

const plan = (over: {
  state?: ReturnType<typeof facts>;
  machine?: MachineIdentity;
  answers?: Readonly<Record<string, string>>;
  rebuild?: ReadonlyArray<string>;
  resolved?: PlanInput["resolved"];
  config?: FleetConfig;
}) =>
  planMachine({
    providers: PROVIDERS,
    state: over.state ?? facts({}),
    resolved: over.resolved ?? resolved,
    ctx: {
      machine: over.machine ?? MACBOOK,
      config: over.config ?? config,
      self: "0.2.0",
      rebuild: (a) => over.rebuild?.includes(a) ?? false,
      answer: (kind, subject) => over.answers?.[`${kind}:${subject}`],
    },
  });

const provider = (result: ReturnType<typeof plan>, name: string) => {
  const found = result.providers.find((p) => p.name === name);
  if (found === undefined) throw new Error(`no ${name} plan`);
  return found;
};
const stepIds = (result: ReturnType<typeof plan>) =>
  result.providers.flatMap((p) => p.steps.map((s) => s.id));

describe("the vp Provider", () => {
  it("brings the vp section into line", () => {
    const vp = provider(plan({}), "vp");
    expect(vp.decisions).toEqual([
      expect.objectContaining({ kind: "change", item: "vp", from: "1.0.0-rc.0", to: "1.1.0" }),
      { kind: "leave", item: "node", at: "24.18.1" },
      expect.objectContaining({ kind: "change", item: "vercel", from: "58.0.0", to: "59.30.0" }),
      expect.objectContaining({ kind: "change", item: "inngest-cli", to: "1.45.1" }),
      expect.objectContaining({
        kind: "change",
        item: "skills",
        reason: "installed on Node 22.0.0",
      }),
      expect.objectContaining({ kind: "change", item: "fleetfizz", to: "0.2.0" }),
    ]);
    expect(vp.steps.map((s) => [s.id, s.items])).toEqual([
      ["vp:vp:upgrade", ["vp"]],
      ["vp:skills:reinstall", ["skills"]],
      ["vp:globals:install", ["vercel", "inngest-cli", "fleetfizz"]],
    ]);
    expect(vp.steps[2]?.run).toEqual([
      "( command vp install -g 'vercel@59.30.0' 'inngest-cli@1.45.1' 'fleetfizz@0.2.0' )",
    ]);
  });

  it("pins fleetfizz to the running version, and refuses to downgrade a newer one", () => {
    const self = (version: string) =>
      provider(
        plan({
          state: facts({
            globals: [{ name: "fleetfizz", version, platform: { node: "24.18.1" } }],
          }),
        }),
        "vp",
      ).decisions.find((d) => d.item === "fleetfizz");
    expect(self("0.1.0")).toMatchObject({ kind: "change", from: "0.1.0", to: "0.2.0" });
    expect(self("0.2.0")).toEqual({ kind: "leave", item: "fleetfizz", at: "0.2.0" });
    expect(self("0.3.0")).toMatchObject({
      kind: "fail",
      reason: expect.stringContaining("upgrade here first"),
    });
  });

  it("bootstraps vp on a bare Machine in one step, then plans the whole section", () => {
    const result = plan({ state: facts({ vp: null }) });
    const vp = provider(result, "vp");
    expect(vp.steps.map((s) => s.id)).toEqual([
      "vp:vp:install",
      "vp:node:default",
      "vp:globals:install",
    ]);
    // In the main shell, so the PATH change reaches later steps.
    expect(vp.steps[0]?.run[0]).toMatch(
      /^curl -fsSL https:\/\/vite\.plus \| bash && .* && command vp upgrade '1\.1\.0'$/,
    );
    expect(vp.steps[2]?.items).toEqual(["vercel", "inngest-cli", "skills", "fleetfizz"]);
  });

  it("bootstraps vp without the registry when any version will do", () => {
    const vp = provider(
      plan({
        state: facts({ vp: null }),
        config: { machines: config.machines },
        resolved: { vp: {}, repos: {} },
      }),
      "vp",
    );
    expect(vp.decisions[0]).toMatchObject({ kind: "change", item: "vp", to: "latest" });
    expect(vp.steps[0]?.run[0]).not.toContain("vp upgrade");
  });

  it("asks about a Global above its Range, and honors answers", () => {
    const state = facts({
      globals: [{ name: "vercel", version: "60.1.0", platform: { node: "24.18.1" } }],
    });
    const vercel = (answers?: Readonly<Record<string, string>>) =>
      provider(plan({ state, ...(answers === undefined ? {} : { answers }) }), "vp").decisions.find(
        (d) => d.item === "vercel",
      );
    expect(vercel()).toMatchObject({
      kind: "ask",
      question: {
        kind: "range",
        subject: "vp:vercel",
        found: "60.1.0",
        default: "skip",
        bump: { path: ["vp", "globals", "vercel"], range: "^59.25.4" },
      },
    });
    expect(vercel({ "range:vp:vercel": "skip" })).toEqual({
      kind: "skip",
      item: "vercel",
      at: "60.1.0",
      reason: "is above ^59.25.4",
    });
    expect(vercel({ "range:vp:vercel": "downgrade" })).toMatchObject({
      kind: "change",
      from: "60.1.0",
      to: "59.30.0",
    });
  });

  it("fails a Homebrew vp instead of running vp upgrade, holding back repos", () => {
    const result = plan({
      state: facts({ vp: { version: "1.0.0", path: "/opt/homebrew/bin/vp" } }),
    });
    expect(provider(result, "vp").decisions[0]).toMatchObject({
      kind: "fail",
      reason: expect.stringContaining("brew upgrade vite-plus"),
    });
    const repos = provider(result, "repos");
    expect(repos.steps).toEqual([]);
    expect(repos.decisions.map((d) => [d.kind, d.kind === "skip" ? d.reason : undefined])).toEqual([
      ["skip", "depends on vp"],
      ["skip", "depends on vp"],
    ]);
  });
});

describe("the repos Provider", () => {
  const skillsClone = (head: string) => ({
    provider: "repos",
    fact: "repo",
    name: "connorch-skills",
    present: true,
    head,
    origin: "https://github.com/connorch/skills.git",
  });
  const skillsRecord = (commit: string) => ({
    fact: "record",
    provider: "repos",
    item: "connorch-skills",
    record: {
      commit,
      path: `${ROOT}/connorch-skills`,
      install: "pnpm install",
      files: {},
      outputs: {},
    },
  });

  it("plans a first fetch and install for every targeted repo", () => {
    const repos = provider(plan({}), "repos");
    expect(repos.decisions).toEqual([
      expect.objectContaining({
        kind: "change",
        item: "connorch-skills",
        to: "def5678",
        reason: "never installed",
      }),
      expect.objectContaining({
        kind: "change",
        item: "kitlangton-psychopomp",
        to: "b517dd4",
        reason: "never installed",
      }),
    ]);
    expect(repos.steps.map((s) => s.id)).toEqual([
      "repos:connorch-skills:fetch",
      "repos:connorch-skills:install",
      "repos:kitlangton-psychopomp:fetch",
      "repos:kitlangton-psychopomp:install",
    ]);
    // A branch resets to the commit resolved for this Ship.
    expect(repos.steps[0]?.run).toContain(`  git -C "$ff_d" reset --quiet --hard '${SKILLS_TIP}'`);
  });

  it("leaves a repo whose record matches, and reinstalls on --rebuild", () => {
    const state = facts({ repos: [skillsClone(SKILLS_TIP)], records: [skillsRecord(SKILLS_TIP)] });
    expect(provider(plan({ state }), "repos").decisions[0]).toEqual({
      kind: "leave",
      item: "connorch-skills",
      at: "def5678",
    });
    expect(
      provider(plan({ state, rebuild: ["repos:connorch-skills"] }), "repos").decisions[0],
    ).toMatchObject({ kind: "change", reason: "--rebuild" });
  });

  it("refetches a new commit, and a clone moved off its recorded commit", () => {
    const behind = facts({
      repos: [skillsClone(SKILLS_HEAD)],
      records: [skillsRecord(SKILLS_HEAD)],
    });
    expect(provider(plan({ state: behind }), "repos").decisions[0]).toMatchObject({
      kind: "change",
      from: "abc1234",
      to: "def5678",
      reason: "new commit def5678",
    });
    const moved = facts({ repos: [skillsClone(SKILLS_HEAD)], records: [skillsRecord(SKILLS_TIP)] });
    expect(provider(plan({ state: moved }), "repos").decisions[0]).toMatchObject({
      kind: "change",
      reason: "checked out at abc1234",
    });
  });

  it("fails repos when the Clone Root is not mounted, without touching vp", () => {
    const result = plan({
      machine: { name: "connors-mac-studio", platform: "darwin" },
      state: facts({ rootPath: "/Volumes/StudioStack SSD/fleetfizz/clones", rootPresent: false }),
    });
    expect(provider(result, "repos").decisions.map((d) => d.kind)).toEqual(["fail", "fail"]);
    expect(provider(result, "vp").steps.length).toBeGreaterThan(0);
  });

  it("creates a missing Clone Root under ~ instead of failing", () => {
    const repos = provider(plan({ state: facts({ rootPresent: false }) }), "repos");
    expect(repos.decisions.map((d) => d.kind)).toEqual(["change", "change"]);
    expect(repos.steps[0]?.run).toContain(`mkdir -p "$ff_root"`);
  });

  it("fails a branch that could not be resolved", () => {
    const repos = provider(
      plan({
        resolved: {
          ...resolved,
          repos: { "connorch-skills": { error: "no branch main on origin" } },
        },
      }),
      "repos",
    );
    expect(repos.decisions[0]).toMatchObject({ kind: "fail", reason: "no branch main on origin" });
  });

  it("applies Targeting per Platform", () => {
    const linux = plan({ machine: { name: "bluefin", platform: "linux" } });
    expect(provider(linux, "repos").decisions.map((d) => d.item)).toEqual(["connorch-skills"]);
    expect(stepIds(linux)).not.toContain("repos:kitlangton-psychopomp:fetch");
  });
});
